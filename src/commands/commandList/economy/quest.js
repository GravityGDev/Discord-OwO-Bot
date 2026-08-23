/*
 * OwO Bot for Discord
 * Copyright (C) 2021 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');
const dateUtil = require('../../../utils/dateUtil.js');
const global = require('../../../utils/global.js');
const questJson = require('../../../data/quests.json');

/*
 * Quest command.
 * Users can claim 1 quest a day up to 3 quests in total.
 */
module.exports = new CommandInterface({
	alias: ['quest', 'q'],

	args: '[rr | lock | unlock] {num}',

	desc: 'Grab a quest everyday! Complete them to earn rewards! You also have one quest reroll per day! You can earn a new quest after 12am PST',

	example: ['owo quest', 'owo quest rr 1', 'owo quest lock 1', 'owo quest unlock 1'],

	permissions: ['sendMessages', 'embedLinks'],

	group: ['economy'],

	related: [],

	cooldown: 5000,
	half: 100,
	six: 500,

	execute: async function (p) {
		if (
			p.args.length == 2 &&
			(p.args[0] == 'rr' || p.args[0] == 'reroll') &&
			p.global.isInt(p.args[1])
		) {
			await rrQuest(p);
		} else if (
			p.args.length == 2 &&
			(p.args[0] == 'lock' || p.args[0] == 'unlock') &&
			p.global.isInt(p.args[1])
		) {
			await lockUnlockQuest(p);
		} else {
			await addQuest(p);
		}
	},
});

async function rrQuest(p) {
	const position = parseInt(p.args[1]) - 1;
	const uid = await p.global.getUid(p.msg.author.id);
	const timers = await p.mongo.collection('timers');
	const questCollection = await p.mongo.collection('quest');
	const session = await p.mongo.startSession();
	let failure;

	try {
		await session.withTransaction(async () => {
			failure = undefined;
			await timers.updateOne({ uid }, { $setOnInsert: { uid } }, { upsert: true, session });
			const timer = await timers.findOne({ uid }, { session });
			const afterMid = dateUtil.afterMidnight(timer?.questrrTime);
			if (!afterMid || !afterMid.after) {
				failure = ', you already rerolled a quest today silly head!';
				return;
			}

			const quests = await questCollection.find({ uid }, { session }).sort({ qid: 1 }).toArray();
			const selected = quests[position];
			if (!selected) {
				failure = ', Could not locate the quest.';
				return;
			}

			const replacement = createQuest(uid, selected.qid, Number(selected.locked || 0));
			const changed = await questCollection.updateOne(
				{ uid, qid: selected.qid },
				{
					$set: {
						qname: replacement.qname,
						level: replacement.level,
						prize: replacement.prize,
						count: 0,
						locked: replacement.locked,
					},
				},
				{ session }
			);
			if (!changed.matchedCount) {
				failure = ', Could not locate the quest.';
				return;
			}

			await timers.updateOne({ uid }, { $set: { questrrTime: afterMid.now } }, { session });
		});
	} catch (err) {
		console.error(err);
		p.errorMsg(', there was an error rerolling your quest. Please try again later.', 3000);
		return;
	} finally {
		await session.endSession();
	}

	if (failure) {
		p.errorMsg(failure, 3000);
		return;
	}

	p.cache.clearQuests(p.msg.author.id);
	await displayCurrentQuests(p, uid, 'questrrTime');
}

async function lockUnlockQuest(p) {
	const position = parseInt(p.args[1]) - 1;
	const uid = await p.global.getUid(p.msg.author.id);
	const questCollection = await p.mongo.collection('quest');
	const quests = await questCollection.find({ uid }).sort({ qid: 1 }).toArray();
	const selected = quests[position];
	if (!selected) {
		p.errorMsg(', Could not locate the quest.', 3000);
		return;
	}

	const locked = p.args[0].toLowerCase() == 'lock' ? 1 : 0;
	const changed = await questCollection.updateOne(
		{ uid, qid: selected.qid },
		{ $set: { locked } }
	);
	if (!changed.matchedCount) {
		p.errorMsg(', Could not locate the quest.', 3000);
		return;
	}

	p.cache.clearQuests(p.msg.author.id);
	await displayCurrentQuests(p, uid, 'questTime');
}

async function addQuest(p) {
	const uid = await p.global.getUid(p.msg.author.id);
	const timers = await p.mongo.collection('timers');
	const questCollection = await p.mongo.collection('quest');
	const session = await p.mongo.startSession();
	let added = false;

	try {
		await session.withTransaction(async () => {
			added = false;
			await timers.updateOne({ uid }, { $setOnInsert: { uid } }, { upsert: true, session });
			const timer = await timers.findOne({ uid }, { session });
			const afterMid = dateUtil.afterMidnight(timer?.questTime);
			const current = await questCollection.find({ uid }, { session }).sort({ qid: 1 }).toArray();

			if (!afterMid?.after || current.length >= 3) return;

			const next = createQuest(uid, 3, 0);
			const normalized = current
				.map(normalizeQuestDocument)
				.concat(next)
				.sort((a, b) => a.qid - b.qid)
				.map((quest, index) => ({ ...quest, qid: index }));

			await questCollection.deleteMany({ uid }, { session });
			if (normalized.length) await questCollection.insertMany(normalized, { session });
			await timers.updateOne({ uid }, { $set: { questTime: afterMid.now } }, { session });
			added = true;
		});
	} catch (err) {
		console.error(err);
		p.errorMsg(', there was an error updating your quests. Please try again later.', 3000);
		return;
	} finally {
		await session.endSession();
	}

	if (added) p.cache.clearQuests(p.msg.author.id);
	await displayCurrentQuests(p, uid, 'questTime');
}

async function displayCurrentQuests(p, uid, timerField) {
	const timers = await p.mongo.collection('timers');
	const questCollection = await p.mongo.collection('quest');
	const timer = await timers.findOne({ uid });
	const quests = await questCollection.find({ uid }).sort({ qid: 1 }).toArray();
	const afterMid = dateUtil.afterMidnight(timer?.[timerField]);
	const embed = constructEmbed(p, afterMid, parseQuests(quests));
	await p.send({ embed });
}

function constructEmbed(p, afterMid, quests) {
	return {
		color: p.config.embed_color,
		footer: {
			text: `Next quest in: ${afterMid.hours}H ${afterMid.minutes}M ${afterMid.seconds}S`,
		},
		author: {
			name: `${p.getName()}'s Quest Log`,
			icon_url: p.msg.author.avatarURL,
		},
		description: `These quests belong to ${p.getTag()}\n${quests.text}`,
	};
}

function createQuest(uid, qid, locked = 0) {
	let key = Object.keys(questJson);
	key = key[Math.floor(Math.random() * key.length)];
	const quest = questJson[key];

	let rand = Math.random();
	let level = 0;
	let chance = 0;
	for (let i = 0; i < quest.chance.length; i++) {
		chance += quest.chance[i];
		if (rand <= chance) {
			level = i;
			break;
		}
	}

	let prize = 'cowoncy';
	rand = Math.random();
	if (rand > 0.75) prize = 'crate';
	else if (rand > 0.5) prize = 'lootbox';
	else if (rand > 0.25) prize = 'shards';

	return {
		uid,
		qid,
		qname: key,
		level,
		prize,
		count: 0,
		locked: Number(locked || 0),
	};
}

function normalizeQuestDocument(quest) {
	return {
		uid: quest.uid,
		qid: quest.qid,
		qname: quest.qname,
		level: quest.level,
		prize: quest.prize,
		count: Number(quest.count || 0),
		locked: Number(quest.locked || 0),
	};
}

function parseQuests(result) {
	let text = '';
	for (let i = 0; i < result.length; i++) {
		const texts = parseQuest(result[i]);
		text += `**${i + 1}. ${texts.text}**`;
		text += `<:blank:427371936482328596>\`‣ Reward:\` ${texts.reward}`;
		text += `\n<:blank:427371936482328596>\`‣ Progress: [${texts.progress}]\`\n`;
		if (texts.locked) text += '<:blank:427371936482328596>`‣ 🔒 Locked`\n';
	}

	if (text == '') text = 'UwU You finished all of your quests! Come back tomorrow! <3';
	return { text };
}

function parseQuest(questInfo) {
	const quest = questJson[questInfo.qname];
	let reward;
	let text;
	let progress;

	if (questInfo.prize == 'cowoncy') {
		reward = global.toFancyNum(quest.cowoncy[questInfo.level]) + ' <:cowoncy:416043450337853441>';
	} else if (questInfo.prize == 'lootbox') {
		reward = '<:box:427352600476647425>'.repeat(quest.lootbox[questInfo.level]);
	} else if (questInfo.prize == 'crate') {
		reward = '<:crate:523771259302182922>'.repeat(quest.crate[questInfo.level]);
	} else if (questInfo.prize == 'shards') {
		reward =
			global.toFancyNum(quest.shards[questInfo.level]) + ' <:weaponshard:655902978712272917>';
	}

	const count = quest.count[questInfo.level];
	if (global.isInt(count)) progress = questInfo.count + '/' + count;
	else progress = questInfo.count + '/3';
	const locked = !!questInfo.locked;

	switch (questInfo.qname) {
		case 'hunt':
			text = 'Manually hunt ' + count + ' times!';
			break;
		case 'battle':
			text = 'Battle ' + count + ' times!';
			break;
		case 'gamble':
			text = 'Gamble ' + count + ' times!';
			break;
		case 'owo':
			text = "Say 'owo' " + count + ' times!';
			break;
		case 'emoteTo':
			text = 'Use an action command on someone ' + count + ' times!';
			break;
		case 'emoteBy':
			text = 'Have a friend use an action command on you ' + count + ' times!';
			break;
		case 'find':
			text = 'Hunt 3 animals that are ' + count + ' rank!';
			break;
		case 'cookieBy':
			text = 'Receive a cookie from ' + count + ' friends!';
			break;
		case 'prayBy':
			text = 'Have a friend pray to you ' + count + ' times!';
			break;
		case 'curseBy':
			text = 'Have a friend curse you ' + count + ' times!';
			break;
		case 'friendlyBattle':
			text = 'Battle with a friend ' + count + ' times!';
			break;
		case 'xp':
			text = 'Earn  ' + count + ' xp from hunting and battling!';
			break;
		default:
			text = 'Invalid Quest';
			break;
	}

	return { text, reward, progress, locked };
}
