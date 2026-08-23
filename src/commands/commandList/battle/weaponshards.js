/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');
const ranks = [
	['common', 'cw', 'commonweapons', 'commonweapon'],
	['uncommon', 'uw', 'uncommonweapons', 'uncommonweapon'],
	['rare', 'rw', 'rareweapon', 'rareweapons'],
	['epic', 'ew', 'epicweapons', 'epicweapon'],
	[
		'mythic',
		'mythical',
		'mw',
		'mythicalweapons',
		'mythicalweapon',
		'mythicweapons',
		'mythicweapon',
	],
	['legendary', 'lw', 'legendaryweapons', 'legendaryweapon'],
	['fabled', 'fable', 'fw', 'fabledweapons', 'fabledweapon', 'fableweapons', 'fableweapon'],
];
const shardEmoji = '<:weaponshard:655902978712272917>';
const dismantleEmoji = '🔨';
const weaponUtil = require('./util/weaponUtil.js');
const WeaponInterface = require('./WeaponInterface.js');

module.exports = new CommandInterface({
	alias: ['weaponshard', 'ws', 'weaponshards', 'dismantle'],

	args: '',

	desc: '',

	example: [''],

	related: ['owo weapon'],

	permissions: ['sendMessages', 'embedLinks', 'addReactions'],

	group: ['animals'],

	cooldown: 5000,
	half: 80,
	six: 500,
	bot: true,

	execute: async function (p) {
		if (!p.args.length) {
			await displayWeaponShards(p);
		} else {
			let arg = p.args[0].toLowerCase();
			for (let i in ranks) {
				if (ranks[i].includes(arg)) {
					await dismantleRank(p, i);
					return;
				}
			}
			await dismantleId(p, arg);
		}
	},
});

async function displayWeaponShards(p) {
	const uid = await p.global.getUid(p.msg.author.id);
	const shardsCollection = await p.mongo.collection('shards');
	const result = await shardsCollection.findOne({ uid });
	const shards = p.global.toFancyNum(result?.count || 0);
	p.replyMsg(shardEmoji, `, you currently have **${shards}** Weapon Shards!`);
}

async function buildWeaponRows(p, weaponRows) {
	if (!weaponRows.length) return [];
	const uwids = weaponRows.map((weapon) => weapon.uwid);
	const passiveCollection = await p.mongo.collection('user_weapon_passive');
	const trackerCollection = await p.mongo.collection('user_weapon_kills');
	const passiveRows = await passiveCollection
		.find({ uwid: { $in: uwids } })
		.sort({ uwid: 1, pcount: 1 })
		.toArray();
	const trackerRows = await trackerCollection.find({ uwid: { $in: uwids } }).toArray();
	const passiveMap = new Map();
	const trackerMap = new Map();
	for (const passive of passiveRows) {
		if (!passiveMap.has(passive.uwid)) passiveMap.set(passive.uwid, []);
		passiveMap.get(passive.uwid).push(passive);
	}
	for (const tracker of trackerRows) trackerMap.set(tracker.uwid, tracker);

	const rows = [];
	for (const weapon of weaponRows) {
		const tracker = trackerMap.get(weapon.uwid);
		const base = {
			id: String(p.msg.author.id),
			uwid: weapon.uwid,
			wid: weapon.wid,
			stat: weapon.stat,
			wear: weapon.wear || 0,
			rrcount: weapon.rrcount || 0,
			rrattempt: weapon.rrattempt || 0,
			favorite: weapon.favorite || 0,
			pid: weapon.pid,
			tt: tracker ? weapon.uwid : null,
			kills: tracker?.kills || 0,
		};
		const passives = passiveMap.get(weapon.uwid) || [];
		if (!passives.length) rows.push(base);
		else {
			for (const passive of passives) {
				rows.push({
					...base,
					pcount: passive.pcount,
					wpid: passive.wpid,
					pstat: passive.stat,
				});
			}
		}
	}
	return rows;
}

async function dismantleWeapons(p, uid, uwids, shardCount) {
	if (!uwids.length) return 0;
	const session = await p.mongo.startSession();
	try {
		session.startTransaction();
		const weapons = await p.mongo.collection('user_weapon');
		const passives = await p.mongo.collection('user_weapon_passive');
		const trackers = await p.mongo.collection('user_weapon_kills');
		const shards = await p.mongo.collection('shards');

		await passives.deleteMany({ uwid: { $in: uwids } }, { session });
		await trackers.deleteMany({ uwid: { $in: uwids } }, { session });
		const deleted = await weapons.deleteMany(
			{ uid, uwid: { $in: uwids }, pid: null },
			{ session }
		);
		if (!deleted.deletedCount) {
			await session.abortTransaction();
			return 0;
		}
		const totalShards = shardCount * deleted.deletedCount;
		await shards.updateOne({ uid }, { $inc: { count: totalShards } }, { upsert: true, session });
		await session.commitTransaction();
		return totalShards;
	} catch (err) {
		if (session.inTransaction()) await session.abortTransaction();
		throw err;
	} finally {
		await session.endSession();
	}
}

async function dismantleRank(p, rankLoc) {
	let min = 0,
		max = 0;
	for (let i = 0; i <= rankLoc; i++) {
		let rank = WeaponInterface.ranks[i];
		min = max;
		max += rank[0];
	}
	min *= 100;
	max *= 100;
	let lastRank = rankLoc == WeaponInterface.ranks.length - 1;

	const uid = await p.global.getUid(p.msg.author.id);
	const filter = {
		uid,
		avg: { [min === 0 ? '$gte' : '$gt']: min },
		pid: null,
		favorite: { $ne: 1 },
	};
	if (!lastRank) filter.avg.$lte = max;
	const weaponsCollection = await p.mongo.collection('user_weapon');
	const weaponDocs = await weaponsCollection.find(filter).limit(500).toArray();
	if (!weaponDocs.length) {
		p.errorMsg(', you do not have any weapons with this rank!', 3000);
		return;
	}

	const rows = await buildWeaponRows(p, weaponDocs);
	const parsed = weaponUtil.parseWeaponQuery(rows);
	let weaponEmojis = [];
	let uwids = [];
	const shardPrice = weaponUtil.shardPrices[WeaponInterface.ranks[rankLoc][1]];
	const rank = WeaponInterface.ranks[rankLoc][2] + ' **' + WeaponInterface.ranks[rankLoc][1] + '**';
	for (const key in parsed) {
		const weapon = weaponUtil.parseWeapon(parsed[key]);
		if (weapon && !weapon.unsellable) {
			weaponEmojis.push(weapon.emoji);
			uwids.push(weapon.ruwid);
		}
	}

	if (!uwids.length) {
		p.errorMsg(', you do not have any weapons with this rank!', 3000);
		return;
	}
	if (!shardPrice) {
		p.errorMsg(', Something went terribly wrong...');
		return;
	}

	const price = await dismantleWeapons(p, uid, uwids, shardPrice);
	if (!price) {
		p.errorMsg(', you do not have a weapon with this id!', 3000);
		return;
	}

	p.replyMsg(
		dismantleEmoji,
		`, You dismantled all of your ${rank} weapons for **${price}** ${shardEmoji} WeaponShards!\n${
			p.config.emoji.blank
		} **| Dismantled:** ${weaponEmojis.join('')}`
	);
	p.logger.incr('shards', price, { type: 'dismantle' }, p.msg);
}

async function dismantleId(p, uwid) {
	uwid = weaponUtil.expandUWID(uwid);
	if (!uwid) {
		p.errorMsg(', you do not have a weapon with this id!', 3000);
		return;
	}

	const uid = await p.global.getUid(p.msg.author.id);
	const weaponsCollection = await p.mongo.collection('user_weapon');
	const weaponDoc = await weaponsCollection.findOne({ uid, uwid });
	if (!weaponDoc) {
		p.errorMsg(', you do not have a weapon with this id!', 3000);
		return;
	}
	if (weaponDoc.pid != null) {
		p.errorMsg(', please unequip the weapon to dismantle it!', 3000);
		return;
	}

	const rows = await buildWeaponRows(p, [weaponDoc]);
	const parsed = weaponUtil.parseWeaponQuery(rows);
	const key = Object.keys(parsed)[0];
	const weapon = key ? weaponUtil.parseWeapon(parsed[key]) : null;
	if (!weapon) {
		p.errorMsg(', you do not have a weapon with this id!', 3000);
		return;
	}
	if (weapon.unsellable) {
		p.errorMsg(', This weapon cannot be dismantled!');
		return;
	}
	if (weapon.favorite) {
		p.errorMsg(', unfavorite this weapon to sell!');
		return;
	}

	const shardPrice = weaponUtil.shardPrices[weapon.rank.name];
	if (!shardPrice) {
		p.errorMsg(', Something went terribly wrong...');
		return;
	}

	const price = await dismantleWeapons(p, uid, [uwid], shardPrice);
	if (!price) {
		p.errorMsg(', you do not have a weapon with this id!', 3000);
		return;
	}

	p.replyMsg(
		dismantleEmoji,
		`, You dismantled a(n) **${weapon.rank.name} ${weapon.name}**  ${weapon.rank.emoji}${
			weapon.emoji
		} for **${p.global.toFancyNum(price)}** ${shardEmoji} Weapon Shard${price == 1 ? '' : 's'}!`
	);
	p.logger.incr('shards', price, { type: 'dismantle' }, p.msg);
}
