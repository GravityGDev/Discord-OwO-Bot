/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const box = '<:box:427352600476647425>';
const fbox = '<a:flootbox:725570544065445919>';
const tempGem = require('../../../data/gems.json');
const ranks = {
	c: 'Common',
	u: 'Uncommon',
	r: 'Rare',
	e: 'Epic',
	m: 'Mythical',
	l: 'Legendary',
	f: 'Fabled',
};
const gems = {};
const idToGems = {};
for (let key in tempGem.gems) {
	let temp = tempGem.gems[key];
	temp.key = key;
	if (!gems[temp.type]) gems[temp.type] = [];
	let rank = ranks[key[0]];
	if (!rank) throw 'Missing rank type for gems';
	temp.rank = rank;
	gems[temp.type].push(temp);
	idToGems[temp.id] = temp;
}
const availableGems = {};
for (let key in gems) {
	if (!['Special', 'Patreon'].includes(key)) availableGems[key] = gems[key];
}
const availableTypeCount = Object.keys(availableGems).length;

exports.getItems = async function (p) {
	const collection = await p.mongo.collection('lootbox');
	const result = await collection.findOne({ id: String(p.msg.author.id) });
	if (!result) return {};

	const items = {};
	if (Number(result.boxcount || 0) > 0) {
		items.box = { emoji: box, id: 50, count: Number(result.boxcount) };
	}
	if (Number(result.fbox || 0) > 0) {
		items.fbox = { emoji: fbox, id: 49, count: Number(result.fbox) };
	}
	return items;
};

function getRandomGem({ tier, gid } = {}) {
	if (idToGems[gid]) return idToGems[gid];

	let rand = Math.trunc(Math.random() * availableTypeCount);
	const type = Object.values(availableGems)[rand];
	let gem;
	if (!tier) {
		rand = Math.random();
		let sum = 0;
		for (let x in type) {
			sum += type[x].chance;
			if (rand < sum) {
				gem = type[x];
				rand = 100;
			}
		}
	} else {
		gem = type[tier];
	}
	return gem;
}

const getRandomGems = (exports.getRandomGems = function (_uid, count = 1, opts) {
	const gemResult = {};
	for (let i = 0; i < count; i++) {
		const temp = getRandomGem(opts);
		if (!gemResult[temp.id]) gemResult[temp.id] = { gem: temp, count: 1 };
		else gemResult[temp.id].count++;
	}
	return { gems: gemResult };
});

exports.getRandomFabledGems = function (uid, count = 1) {
	return getRandomGems(uid, count, { tier: '6' });
};

exports.desc = function (p, id) {
	let embed;
	if (id == 49) {
		const text =
			"**ID:** 49\nOpens a Fabled lootbox! All gems are fabled tier! Check how many you have in 'owo inv'!\nYou currently cannot get these lootboxes in the game.\nUse `owo inv` to check your inventory\nUse 'owo use {id}` to use the item!";
		embed = {
			color: p.config.embed_color,
			fields: [{ name: fbox + ' Fabled Lootbox', value: text }],
		};
	} else {
		const text =
			"**ID:** 50\nOpens a lootbox! Check how many you have in 'owo inv'!\nYou can get some more by hunting for animals. You can get a maximum of 3 lootboxes per day.\nUse `owo inv` to check your inventory\nUse 'owo use {id}` to use the item!";
		embed = {
			color: p.config.embed_color,
			fields: [{ name: box + ' Lootbox', value: text }],
		};
	}
	p.send({ embed });
};
