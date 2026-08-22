/*
 * OwO Bot for Discord
 * Copyright (C) 2023 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */
const pluralize = require('pluralize');

const config = require('../data/config.json');
const rings = require('../data/rings.json');
const global = require('./global.js');
const mongo = require('./mongo.js');
const mongoNumeric = require('./mongoNumeric.js');
const cacheUtil = require('./cacheUtil.js');
const itemUtil = require('../commands/commandList/shop/util/itemUtil.js');
const weaponUtil = require('../commands/commandList/battle/util/weaponUtil.js');
const lootboxUtil = require('../commands/commandList/zoo/lootboxUtil.js');
const beehiveUtil = require('../commands/commandList/social/util/beehiveUtil.js');

function opts(session) {
	return session ? { session } : {};
}

async function addGems(uid, gemResult, session) {
	const collection = await mongo.collection('user_gem');
	for (const entry of Object.values(gemResult)) {
		await collection.updateOne(
			{ uid, gname: entry.gem.key },
			{
				$inc: { gcount: entry.count },
				$setOnInsert: { uid, gname: entry.gem.key, activecount: 0 },
			},
			{ upsert: true, ...opts(session) }
		);
	}
}

exports.getReward = async function (id, uid, _con, rewardType, rewardId, rewardCount) {
	id = String(id);
	let name, animal, weapon, item, ring, gem, bee, specialGems, gemId;

	switch (rewardType) {
		case 'wallpaper': {
			const backgrounds = await mongo.collection('backgrounds');
			const owned = await mongo.collection('user_backgrounds');
			const background = await backgrounds.findOne({ bid: Number(rewardId) });
			if (!background) return null;
			if (await owned.findOne({ uid, bid: Number(rewardId) })) return null;
			name = background.bname;
			return {
				text: `a ${config.emoji.wallpaper} "${name}" Wallpaper`,
				apply: async ({ session } = {}) => {
					await owned.updateOne(
						{ uid, bid: Number(rewardId) },
						{ $setOnInsert: { uid, bid: Number(rewardId) } },
						{ upsert: true, ...opts(session) }
					);
				},
			};
		}

		case 'animal':
			animal = global.validAnimal(rewardId);
			return {
				text: `a ${animal.value} ${animal.name}`,
				emoji: animal.value,
				name: animal.name,
				apply: async ({ session } = {}) => {
					await cacheUtil.insertAnimal(id, animal.value);
					const userAnimals = await mongo.collection('animal');
					const result = await userAnimals.updateOne(
						{ id, name: animal.value },
						{ $inc: { count: 1, totalcount: 1 } },
						opts(session)
					);
					if (!result.matchedCount) throw new Error(`Missing animal reward row for ${id}`);
					const counts = await mongo.collection('animal_count');
					await counts.updateOne(
						{ id },
						{ $inc: { [animal.rank]: 1 }, $setOnInsert: { id } },
						{ upsert: true, ...opts(session) }
					);
				},
			};
		case 'lb':
			return {
				text: `a ${config.emoji.lootbox} Lootbox`,
				count: rewardCount,
				emoji: config.emoji.lootbox,
				plural: pluralize('Lootbox', rewardCount),
				apply: async ({ session } = {}) => {
					const lootbox = await mongo.collection('lootbox');
					await lootbox.updateOne(
						{ id },
						{
							$inc: { boxcount: rewardCount },
							$setOnInsert: { id, fbox: 0, claimcount: 0, claim: new Date('2017-01-01') },
						},
						{ upsert: true, ...opts(session) }
					);
				},
			};
		case 'flb':
			return {
				text: `a ${config.emoji.fabledLootbox} Fabled Lootbox`,
				count: rewardCount,
				emoji: config.emoji.fabledLootbox,
				plural: pluralize('Lootbox', rewardCount),
				apply: async ({ session } = {}) => {
					const lootbox = await mongo.collection('lootbox');
					await lootbox.updateOne(
						{ id },
						{
							$inc: { fbox: rewardCount },
							$setOnInsert: { id, boxcount: 0, claimcount: 0, claim: new Date('2017-01-01') },
						},
						{ upsert: true, ...opts(session) }
					);
				},
			};
		case 'wc':
			return {
				text: `a ${config.emoji.crate} Weapon Crate`,
				count: rewardCount,
				emoji: config.emoji.crate,
				plural: pluralize('Crate', rewardCount),
				apply: async ({ session } = {}) => {
					const crate = await mongo.collection('crate');
					await crate.updateOne(
						{ uid, cratetype: 0 },
						{
							$inc: { boxcount: rewardCount },
							$setOnInsert: { uid, cratetype: 0, claimcount: 0, claim: new Date('2017-01-01') },
						},
						{ upsert: true, ...opts(session) }
					);
				},
			};
		case 'cowoncy':
			return {
				text: `${global.toFancyNum(rewardCount)} ${config.emoji.cowoncy} Cowoncy`,
				count: global.toFancyNum(rewardCount),
				emoji: config.emoji.cowoncy,
				apply: async ({ session } = {}) => {
					await mongoNumeric.add('cowoncy', { id }, 'money', rewardCount, { session, upsert: true });
				},
			};
		case 'item':
			item = itemUtil.getByName(rewardId);
			return {
				text: `${rewardCount} ${item.emoji} ${pluralize(item.name, rewardCount)}`,
				apply: async ({ session } = {}) => {
					const items = await mongo.collection('user_item');
					await items.updateOne(
						{ uid, name: rewardId },
						{ $inc: { count: rewardCount }, $setOnInsert: { uid, name: rewardId } },
						{ upsert: true, ...opts(session) }
					);
				},
			};
		case 'weapon':
			weapon = weaponUtil.getRandomWeapons(1, rewardId)[0];
			await weapon.save(id);
			return {
				text: `${global.getA(weapon.rank.name)} \`${weapon.shortenUWID}\` ${weapon.rank.emoji} ${
					weapon.emoji
				} ${weapon.rank.name} ${weapon.name}`,
			};
		case 'ws':
			return {
				text: `${global.toFancyNum(rewardCount)} ${config.emoji.shards} Weapon Shards`,
				count: global.toFancyNum(rewardCount),
				emoji: config.emoji.shards,
				apply: async ({ session } = {}) => {
					const shards = await mongo.collection('shards');
					await shards.updateOne(
						{ uid },
						{ $inc: { count: rewardCount }, $setOnInsert: { uid } },
						{ upsert: true, ...opts(session) }
					);
				},
			};
		case 'essence':
			return {
				text: `${global.toFancyNum(rewardCount)} ${config.emoji.essence} Animal Essences`,
				apply: async ({ session } = {}) => {
					const autohunt = await mongo.collection('autohunt');
					await autohunt.updateOne(
						{ id },
						{ $inc: { essence: rewardCount }, $setOnInsert: { id, total: 0 } },
						{ upsert: true, ...opts(session) }
					);
				},
			};
		case 'ring':
			ring = rings[rewardId];
			return {
				text: `${global.toFancyNum(rewardCount)} ${ring.emoji} ${pluralize(
					ring.name,
					rewardCount
				)}`,
				apply: async ({ session } = {}) => {
					const userRings = await mongo.collection('user_ring');
					await userRings.updateOne(
						{ uid, rid: Number(rewardId) },
						{ $inc: { rcount: rewardCount }, $setOnInsert: { uid, rid: Number(rewardId) } },
						{ upsert: true, ...opts(session) }
					);
				},
			};
		case 'gem': {
			const result = lootboxUtil.getRandomGems(uid, 1, { gid: rewardId });
			gem = Object.values(result.gems)[0].gem;
			return {
				text: `${global.getA(gem.rank)} ${gem.emoji} ${gem.rank} ${gem.type} Gem`,
				apply: ({ session } = {}) => addGems(uid, result.gems, session),
			};
		}
		case 'sgem': {
			specialGems = [79, 80, 81, 82, 83, 84, 85];
			gemId = specialGems[Math.floor(Math.random() * specialGems.length)];
			const result = lootboxUtil.getRandomGems(uid, 1, { gid: gemId });
			gem = Object.values(result.gems)[0].gem;
			return {
				text: `${global.getA(gem.rank)} ${gem.emoji} ${gem.rank} ${gem.type} Gem`,
				rank: gem.rank,
				emoji: gem.emoji,
				type: gem.type,
				apply: ({ session } = {}) => addGems(uid, result.gems, session),
			};
		}
		case 'bee':
			bee = await beehiveUtil.addBee(id, rewardId);
			return {
				text: `${global.getA(bee.bee.name)} ${bee.bee.name} Bee`,
				nextLine: `${bee.bee.emoji} **|** "*${bee.bee.text}*"${
					bee.count > 1
						? ''
						: `\n${config.emoji.blank} **|** Type \`owo beehive\` to view your bees!`
				}`,
			};
		case 'cookie':
			return {
				text: `${rewardCount} ${config.emoji.cookie} ${pluralize('Cookie', rewardCount)}`,
				count: rewardCount,
				emoji: config.emoji.cookie,
				plural: pluralize('Cookie', rewardCount),
				apply: async ({ session } = {}) => {
					const rep = await mongo.collection('rep');
					await rep.updateOne(
						{ id },
						{ $inc: { count: rewardCount }, $setOnInsert: { id } },
						{ upsert: true, ...opts(session) }
					);
				},
			};

		default:
			throw 'Invalid reward type: ' + rewardType;
	}
};
