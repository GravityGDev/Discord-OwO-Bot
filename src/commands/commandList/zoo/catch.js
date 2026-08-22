/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');
const global = require('../../../utils/global.js');
const dateUtil = require('../../../utils/dateUtil.js');
const mongoNumeric = require('../../../utils/mongoNumeric.js');
const gemUtil = require('./gemUtil.js');
const animalUtil = require('./animalUtil.js');
const alterHunt = require('./../patreon/alterHunt.js');
const patreonUtil = require('./../patreon/utils/patreonUtil.js');
const teamUtil = require('../battle/util/teamUtil.js');

const lootboxChance = 0.05;
const rollPrice = 5;
const legacyClaimDate = new Date('2017-01-01T00:00:00.000Z');

module.exports = new CommandInterface({
	alias: ['hunt', 'h', 'catch'],

	args: '',

	desc: 'Hunt for some animals for your zoo!\nHigher ranks are harder to find!',

	example: [],

	related: ['owo zoo', 'owo sell', 'owo lootbox'],

	permissions: ['sendMessages'],

	group: ['animals'],

	appCommands: [
		{
			name: 'hunt',
			type: 1,
			description: 'Hunt for some animals!',
			integration_types: [0, 1],
			contexts: [0],
		},
	],

	cooldown: 15000,
	half: 80,
	six: 500,
	bot: true,

	execute: async function (p) {
		const id = String(p.msg.author.id);
		const uid = await p.global.getUid(id);
		const gemRows = await getActiveGemRows(p, uid);
		const gems = parseActiveGems(gemRows);
		const team = await getActiveTeamInfo(p, uid);
		const animal = await getAnimals(p, gems);
		const lootboxRoll = Math.random();

		const result = await commitHunt(p, id, uid, animal, gemRows, gems, lootboxRoll);
		if (!result.ok) {
			if (result.reason === 'money') {
				p.errorMsg(", You don't have enough cowoncy!", 3000);
			} else if (result.reason === 'gems') {
				p.errorMsg(', your active gems changed while hunting. Please try again!', 3000);
			} else {
				p.errorMsg(', there was an error while hunting. Please try again later.', 3000);
			}
			return;
		}

		let text = animal.text;
		let petText = '';
		const animalXp = animal.xp;
		if (team.pids.length) {
			text += `\n${p.config.emoji.blank} **|** `;
			for (const row of team.animals) {
				const pet = p.global.validAnimal(row.name);
				if (pet) petText += (pet.uni ? pet.uni : pet.value) + ' ';
			}
			text += `${petText}gained **${animalXp}xp**!`;
		}
		if (result.lootboxText) text += result.lootboxText;

		text = await alterHunt.alter(p, p.msg.author.id, text, {
			author: p.msg.member || p.msg.author,
			name: p.getName(),
			lootboxText: result.lootboxText || '',
			petText,
			animalXp,
			gemText: animal.gemText,
			animalText: animal.text,
			animalEmojis: animal.animalText,
			animals: animal.animals,
		});

		await teamUtil.giveXPToUserTeams(p, p.msg.author, animalXp, {
			activePgid: team.pgid,
			activePids: team.pids,
		});

		p.logger.decr('cowoncy', -rollPrice, { type: 'hunt' }, p.msg);
		for (const caught of animal.animals) {
			const tempAnimal = p.global.validAnimal(caught.value);
			if (!tempAnimal) continue;
			p.logger.incr(
				'animal',
				caught.count,
				{ rank: tempAnimal.rank, name: tempAnimal.name },
				p.msg
			);
			p.logger.incr('zoo', tempAnimal.points * caught.count, {}, p.msg);
		}
		p.quest('hunt');
		p.quest('find', 1, animal.typeCount);
		p.quest('xp', animal.xp);
		await p.send(text);
		p.event.getEventItem.bind(p)();
	},
});

async function getActiveGemRows(p, uid) {
	const collection = await p.mongo.collection('user_gem');
	return collection.find({ uid, activecount: { $gt: 0 } }).toArray();
}

function parseActiveGems(rows) {
	const active = {};
	for (const row of rows) {
		const tempGem = gemUtil.getGem(row.gname);
		if (!tempGem) continue;
		if (tempGem.type === 'Special' && !animalUtil.hasSpecials()) continue;
		tempGem.uid = row.uid;
		tempGem.activecount = Number(row.activecount || 0);
		tempGem.gname = row.gname;
		active[tempGem.type] = tempGem;
	}
	return active;
}

async function getActiveTeamInfo(p, uid) {
	const teams = await p.mongo.collection('pet_team');
	const activeTeams = await p.mongo.collection('pet_team_active');
	const memberships = await p.mongo.collection('pet_team_animal');
	const animals = await p.mongo.collection('animal');
	const teamRows = await teams.find({ uid }).sort({ pgid: 1 }).toArray();
	if (!teamRows.length) return { pgid: null, pids: [], animals: [] };

	const active = await activeTeams.findOne({ uid }, { projection: { pgid: 1 } });
	let pgid = active?.pgid;
	if (!pgid || !teamRows.some((row) => row.pgid === pgid)) pgid = teamRows[0].pgid;
	const memberRows = await memberships.find({ pgid }).sort({ pos: 1 }).toArray();
	const pids = memberRows.map((row) => row.pid);
	if (!pids.length) return { pgid, pids: [], animals: [] };
	const animalRows = await animals.find({ pid: { $in: pids } }).toArray();
	const animalMap = new Map(animalRows.map((row) => [row.pid, row]));
	return {
		pgid,
		pids,
		animals: memberRows.map((row) => animalMap.get(row.pid)).filter(Boolean),
	};
}

async function getAnimals(p, gems) {
	const supporter = await patreonUtil.getSupporterRank(p, p.msg.author);
	const patreon = supporter.benefitRank > 0;
	let count = 1;
	const opt = {
		patreon: patreon || !!gems.Patreon,
		manual: true,
	};
	if (Object.keys(gems).length) {
		opt.gem = true;
		opt.lucky = gems.Lucky;
		opt.special = gems.Special;
		if (gems.Hunting) count += gems.Hunting.amount;
		if (gems.Empowering) count *= 2;
		if (gems.Patreon) count += 1;
	}

	const generated = await animalUtil.getMultipleAnimalsMongo(count, p.msg.author, opt);
	const { animalText, text, gemText } = getText(p, generated.ordered, gems, count);
	return {
		xp: generated.xp,
		animals: generated.ordered,
		text,
		typeCount: generated.typeCount,
		gemText,
		animalText,
		animalCount: count,
	};
}

async function commitHunt(p, id, uid, animal, gemRows, gems, lootboxRoll) {
	const cowoncy = await p.mongo.collection('cowoncy');
	const userGems = await p.mongo.collection('user_gem');
	const lootbox = await p.mongo.collection('lootbox');
	const session = await p.mongo.startSession();
	let outcome = { ok: false };

	try {
		await session.withTransaction(async () => {
			outcome = { ok: false };
			if (!(await verifyGemSnapshot(userGems, gemRows, session))) {
				outcome = { ok: false, reason: 'gems' };
				return;
			}

			const debit = await mongoNumeric.subtractIfEnough(
				cowoncy,
				{ id },
				'money',
				rollPrice,
				{ session }
			);
			if (!debit.modifiedCount) {
				outcome = { ok: false, reason: 'money' };
				return;
			}

			await animalUtil.applyAnimalBatch(id, animal.animals, animal.typeCount, { session });
			await consumeGems(userGems, uid, gems, animal.animalCount, session);
			const lootboxText = await maybeGrantLootbox(p, lootbox, id, lootboxRoll, session);
			outcome = { ok: true, lootboxText };
		});
	} catch (err) {
		console.error(err);
		return { ok: false, reason: 'error' };
	} finally {
		await session.endSession();
	}
	return outcome;
}

async function verifyGemSnapshot(collection, rows, session) {
	for (const row of rows) {
		const current = await collection.findOne(
			{ uid: row.uid, gname: row.gname },
			{ projection: { activecount: 1 }, session }
		);
		if (Number(current?.activecount || 0) !== Number(row.activecount || 0)) return false;
	}
	return true;
}

async function consumeGems(collection, uid, gems, animalCount, session) {
	const huntingActive = !!gems.Hunting;
	const empoweringActive = !!gems.Empowering;
	const sharedSubtract = huntingActive && empoweringActive ? Math.trunc(animalCount / 2) : animalCount;
	const changes = [];
	if (gems.Patreon) changes.push([gems.Patreon.gname, 1]);
	if (gems.Hunting) changes.push([gems.Hunting.gname, 1]);
	if (gems.Empowering) changes.push([gems.Empowering.gname, Math.trunc(animalCount / 2)]);
	if (gems.Lucky) changes.push([gems.Lucky.gname, sharedSubtract]);
	if (gems.Special) changes.push([gems.Special.gname, sharedSubtract]);

	for (const [gname, amount] of changes) {
		await collection.updateOne(
			{ uid, gname },
			[
				{
					$set: {
						activecount: {
							$max: [{ $subtract: [{ $ifNull: ['$activecount', 0] }, amount] }, 0],
						},
					},
				},
			],
			{ session }
		);
	}
}

async function maybeGrantLootbox(p, collection, id, roll, session) {
	const row = await collection.findOne({ id }, { session });
	const reset = dateUtil.afterMidnight(row?.claim);
	const currentCount = reset.after ? 0 : Number(row?.claimcount || 0);
	if (currentCount >= 3) return '';
	if (!reset.after && roll > lootboxChance) return '';

	const nextCount = currentCount + 1;
	if (reset.after) {
		await collection.updateOne(
			{ id },
			{
				$inc: { boxcount: 1 },
				$set: { claimcount: 1, claim: reset.now },
				$setOnInsert: { id, fbox: 0 },
			},
			{ upsert: true, session }
		);
	} else {
		await collection.updateOne(
			{ id },
			{ $inc: { boxcount: 1, claimcount: 1 }, $setOnInsert: { id, claim: legacyClaimDate, fbox: 0 } },
			{ upsert: true, session }
		);
	}

	return (
		'\n**<:box:427352600476647425> |** You found a **lootbox**! `[' +
		nextCount +
		'/3] RESETS IN: ' +
		reset.hours +
		'H ' +
		reset.minutes +
		'M ' +
		reset.seconds +
		'S`'
	);
}

function getText(p, animals, gems, animalCount) {
	let animalText = global.unicodeAnimal(animals[0].value);
	let text =
		'**🌱 | ' +
		p.getName() +
		'** spent 5 <:cowoncy:416043450337853441> and caught a ' +
		animals[0].text +
		' ' +
		global.unicodeAnimal(animals[0].value) +
		'!';
	let gemText;
	if (animals[0].text.charAt(2) == 'u' || animals[0].text.charAt(2) == 'e') {
		text = text.replace(' a ', ' an ');
	}

	if (Object.keys(gems).length > 0) {
		text = '**🌱 | ' + p.getName() + '**, hunt is empowered by ';
		gemText = '';
		for (const key in gems) {
			let remaining = gems[key].activecount;
			let subtract = 1;
			if (gems[key].type == 'Patreon' || gems[key].type == 'Hunting') {
				subtract = 1;
			} else if (gems[key].type == 'Empowering') {
				subtract = Math.trunc(animalCount / 2);
			} else if (
				['Lucky', 'Special'].includes(gems[key].type) &&
				gems.Hunting &&
				gems.Empowering
			) {
				subtract = Math.trunc(animalCount / 2);
			} else {
				subtract = animalCount;
			}
			remaining -= subtract;
			if (remaining < 0) remaining = 0;
			gemText += gems[key].emoji + '`[' + remaining + '/' + gems[key].length + ']` ';
		}
		text += gemText + ' !\n**<:blank:427371936482328596> |** You found: ';
		animalText = '';
		for (const animal of animals) {
			for (let j = 0; j < animal.count; j++) {
				animalText += ' ' + global.unicodeAnimal(animal.value);
			}
		}
		text += animalText;
	}

	return { animalText, text, gemText };
}
