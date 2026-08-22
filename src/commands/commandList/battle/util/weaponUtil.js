/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const WeaponInterface = require('../WeaponInterface.js');
const teamUtil = require('./teamUtil.js');
const animalUtil = require('../../zoo/animalUtil.js');
const alterWeapon = require('../../patreon/alterWeapon.js');
const alterWeaponDisplay = require('../../patreon/alterWeaponDisplay.js');
const global = require('../../../../utils/global.js');
const mongo = require('../../../../utils/mongo.js');
const mongoNumeric = require('../../../../utils/mongoNumeric.js');

WeaponInterface.setWeaponUtil(this);
teamUtil.setWeaponUtil(this);

const prices = {
	Common: 100,
	Uncommon: 250,
	Rare: 400,
	Epic: 600,
	Mythical: 5000,
	Legendary: 15000,
	Fabled: 50000,
};
exports.shardPrices = {
	Common: 1,
	Uncommon: 3,
	Rare: 5,
	Epic: 25,
	Mythical: 300,
	Legendary: 1000,
	Fabled: 5000,
};
const ranks = [
	['cw', 'commonweapons', 'commonweapon'],
	['uw', 'uncommonweapons', 'uncommonweapon'],
	['rw', 'rareweapon', 'rareweapons'],
	['ew', 'epicweapons', 'epicweapon'],
	['mw', 'mythicalweapons', 'mythicalweapon', 'mythicweapons', 'mythicweapon'],
	['lw', 'legendaryweapons', 'legendaryweapon'],
	['fw', 'fabledweapons', 'fabledweapon', 'fableweapons', 'fableweapon'],
];

const weaponEmoji = '🗡';
const weaponPerPage = 15;
const nextPageEmoji = '➡️';
const prevPageEmoji = '⬅️';
const rewindEmoji = '⏪';
const fastForwardEmoji = '⏩';

/* All weapons */
let weapons = {};
let availableWeapons = {};
setTimeout(() => {
	weapons = WeaponInterface.weapons;
	for (let key in weapons) {
		let weapon = weapons[key];
		if (!weapon.disabled) availableWeapons[key] = weapon;
	}
}, 0);

async function getUserUid(id) {
	const users = await mongo.collection('user');
	const user = await users.findOne({ id: String(id) }, { projection: { uid: 1 } });
	return user?.uid;
}

function uniqueValues(values) {
	return [...new Set(values.filter((value) => value !== null && value !== undefined))];
}

async function hydrateWeaponRows(weaponDocs) {
	if (!weaponDocs?.length) return [];

	const uwids = uniqueValues(weaponDocs.map((weapon) => weapon.uwid));
	const uids = uniqueValues(weaponDocs.map((weapon) => weapon.uid));
	const pids = uniqueValues(weaponDocs.map((weapon) => weapon.pid));
	const passiveCollection = await mongo.collection('user_weapon_passive');
	const killCollection = await mongo.collection('user_weapon_kills');
	const animalCollection = await mongo.collection('animal');
	const userCollection = await mongo.collection('user');

	const [passives, kills, animals, users] = await Promise.all([
		uwids.length ? passiveCollection.find({ uwid: { $in: uwids } }).toArray() : [],
		uwids.length ? killCollection.find({ uwid: { $in: uwids } }).toArray() : [],
		pids.length ? animalCollection.find({ pid: { $in: pids } }).toArray() : [],
		uids.length
			? userCollection.find({ uid: { $in: uids } }, { projection: { uid: 1, id: 1 } }).toArray()
			: [],
	]);

	const passivesByWeapon = new Map();
	for (const passive of passives) {
		const key = String(passive.uwid);
		if (!passivesByWeapon.has(key)) passivesByWeapon.set(key, []);
		passivesByWeapon.get(key).push(passive);
	}
	for (const list of passivesByWeapon.values()) {
		list.sort((a, b) => Number(a.pcount || 0) - Number(b.pcount || 0));
	}

	const killsByWeapon = new Map(kills.map((kill) => [String(kill.uwid), kill]));
	const animalsByPid = new Map(animals.map((animal) => [String(animal.pid), animal]));
	const usersByUid = new Map(users.map((user) => [String(user.uid), String(user.id)]));
	const rows = [];

	for (const weapon of weaponDocs) {
		const key = String(weapon.uwid);
		const animal =
			weapon.pid === null || weapon.pid === undefined
				? null
				: animalsByPid.get(String(weapon.pid));
		const tracker = killsByWeapon.get(key);
		const base = {
			id: usersByUid.get(String(weapon.uid)),
			uwid: weapon.uwid,
			wid: weapon.wid,
			stat: String(weapon.stat || ''),
			rrcount: Number(weapon.rrcount || 0),
			rrattempt: Number(weapon.rrattempt || 0),
			wear: Number(weapon.wear || 0),
			favorite: Number(weapon.favorite || 0),
			pid: weapon.pid ?? null,
			tt: tracker ? weapon.uwid : null,
			kills: Number(tracker?.kills || 0),
			name: animal?.name,
			nickname: animal?.nickname,
		};
		const weaponPassives = passivesByWeapon.get(key) || [];
		if (!weaponPassives.length) {
			rows.push(base);
			continue;
		}
		for (const passive of weaponPassives) {
			rows.push({
				...base,
				pcount: Number(passive.pcount || 0),
				wpid: passive.wpid,
				pstat: String(passive.stat || ''),
			});
		}
	}
	return rows;
}

function buildWeaponFilter(uid, wid, widList) {
	const filter = { uid };
	const requested = wid !== undefined && wid !== null ? [wid] : widList;
	if (requested?.length) {
		const values = requested.map((value) => Number(value)).filter(Number.isFinite);
		if (values.length) filter.wid = { $in: values };
	}
	return filter;
}

function weaponSort(sort) {
	switch (sort) {
		case 'rarity':
			return { avg: -1, uwid: -1 };
		case 'type':
			return { wid: -1, avg: -1, uwid: -1 };
		case 'equipped':
			return { pid: -1, uwid: -1 };
		case 'favorite':
			return { favorite: -1, avg: -1, uwid: -1 };
		case 'wear':
			return { wear: -1, avg: -1, uwid: -1 };
		default:
			return { uwid: -1 };
	}
}

async function removeWeaponsAndCredit(p, uid, candidateUwids, priceEach) {
	candidateUwids = uniqueValues(candidateUwids.map(Number).filter(Number.isFinite));
	if (!candidateUwids.length) return { count: 0, total: 0, uwids: [] };

	const session = await mongo.startSession();
	try {
		session.startTransaction();
		const weaponsCollection = await mongo.collection('user_weapon');
		const passivesCollection = await mongo.collection('user_weapon_passive');
		const killsCollection = await mongo.collection('user_weapon_kills');
		const cowoncyCollection = await mongo.collection('cowoncy');
		const current = await weaponsCollection
			.find(
				{ uid, uwid: { $in: candidateUwids }, pid: null, favorite: { $ne: 1 } },
				{ session, projection: { uwid: 1 } }
			)
			.toArray();
		const currentSet = new Set(current.map((weapon) => Number(weapon.uwid)));
		const uwids = candidateUwids.filter((uwid) => currentSet.has(uwid));
		if (!uwids.length) {
			await session.abortTransaction();
			return { count: 0, total: 0, uwids: [] };
		}

		const deleted = await weaponsCollection.deleteMany(
			{ uid, uwid: { $in: uwids }, pid: null, favorite: { $ne: 1 } },
			{ session }
		);
		if (!deleted.deletedCount) {
			await session.abortTransaction();
			return { count: 0, total: 0, uwids: [] };
		}
		await passivesCollection.deleteMany({ uwid: { $in: uwids } }, { session });
		await killsCollection.deleteMany({ uwid: { $in: uwids } }, { session });

		const total = deleted.deletedCount * priceEach;
		await mongoNumeric.add(
			cowoncyCollection,
			{ id: String(p.msg.author.id) },
			'money',
			total,
			{ session, upsert: true }
		);
		await session.commitTransaction();
		return { count: deleted.deletedCount, total, uwids: uwids.slice(0, deleted.deletedCount) };
	} catch (err) {
		if (session.inTransaction()) await session.abortTransaction();
		throw err;
	} finally {
		await session.endSession();
	}
}

const getRandomWeapon = (exports.getRandomWeapon = function (wid) {
	let weapon;

	if (wid) {
		weapon = weapons[wid];
		if (!weapon) throw 'No weapon with id: ' + wid;
	} else {
		/* Grab a random weapon */
		let keys = Object.keys(availableWeapons);
		let random = keys[Math.floor(Math.random() * keys.length)];
		weapon = availableWeapons[random];
	}

	/* Initialize random stats */
	weapon = new weapon();

	return weapon;
});

exports.getRandomWeapons = function (count, wid) {
	let randomWeapons = [];
	for (let i = 0; i < count; i++) {
		let tempWeapon = getRandomWeapon(wid);
		randomWeapons.push(tempWeapon);
	}

	return randomWeapons;
};

exports.getItems = async function (p) {
	const uid = await p.global.getUid(p.msg.author.id);
	const collection = await mongo.collection('user_weapon');
	const result = await collection
		.aggregate([{ $match: { uid } }, { $group: { _id: '$wid', count: { $sum: 1 } } }])
		.toArray();
	const items = {};
	for (const row of result) {
		const key = row._id;
		if (weapons[key]) {
			items[key] = {
				id: Number(key) + 100,
				count: row.count,
				emoji: weapons[key].getEmoji,
			};
		}
	}
	return items;
};

let parseWeapon = (exports.parseWeapon = function (data) {
	if (!data.parsed) {
		/* Parse stats */
		data.stat = data.stat.split(',');
		if (data.stat[0] == '') data.stat = [];
		for (let i = 0; i < data.stat.length; i++) data.stat[i] = parseInt(data.stat[i]);

		/* Grab all passives */
		for (let i = 0; i < data.passives.length; i++) {
			let stats = data.passives[i].stat.split(',');
			for (let j = 0; j < stats.length; j++) stats[j] = parseInt(stats[j]);
			let passive = new WeaponInterface.allPassives[data.passives[i].id](stats, null, {
				wear: data.wear || 0,
			});
			passive.pcount = data.passives[i].pcount;
			data.passives[i] = passive;
		}
		data.parsed = true;
	}

	/* Convert data to actual weapon data */
	if (!weapons[data.id]) return;
	let weapon = new weapons[data.id](data.passives, data.stat, null, {
		wear: data.wear || 0,
		hasTT: data.hasTT,
		kills: data.kills,
		rrCount: data.rrCount,
		rrAttempt: data.rrAttempt,
	});
	weapon.uwid = data.uwid;
	weapon.ruwid = data.ruwid;
	weapon.pid = data.pid;
	weapon.animal = data.animal;
	weapon.userId = data.userId;
	weapon.favorite = !!data.favorite;

	return weapon;
});

let parseWeaponQuery = (exports.parseWeaponQuery = function (query) {
	/* Group weapons by uwid and add their respective passives */
	let weapons = {};
	for (let i = 0; i < query.length; i++) {
		if (query[i].uwid) {
			let key = '_' + query[i].uwid;
			if (!(key in weapons)) {
				weapons[key] = {
					uwid: shortenUWID(query[i].uwid),
					userId: query[i].id,
					ruwid: query[i].uwid,
					pid: query[i].pid,
					id: query[i].wid,
					stat: query[i].stat,
					animal: {
						name: query[i].name,
						nickname: query[i].nickname,
					},
					passives: [],
					wear: query[i].wear || 0,
					hasTT: !!query[i].tt,
					kills: query[i].kills,
					rrAttempt: query[i].rrattempt,
					rrCount: query[i].rrcount,
					favorite: query[i].favorite,
				};
			}
			if (query[i].wpid) {
				weapons[key].passives.push({
					id: query[i].wpid,
					pcount: query[i].pcount,
					stat: query[i].pstat,
				});
			}
		}
	}
	return weapons;
});

/* Displays weapons with multiple pages */
let display = (exports.display = async function (p, pageNum = 0, sort = 0, opt) {
	if (!opt) opt = {};
	if (opt.wid) {
		opt.widList = [opt.wid.toString()];
		delete opt.wid;
	}
	let { users, msg, user } = opt;
	if (!users) users = [];
	if (!user) user = p.msg.author;
	users.push(user.id);

	/* Construct initial page */
	let page = await getDisplayPage(p, user, pageNum, sort, opt);
	if (!page) return;

	/* Send msg and add reactions */
	if (!msg) msg = await p.send(page.embed);
	else await msg.edit(page.embed);

	let filter = (componentName, user) =>
		['prev', 'next', 'rewind', 'forward', 'sort', 'filter'].includes(componentName) &&
		users.includes(user.id);
	let collector = p.interactionCollector.create(msg, filter, {
		time: 900000,
		idle: 120000,
	});

	let handler = async function (component, _user, ack, _err, values) {
		try {
			if (page) {
				/* Save the animal's action */
				if (component === 'next') {
					if (pageNum + 1 < page.maxPage) pageNum++;
					else pageNum = 0;
					page = await getDisplayPage(p, user, pageNum, sort, opt);
					if (page) await ack(page.embed);
				} else if (component === 'prev') {
					if (pageNum > 0) pageNum--;
					else pageNum = page.maxPage - 1;
					page = await getDisplayPage(p, user, pageNum, sort, opt);
					if (page) await ack(page.embed);
				} else if (component === 'sort') {
					sort = values[0];
					page = await getDisplayPage(p, user, pageNum, sort, opt);
					if (page) await ack(page.embed);
				} else if (component === 'rewind') {
					pageNum -= 5;
					if (pageNum < 0) pageNum = 0;
					page = await getDisplayPage(p, user, pageNum, sort, opt);
					if (page) await ack(page.embed);
				} else if (component === 'forward') {
					pageNum += 5;
					if (pageNum >= page.maxPage) pageNum = page.maxPage - 1;
					page = await getDisplayPage(p, user, pageNum, sort, opt);
					if (page) await ack(page.embed);
				} else if (component === 'filter') {
					pageNum = 0;
					if (values && values.length) {
						opt.widList = values;
					} else {
						opt.widList = undefined;
					}
					page = await getDisplayPage(p, user, pageNum, sort, opt);
					if (page) await ack(page.embed);
				}
			}
		} catch (err) {
			/* empty */
		}
	};

	collector.on('collect', handler);
	collector.on('end', async (_reason) => {
		if (page) {
			page.embed.embed.color = 6381923;
			page.embed.content = 'This message is now inactive';
			await msg.edit(page.embed);
		}
	});
});

const declineEmoji = '👎';
const acceptEmoji = '👍';

/* Ask a user to display their weapon */
exports.askDisplay = async function (p, id, opt = {}) {
	if (id == p.msg.author.id) {
		display(p);
		return;
	}
	if (id == p.client.user.id) {
		p.errorMsg("... trust me. You don't want to see what I have.", 3000);
		return;
	}

	let user = p.getMention(id);
	if (!user) {
		p.errorMsg(", I couldn't find that user! :(", 3000);
		return;
	}
	if (user.bot) {
		p.errorMsg(", you dum dum! Bots don't carry weapons!", 3000);
		return;
	}

	let embed = {
		author: {
			name: p.getName(user) + ', ' + p.getName() + ' wants to see your weapons!',
			icon_url: p.msg.author.avatarURL,
		},
		description: 'Do you give permission for this user to view your weapons?',
		color: p.config.embed_color,
	};

	let msg = await p.send({ embed });

	await msg.addReaction(acceptEmoji);
	await msg.addReaction(declineEmoji);

	let filter = (emoji, userID) =>
		(emoji.name === acceptEmoji || emoji.name === declineEmoji) && user.id === userID;
	let collector = p.reactionCollector.create(msg, filter, { time: 60000 });
	collector.on('collect', async (emoji) => {
		collector.stop('done');
		if (emoji.name == declineEmoji) {
			embed.color = 16711680;
			msg.edit({ embed });
		} else {
			try {
				await msg.removeReactions();
			} catch (e) {
				/* empty */
			}
			display(p, 0, 0, {
				users: [p.msg.author.id],
				msg,
				user: user,
				wid: opt.wid,
			});
		}
	});

	collector.on('end', async function (reason) {
		if (reason != 'done') {
			embed.color = 6381923;
			await msg.edit({ content: 'This message is now inactive', embed });
		}
	});
};

/* Gets a single page */
let getDisplayPage = async function (p, user, page, sort, opt = {}) {
	let { wid, widList } = opt;
	const uid = await getUserUid(user.id);
	if (uid === undefined || uid === null) {
		p.errorMsg(', you do not have any weapons, or the page is out of bounds', 3000);
		return;
	}

	const collection = await mongo.collection('user_weapon');
	const filter = buildWeaponFilter(uid, wid, widList);
	const totalCount = await collection.countDocuments(filter);
	if (!totalCount) {
		p.errorMsg(', you do not have any weapons, or the page is out of bounds', 3000);
		return;
	}

	const pipeline = [{ $match: filter }];
	if (sort === 'tt') {
		pipeline.push(
			{
				$lookup: {
					from: 'user_weapon_kills',
					localField: 'uwid',
					foreignField: 'uwid',
					as: '_tracker',
				},
			},
			{
				$addFields: {
					_trackerKills: { $ifNull: [{ $arrayElemAt: ['$_tracker.kills', 0] }, 0] },
				},
			},
			{ $sort: { _trackerKills: -1, uwid: -1 } }
		);
	} else {
		pipeline.push({ $sort: weaponSort(sort) });
	}
	pipeline.push({ $skip: page * weaponPerPage }, { $limit: weaponPerPage });
	const weaponDocs = await collection.aggregate(pipeline).toArray();
	if (!weaponDocs.length) {
		p.errorMsg(', you do not have any weapons, or the page is out of bounds', 3000);
		return;
	}
	const rows = await hydrateWeaponRows(weaponDocs);
	const nextPage = (page + 1) * weaponPerPage <= totalCount;
	const prevPage = page > 0;
	const maxPage = Math.ceil(totalCount / weaponPerPage);
	const sql = null;

	/* Parse all weapons */
	let user_weapons = parseWeaponQuery(rows);

	/* Parse actual weapon data for each weapon */
	let descUser = `These weapons belong to <@${user.id}>`;
	let descHelp =
		'Description: `owo weapon {weaponID}`\nEquip: `owo weapon {weaponID} {animal}`\nUnequip: `owo weapon unequip {weaponID}`\nReroll: `owo w rr {weaponID} [passive|stat]`\nSell: `owo sell {weaponID|cw,rw,uw...}`\nDismantle: `owo dismantle {weaponID|cw,rw,uw...}`\n';
	let desc = '';
	let fieldText;
	let fields = [];
	const user_weapons_2 = [];
	for (let key in user_weapons) {
		let weapon = parseWeapon(user_weapons[key]);
		if (weapon) {
			user_weapons_2.push(weapon);
			let row = '';

			let emoji = `${weapon.rank.emoji}${weapon.emoji}`;
			for (let i = 0; i < weapon.passives.length; i++) {
				let passive = weapon.passives[i];
				emoji += passive.emoji;
			}
			row += `\n\`${user_weapons[key].uwid}\` ${emoji} ${
				weapon.favorite ? p.config.emoji.star : ''
			}**${weapon.fullName}** ${weapon.avgQuality}%`;
			if (user_weapons[key].animal.name) {
				let animal = p.global.validAnimal(user_weapons[key].animal.name);
				row += p.replaceMentions(
					` ➤  ${animal.uni ? animal.uni : animal.value} ${
						user_weapons[key].animal.nickname ? user_weapons[key].animal.nickname : ''
					}`
				);
			}
			if (fieldText) {
				if (fieldText.length + row.length >= 1024) {
					fields.push({
						name: p.config.emoji.blank,
						value: fieldText,
					});
					fieldText = row;
				} else {
					fieldText += row;
				}
			} else if (descUser.length + descHelp.length + desc.length + row.length >= 4096) {
				fieldText = row;
			} else {
				desc += row;
			}
		}
	}
	if (fieldText) {
		fields.push({
			name: p.config.emoji.blank,
			value: fieldText,
		});
	}

	/* Construct msg */
	let title = p.getName(user) + "'s " + (wid ? weapons[wid].name : 'weapons');
	let embed = {
		author: {
			name: title,
			icon_url: user.avatarURL,
		},
		description: descUser + '\n' + descHelp + desc,
		color: p.config.embed_color,
		footer: {
			text: 'Page ' + (page + 1) + '/' + maxPage + ' | ',
		},
		fields,
	};

	if (sort === 'id') embed.footer.text += 'Sorting by id';
	else if (sort === 'rarity') embed.footer.text += 'Sorting by rarity';
	else if (sort === 'type') embed.footer.text += 'Sorting by type';
	else if (sort === 'equipped') embed.footer.text += 'Sorting by equipped';
	else if (sort === 'favorite') embed.footer.text += 'Sorting by favorited';
	else if (sort === 'tt') embed.footer.text += 'Sorting by takedown tracker';
	else if (sort === 'wear') embed.footer.text += 'Sorting by wear';

	embed = await alterWeapon.alter(p, user, embed, {
		...opt,
		page: page + 1,
		descHelp: descHelp,
		desc: desc,
		weapons: user_weapons_2,
		total: maxPage,
		sort: sort,
	});
	if (embed.embed) {
		embed = embed.embed;
	}

	embed = {
		embed,
		components: getDisplayComponents(maxPage > 19, sort, opt.widList),
	};

	return { sql, embed, totalCount, nextPage, prevPage, maxPage };
};

function getDisplayComponents(showExtraButtons, sort, widList = []) {
	const components = [
		{
			type: 1,
			components: [
				{
					type: 3,
					custom_id: 'sort',
					placeholder: 'Sort by...',
					options: [
						{
							label: 'Favorite',
							value: 'favorite',
							description: 'Sorty by favorited weapons',
							default: sort === 'favorite',
						},
						{
							label: 'Weapon ID',
							value: 'id',
							description: 'Sorty by weapon id',
							default: sort === 'id',
						},
						{
							label: 'Rarity',
							value: 'rarity',
							description: 'Sorty by weapon rarity',
							default: sort === 'rarity',
						},
						{
							label: 'Type',
							value: 'type',
							description: 'Sort by weapon type',
							default: sort === 'type',
						},
						{
							label: 'Equipped',
							value: 'equipped',
							description: 'Sort by equipped weapons',
							default: sort === 'equipped',
						},
						{
							label: 'Takedown Tracker',
							value: 'tt',
							description: 'Sort by takedown tracker kills',
							default: sort === 'tt',
						},
						{
							label: 'Wear',
							value: 'wear',
							description: 'Sort by wear',
							default: sort === 'wear',
						},
					],
				},
			],
		},
		{
			type: 1,
			components: [
				{
					type: 3,
					custom_id: 'filter',
					placeholder: 'Filter by...',
					min_values: 0,
					max_values: Math.min(Object.keys(WeaponInterface.weapons).length, 25),
					options: [],
				},
			],
		},
		{
			type: 1,
			components: [
				{
					type: 2,
					style: 1,
					custom_id: 'prev',
					emoji: {
						id: null,
						name: prevPageEmoji,
					},
				},
				{
					type: 2,
					style: 1,
					custom_id: 'next',
					emoji: {
						id: null,
						name: nextPageEmoji,
					},
				},
			],
		},
	];
	if (showExtraButtons) {
		components[2].components.unshift({
			type: 2,
			style: 1,
			custom_id: 'rewind',
			emoji: {
				id: null,
				name: rewindEmoji,
			},
		});
		components[2].components.push({
			type: 2,
			style: 1,
			custom_id: 'forward',
			emoji: {
				id: null,
				name: fastForwardEmoji,
			},
		});
	}

	for (let wid in WeaponInterface.weapons) {
		const weapon = new WeaponInterface.weapons[wid](null, null, true);
		const emoji = global.parseEmoji(weapon.defaultEmoji);
		components[1].components[0].options.push({
			label: weapon.name,
			value: weapon.id,
			emoji: {
				name: emoji.name,
				id: emoji.id,
			},
			default: widList.includes(weapon.id.toString()),
		});
	}

	return components;
}

exports.describe = async function (p, uwid) {
	uwid = expandUWID(uwid);

	let weapon = await this.getWeapon(uwid);

	/* If no weapon */
	if (!weapon) {
		p.errorMsg(
			', I could not find a weapon with that unique weapon id! Please use `owo weapon` for the weapon ID!'
		);
		return;
	}

	/* Parse image url */
	let url = weapon.emoji;
	let temp;
	if ((temp = url.match(/:[0-9]+>/))) {
		temp = 'https://cdn.discordapp.com/emojis/' + temp[0].match(/[0-9]+/)[0] + '.';
		if (url.match(/<a:/)) temp += 'gif';
		else temp += 'png';
		url = temp;
	}

	// Grab user
	let user = await p.fetch.getUser(weapon.userId);
	let username = 'A User';
	if (user) username = p.getUniqueName(user);

	/* Make description */
	let desc = `**Name:** ${weapon.name}\n`;
	desc += `**Owner:** ${username}\n`;
	desc += `**ID:** \`${shortenUWID(uwid)}\`\n`;
	desc += `**Sell Value:** ${weapon.unsellable ? 'UNSELLABLE' : prices[weapon.rank.name]}\n`;
	desc += `**Quality:** ${weapon.rank.emoji} ${weapon.avgQuality}%\n`;
	desc += `**Wear:** \`${weapon.wearName?.toUpperCase()}\`\n`;
	if (weapon.hasTakedownTracker) {
		desc += `**Kills:** \`${p.global.toFancyNum(weapon.kills)}\`\n`;
	}
	desc += `**WP Cost:** ${Math.ceil(weapon.manaCost)} <:wp:531620120976687114>`;
	desc += `\n**Description:** ${weapon.desc}\n`;
	if (weapon.buffList.length > 0) {
		desc += '\n';
		let buffs = weapon.getBuffs();
		for (let i in buffs) {
			desc += `${buffs[i].emoji} **${buffs[i].name}** - ${buffs[i].desc}\n`;
		}
	}
	if (weapon.passives.length <= 0) desc += '\n**Passives:** None';
	for (let i = 0; i < weapon.passives.length; i++) {
		let passive = weapon.passives[i];
		desc += `\n${passive.emoji} **${passive.name}** - ${passive.desc}`;
	}

	/* Construct embed */
	let embed = {
		author: {
			name: p.getName(user) + "'s " + weapon.fullName,
		},
		color: p.config.embed_color,
		thumbnail: {
			url: url,
		},
		description: desc,
		footer: {
			text: `Reroll Changes: ${weapon.rrCount} | Reroll Attempts: ${weapon.rrAttempt}`,
		},
	};
	if (user) {
		embed.author.icon_url = user.avatarURL;
		embed = alterWeaponDisplay.alter(user.id, embed, {
			user,
			weapon,
		});
	}

	if (user.id !== p.msg.author.id) {
		return p.send({ embed });
	}

	const components = [
		{
			type: 1,
			components: [
				{
					type: 2,
					label: weapon.favorite ? 'Unfavorite' : 'Favorite',
					style: weapon.favorite ? 4 : 3,
					custom_id: weapon.favorite ? 'weapon_unfavorite' : 'weapon_favorite',
					emoji: {
						id: null,
						name: p.config.emoji.star,
					},
				},
			],
		},
	];
	const content = { embed, components };

	const msg = await p.send(content);

	let filter = (componentName, reactionUser) =>
		['weapon_favorite', 'weapon_unfavorite'].includes(componentName) &&
		[p.msg.author.id].includes(reactionUser.id);
	let collector = p.interactionCollector.create(msg, filter, {
		time: 900000,
		idle: 300000,
	});

	const uid = await p.global.getUid(user.id);
	collector.on('collect', async (component, _reactionMember, ack, _err) => {
		if (component === 'weapon_favorite') {
			const userWeapons = await mongo.collection('user_weapon');
			await userWeapons.updateOne({ uwid: weapon.ruwid, uid }, { $set: { favorite: 1 } });
			weapon.favorite = true;
			content.components[0].components[0].label = 'Unfavorite';
			content.components[0].components[0].custom_id = 'weapon_unfavorite';
			content.components[0].components[0].style = 4;
			ack(content);
		} else if (component === 'weapon_unfavorite') {
			const userWeapons = await mongo.collection('user_weapon');
			await userWeapons.updateOne({ uwid: weapon.ruwid, uid }, { $set: { favorite: 0 } });
			weapon.favorite = false;
			content.components[0].components[0].label = 'Favorite';
			content.components[0].components[0].custom_id = 'weapon_favorite';
			content.components[0].components[0].style = 3;
			ack(content);
		}
	});

	collector.on('end', async (_reason) => {
		content.embed.color = 6381923;
		content.content = 'This message is now inactive';
		content.components[0].components[0].disabled = true;
		await msg.edit(content);
	});
};

exports.equip = async function (p, uwid, pet) {
	const pid = await animalUtil.getPid(p.msg.author.id, pet);
	const uid = await p.global.getUid(p.msg.author.id);
	uwid = expandUWID(uwid);
	if (!uwid || !pid) return;

	const session = await mongo.startSession();
	try {
		session.startTransaction();
		const collection = await mongo.collection('user_weapon');
		await collection.updateMany({ uid, pid }, { $set: { pid: null } }, { session });
		const equipped = await collection.updateOne({ uid, uwid }, { $set: { pid } }, { session });
		if (!equipped.matchedCount) {
			await session.abortTransaction();
			return;
		}
		await session.commitTransaction();
	} catch (err) {
		if (session.inTransaction()) await session.abortTransaction();
		console.error(err);
		return;
	} finally {
		await session.endSession();
	}

	const { animal, nickname, weapon } =
		(await teamUtil.getBattleAnimal({ uwid }, p.msg.author.id)) || {};
	if (!animal || !weapon) return;

	p.replyMsg(
		weaponEmoji,
		p.replaceMentions(
			`, ${animal.value} **${nickname}** is now wielding ${weapon.emoji} **${weapon.name}**!`
		)
	);
	return true;
};

exports.unequip = async function (p, uwid) {
	uwid = expandUWID(uwid);
	if (!uwid) {
		p.errorMsg(', Could not find a weapon with that id!');
		return;
	}
	const { animal, nickname, weapon, error } =
		(await teamUtil.getBattleAnimal({ uwid }, p.msg.author.id)) || {};

	if (error || !animal || !weapon) {
		if (error?.weapon) {
			p.errorMsg(', this weapon is not equipped on anyone!');
		} else {
			p.errorMsg(', Could not find a weapon with that id!');
		}
		return;
	}

	const uid = await p.global.getUid(p.msg.author.id);
	const userWeapons = await mongo.collection('user_weapon');
	await userWeapons.updateOne({ uwid, uid }, { $set: { pid: null } });

	p.replyMsg(
		weaponEmoji,
		p.replaceMentions(
			`, Unequipped ${weapon.emoji} **${weapon.name}** from ${animal.value} **${nickname}**`
		)
	);
};

/* Sells a weapon */
exports.sell = async function (p, uwid) {
	uwid = uwid.toLowerCase();
	for (let i = 0; i < ranks.length; i++) {
		if (ranks[i].includes(uwid)) {
			await sellRank(p, i);
			return;
		}
	}

	uwid = expandUWID(uwid);
	if (!uwid) {
		p.errorMsg(', you do not have a weapon with this id!', 3000);
		return;
	}
	const weapon = await exports.getWeapon(uwid, p.msg.author.id);
	if (!weapon) {
		p.errorMsg(', you do not have a weapon with this id!', 3000);
		return;
	}
	if (weapon.animal?.name) {
		p.errorMsg(', please unequip the weapon to sell it!', 3000);
		return;
	}
	if (weapon.unsellable) {
		p.errorMsg(', This weapon cannot be sold!');
		return;
	}
	if (weapon.favorite) {
		p.errorMsg(', unfavorite this weapon to sell!');
		return;
	}

	const price = prices[weapon.rank.name];
	if (!price) {
		p.errorMsg(', Something went terribly wrong...');
		return;
	}
	const uid = await p.global.getUid(p.msg.author.id);
	const result = await removeWeaponsAndCredit(p, uid, [uwid], price);
	if (!result.count) {
		p.errorMsg(', you do not have a weapon with this id!', 3000);
		return;
	}

	p.replyMsg(
		weaponEmoji,
		`, You sold a(n) **${weapon.rank.name} ${weapon.name}**  ${weapon.rank.emoji}${weapon.emoji} for **${price}** cowoncy!`
	);
	p.logger.incr('cowoncy', price, { type: 'sell' }, p.msg);
};

let sellRank = (exports.sellRank = async function (p, rankLoc) {
	// (min,max]
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

	/* Grab the item we will sell */
	let sql = `SELECT
			a.uwid, a.wid, a.stat, a.rrcount, a.rrattempt, a.wear,
			b.pcount, b.wpid, b.stat as pstat,
			c.uwid as tt, c.kills
		FROM user
			LEFT JOIN user_weapon a ON user.uid = a.uid
			LEFT JOIN user_weapon_passive b ON a.uwid = b.uwid
			LEFT JOIN user_weapon_kills c ON a.uwid = c.uwid
		WHERE user.id = ${p.msg.author.id} AND avg >${min === 0 ? '=' : ''} ${min} ${
		lastRank ? '' : `AND avg <= ${max}`
	} AND a.pid IS NULL AND a.favorite != 1 LIMIT 500;`;

	let result = await p.query(sql);

	/* not a real weapon! */
	if (!result[0]) {
		p.errorMsg(', you do not have any weapons with this rank!', 3000);
		return;
	}

	/* Parse emoji and uwid */
	let weapon = parseWeaponQuery(result);
	let weapons = [];
	let weaponsSQL = [];
	let price;
	let rank;
	for (let key in weapon) {
		let tempWeapon = parseWeapon(weapon[key]);
		if (!tempWeapon.unsellable) {
			weapons.push(tempWeapon.emoji);
			weaponsSQL.push(tempWeapon.ruwid);
		}
		/* Get weapon price */
		if (!price) {
			price = prices[tempWeapon.rank.name];
			rank = tempWeapon.rank.emoji + ' **' + tempWeapon.rank.name + '**';
		}
	}
	weaponsSQL = '(' + weaponsSQL.join(',') + ')';

	if (weapons.length <= 0) {
		p.errorMsg(', you do not have any weapons with this rank!', 3000);
		return;
	}

	if (!price) {
		p.errorMsg(', Something went terribly wrong...');
		return;
	}

	sql = `DELETE user_weapon_passive FROM user
		LEFT JOIN user_weapon ON user.uid = user_weapon.uid
		LEFT JOIN user_weapon_passive ON user_weapon.uwid = user_weapon_passive.uwid
		WHERE id = ${p.msg.author.id}
			AND user_weapon_passive.uwid IN ${weaponsSQL}
			AND user_weapon.pid IS NULL;`;
	sql += `DELETE user_weapon_kills FROM user
		LEFT JOIN user_weapon ON user.uid = user_weapon.uid
		LEFT JOIN user_weapon_kills ON user_weapon.uwid = user_weapon_kills.uwid
		WHERE id = ${p.msg.author.id}
			AND user_weapon_kills.uwid IN ${weaponsSQL}
			AND user_weapon.pid IS NULL;`;
	sql += `DELETE user_weapon FROM user
		LEFT JOIN user_weapon ON user.uid = user_weapon.uid
		WHERE id = ${p.msg.author.id}
			AND user_weapon.uwid IN ${weaponsSQL}
			AND user_weapon.pid IS NULL;`;

	result = await p.query(sql);

	/* Check if deleted */
	if (result[2].affectedRows == 0) {
		p.errorMsg(', you do not have a weapon with this id!', 3000);
		return;
	}

	/* calculate rewards */
	price *= result[2].affectedRows;

	/* Give cowoncy */
	sql = `UPDATE cowoncy SET money = money + ${price} WHERE id = ${p.msg.author.id}`;
	result = await p.query(sql);

	p.replyMsg(
		weaponEmoji,
		`, You sold all your ${rank} weapons for **${price}** cowoncy!\n${
			p.config.emoji.blank
		} **| Sold:** ${weapons.join('')}`
	);
	p.logger.incr('cowoncy', price, { type: 'sell' }, p.msg);
});

/* Shorten a uwid to base36 */
let shortenUWID = (exports.shortenUWID = function (uwid) {
	if (!uwid) return;
	return uwid.toString(36).toUpperCase();
});

/* expand base36 to decimal */
let expandUWID = (exports.expandUWID = function (euwid) {
	if (!euwid) return;
	euwid = euwid + '';
	if (!/^[a-zA-Z0-9]+$/.test(euwid)) return;
	return parseInt(euwid.toLowerCase(), 36);
});

exports.getWID = function (id) {
	return weapons[id];
};

exports.getWeapon = async function (uwid, id) {
	if (!uwid) return null;
	const collection = await mongo.collection('user_weapon');
	const filter = { uwid: Number(uwid) };
	if (id) {
		const uid = await getUserUid(id);
		if (uid === undefined || uid === null) return null;
		filter.uid = uid;
	}
	const document = await collection.findOne(filter);
	if (!document) return null;
	const rows = await hydrateWeaponRows([document]);
	const parsed = parseWeaponQuery(rows);
	const data = parsed[Object.keys(parsed)[0]];
	return data ? parseWeapon(data) : null;
};
