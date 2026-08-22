/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');

const blank = '<:blank:427371936482328596>';
const boxShake = '<a:boxshake:427004983460888588>';
const boxOpen = '<a:boxopen:427019823747301377>';
const fboxShake = '<a:fboxshake:725570543834759230>';
const fboxOpen = '<a:fboxopen:725570544615030865>';
const lootboxUtil = require('./lootboxUtil.js');
const maxBoxes = 100;

module.exports = new CommandInterface({
	alias: ['lootbox', 'lb'],

	args: '{count}|fabled',

	desc: "Opens a lootbox! Check how many you have in 'owo inv'!\nYou can get some more by hunting for animals. You can get a maximum of 3 lootboxes per day.\nYou can use the items by using 'owo use {id}'",

	example: ['owo lb', 'owo lb 10', 'owo lb fabled'],

	related: ['owo inv', 'owo hunt'],

	permissions: ['sendMessages'],

	group: ['animals'],

	appCommands: [
		{
			name: 'lootbox',
			type: 1,
			description: 'Open a lootbox',
			options: [
				{
					type: 3,
					name: 'count',
					description: 'Number of lootboxes: [number, "all", "fabled"]',
				},
			],
			integration_types: [0, 1],
			contexts: [0, 1, 2],
		},
	],

	cooldown: 5000,
	half: 100,
	six: 500,

	execute: async function () {
		if (this.args.length > 0 && this.global.isInt(this.args[0])) {
			await openMultiple(this, parseInt(this.args[0]));
		} else if (this.options.count && this.global.isInt(this.options.count)) {
			await openMultiple(this, parseInt(this.options.count));
		} else if (
			(this.args.length > 0 && this.args[0].toLowerCase() == 'all') ||
			(this.options.count && this.options.count.toLowerCase() == 'all')
		) {
			const collection = await this.mongo.collection('lootbox');
			const row = await collection.findOne({ id: String(this.msg.author.id) });
			if (!row || Number(row.boxcount || 0) <= 0) {
				this.errorMsg(", you don't have any more lootboxes!");
				return;
			}
			await openMultiple(this, Math.min(Number(row.boxcount), maxBoxes));
		} else if (
			(this.args.length && ['f', 'fabled'].includes(this.args[0].toLowerCase())) ||
			(this.options.count && ['f', 'fabled'].includes(this.options.count.toLowerCase()))
		) {
			await openFabledBox(this);
		} else {
			await openBox(this);
		}
	},
});

async function openBox(p) {
	const uid = await p.global.getUid(p.msg.author.id);
	const generated = lootboxUtil.getRandomGems(uid, 1);
	const opened = await consumeAndGrant(p, uid, 'boxcount', 1, generated.gems);
	if (!opened) {
		p.errorMsg(", You don't have any lootboxes!", 3000);
		return;
	}

	const firstGem = generated.gems[Object.keys(generated.gems)[0]].gem;
	const gemName = `${firstGem.rank} ${firstGem.type} Gem`;
	const text1 = `${blank} **| ${p.getName()}** opens a lootbox\n${boxShake} **|** and finds a ...`;
	const text2 =
		`${firstGem.emoji} **| ${p.getName()}** opens a lootbox\n${boxOpen} **|** and finds a` +
		(gemName.charAt(0) == 'E' || gemName.charAt(0) == 'U' ? 'n' : '') +
		` **${gemName}**!`;
	const msg = await p.send(text1);
	setTimeout(() => msg.edit(text2), 3000);
}

async function openMultiple(p, count) {
	if (count > maxBoxes) count = maxBoxes;
	if (count <= 0) {
		p.errorMsg(', you need to open at least one silly!', 3000);
		return;
	}

	const uid = await p.global.getUid(p.msg.author.id);
	const generated = lootboxUtil.getRandomGems(uid, count);
	const opened = await consumeAndGrant(p, uid, 'boxcount', count, generated.gems);
	if (!opened) {
		p.errorMsg(", You don't have enough lootboxes!", 3000);
		return;
	}

	let gemText = '';
	for (const key in generated.gems) {
		const gem = generated.gems[key];
		gemText += gem.gem.emoji + p.global.toSmallNum(gem.count) + ' ';
	}
	const text1 =
		`${blank} **| ${p.getName()}** opens ${count} lootboxes\n` +
		`${boxShake} **|** and finds...`;
	const text2 =
		`${blank} **| ${p.getName()}** opens ${count} lootboxes\n` +
		`${boxOpen} **|** and finds: ${gemText}`;
	const msg = await p.send(text1);
	setTimeout(() => msg.edit(text2), 3000);
}

async function openFabledBox(p) {
	const uid = await p.global.getUid(p.msg.author.id);
	const generated = lootboxUtil.getRandomFabledGems(uid, 1);
	const opened = await consumeAndGrant(p, uid, 'fbox', 1, generated.gems);
	if (!opened) {
		p.errorMsg(", You don't have any Fabled lootboxes!", 3000);
		return;
	}

	const firstGem = generated.gems[Object.keys(generated.gems)[0]].gem;
	const gemName = `${firstGem.rank} ${firstGem.type} Gem`;
	const text1 = `${blank} **| ${p.getName()}** opens a Fabled lootbox\n${fboxShake} **|** and finds a ...`;
	const text2 =
		`${firstGem.emoji} **| ${p.getName()}** opens a Fabled lootbox\n${fboxOpen} **|** and finds a` +
		(gemName.charAt(0) == 'E' || gemName.charAt(0) == 'U' ? 'n' : '') +
		` **${gemName}**!`;
	const msg = await p.send(text1);
	setTimeout(() => msg.edit(text2), 3000);
}

async function consumeAndGrant(p, uid, field, count, gemResult) {
	const boxes = await p.mongo.collection('lootbox');
	const userGems = await p.mongo.collection('user_gem');
	const session = await p.mongo.startSession();
	let success = false;
	try {
		await session.withTransaction(async () => {
			success = false;
			const removed = await boxes.updateOne(
				{ id: String(p.msg.author.id), [field]: { $gte: count } },
				{ $inc: { [field]: -count } },
				{ session }
			);
			if (!removed.modifiedCount) return;

			for (const key in gemResult) {
				const row = gemResult[key];
				await userGems.updateOne(
					{ uid, gname: row.gem.key },
					{
						$inc: { gcount: row.count },
						$setOnInsert: { uid, gname: row.gem.key, activecount: 0 },
					},
					{ upsert: true, session }
				);
			}
			success = true;
		});
	} catch (err) {
		console.error(err);
		return false;
	} finally {
		await session.endSession();
	}
	return success;
}
