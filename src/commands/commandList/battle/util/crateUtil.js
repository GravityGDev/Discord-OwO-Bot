/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const crate = '<:crate:523771259302182922>';
const crateChance = 0.05;

exports.getItems = async function (p) {
	const uid = await p.global.getUid(p.msg.author.id);
	const crates = await p.mongo.collection('crate');
	const result = await crates.find({ uid, boxcount: { $gt: 0 } }).toArray();
	const items = {};
	for (let i = 0; i < result.length; i++) {
		items[100 - result[i].cratetype] = {
			emoji: crate,
			id: 100 - result[i].cratetype,
			count: result[i].boxcount,
		};
	}
	return items;
};

exports.crateFromBattle = async function (p, query, crateReset) {
	let rand = Math.random();
	let count = 1;
	const resetClaim = !query || crateReset.after;
	if (resetClaim) rand = 0;
	else count = query.claimcount + 1;

	if (rand > crateChance) {
		return { text: undefined };
	}

	const uid = await p.global.getUid(p.msg.author.id);
	const crates = await p.mongo.collection('crate');
	if (resetClaim) {
		await crates.updateOne(
			{ uid, cratetype: 0 },
			{
				$inc: { boxcount: 1 },
				$set: { claimcount: 1, claim: crateReset.now },
			},
			{ upsert: true }
		);
	} else {
		await crates.updateOne(
			{ uid, cratetype: 0 },
			{ $inc: { boxcount: 1, claimcount: 1 } },
			{ upsert: true }
		);
	}

	return {
		text:
			'\n**' +
			crate +
			' | ' +
			p.getName() +
			'**, You found a **weapon crate**! `[' +
			count +
			'/3] RESETS IN: ' +
			crateReset.hours +
			'H ' +
			crateReset.minutes +
			'M ' +
			crateReset.seconds +
			'S`',
	};
};
