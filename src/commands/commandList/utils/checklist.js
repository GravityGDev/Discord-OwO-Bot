/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');
const alterChecklist = require('../patreon/alterChecklist.js');
const dateUtil = require('../../../utils/dateUtil.js');
const mongoNumeric = require('../../../utils/mongoNumeric.js');

const check = '☑️';
const box = '⬛';
const tada = '🎉';
const legacyClaimDate = new Date('2017-01-01T00:00:00.000Z');

module.exports = new CommandInterface({
	alias: ['checklist', 'task', 'tasks', 'cl'],

	args: '',

	desc: 'Get a list of all the things you have left to do!',

	example: [],

	related: [],

	permissions: ['sendMessages', 'embedLinks'],

	group: ['economy'],

	cooldown: 15000,
	half: 100,
	six: 500,

	execute: async function (p) {
		const id = String(p.msg.author.id);
		const uid = await p.global.getUid(id);
		const state = await getChecklistState(p, id, uid);
		const tasks = parseTasks(p, state);
		const allDone = tasks.every((task) => task.done);
		const alreadyClaimed = !dateUtil.afterMidnight(state.timer?.checklist).after;
		let reward = false;
		let done = alreadyClaimed;

		if (allDone && !alreadyClaimed) {
			const claim = await claimChecklistReward(p, id, uid);
			if (claim.error) {
				p.errorMsg(', there was an error claiming your checklist reward. Please try again later.', 3000);
				return;
			}
			reward = claim.claimed;
			done = !claim.claimed;
			if (reward) await p.quest('cookieBy', 1, p.msg.member || p.msg.author);
		}

		let description = tasks
			.map((task) => `\n${task.done ? check : box} ${task.emoji} ${task.desc}`)
			.join('');
		if (reward) {
			description +=
				`\n${check} ${tada} You earned 1,000 ${p.config.emoji.cowoncy}, 1 ${p.config.emoji.lootbox}, ` +
				`1 ${p.config.emoji.crate}, 100 ${p.config.emoji.shards}, and 1 ${p.config.emoji.cookie}!`;
		} else if (done) {
			description += `\n${check} ${tada} You already claimed your checklist rewards!`;
		} else {
			description += `\n${box} ${tada} Complete your checklist to get a reward!`;
		}

		const time = dateUtil.afterMidnight();
		let embed = {
			author: {
				name: p.getName() + "'s Checklist",
				icon_url: p.msg.author.avatarURL,
			},
			color: p.config.embed_color,
			footer: {
				text: `Resets in ${time.hours}H ${time.minutes}M ${time.seconds}S`,
			},
			timestamp: new Date(),
			description,
		};
		embed = alterChecklist.alter(p.msg.author.id, {
			embed,
			tasks,
			reward,
			done,
			emoji: p.config.emoji,
		});
		await p.send({ embed });
	},
});

async function getChecklistState(p, id, uid) {
	const cowoncy = await p.mongo.collection('cowoncy');
	const votes = await p.mongo.collection('vote');
	const timers = await p.mongo.collection('timers');
	const lootbox = await p.mongo.collection('lootbox');
	const crate = await p.mongo.collection('crate');

	const daily = await cowoncy.findOne({ id });
	const vote = await votes.findOne({ id });
	const timer = await timers.findOne({ uid });
	const boxes = await lootbox.findOne({ id });
	const crates = await crate.findOne({ uid, cratetype: 0 });
	return { daily, vote, timer, boxes, crates };
}

function parseTasks(p, state) {
	return [
		parseDaily(state.daily),
		parseVote(state.vote),
		parseCookie(state.timer),
		parseQuest(state.timer),
		parseLootboxes(state.boxes),
		parseCrates(p, state.crates),
	];
}

function parseDaily(row) {
	const done = !dateUtil.afterMidnight(row?.daily).after;
	return {
		done,
		desc: done ? 'You have claimed your daily!' : 'You can still claim your daily!',
		emoji: '🎁',
	};
}

function parseVote(row) {
	if (row?.date) {
		const hours = Math.floor((Date.now() - new Date(row.date).getTime()) / 3600000);
		if (hours < 12) {
			const remaining = 12 - hours;
			return {
				done: true,
				desc: `You can claim your vote in ${remaining}${remaining === 1 ? ' hour!' : ' hours!'}`,
				emoji: '📝',
			};
		}
	}
	return { done: false, desc: 'You can claim your vote!', emoji: '📝' };
}

function parseCookie(timer) {
	const done = !dateUtil.afterMidnight(timer?.cookieTime).after;
	return {
		done,
		desc: done ? 'You have used your cookie!' : 'You can still send a cookie!',
		emoji: '🍪',
	};
}

function parseQuest(timer) {
	const done = !dateUtil.afterMidnight(timer?.questTime).after;
	const rrText = dateUtil.afterMidnight(timer?.questrrTime).after ? ' (+rr)' : '';
	return {
		done,
		desc: done ? "You already claimed today's quest!" + rrText : 'You can still claim a quest!' + rrText,
		emoji: '📜',
	};
}

function parseLootboxes(row) {
	const sameDay = !dateUtil.afterMidnight(row?.claim).after;
	const claimed = sameDay ? Number(row?.claimcount || 0) : 0;
	if (claimed >= 3) return { done: true, desc: 'You have found all lootboxes!', emoji: '💎' };
	const remaining = 3 - claimed;
	return {
		done: false,
		desc: `${remaining} lootbox${remaining === 1 ? ' ' : 'es '}can be found from hunting!`,
		emoji: '💎',
	};
}

function parseCrates(p, row) {
	const sameDay = !dateUtil.afterMidnight(row?.claim).after;
	const claimed = sameDay ? Number(row?.claimcount || 0) : 0;
	if (claimed >= 3) {
		return { done: true, desc: 'You have found all weapon crates!', emoji: p.config.emoji.battle };
	}
	const remaining = 3 - claimed;
	return {
		done: false,
		desc: `${remaining} weapon crate${remaining === 1 ? ' ' : 's '}can be found from battling!`,
		emoji: p.config.emoji.battle,
	};
}

async function claimChecklistReward(p, id, uid) {
	const timers = await p.mongo.collection('timers');
	const lootbox = await p.mongo.collection('lootbox');
	const crate = await p.mongo.collection('crate');
	const cowoncy = await p.mongo.collection('cowoncy');
	const rep = await p.mongo.collection('rep');
	const shards = await p.mongo.collection('shards');
	const session = await p.mongo.startSession();
	let claimed = false;

	try {
		await session.withTransaction(async () => {
			claimed = false;
			await timers.updateOne({ uid }, { $setOnInsert: { uid } }, { upsert: true, session });
			const timer = await timers.findOne({ uid }, { session });
			if (!dateUtil.afterMidnight(timer?.checklist).after) return;

			await timers.updateOne({ uid }, { $set: { checklist: new Date() } }, { session });
			await lootbox.updateOne(
				{ id },
				{
					$inc: { boxcount: 1 },
					$setOnInsert: { id, claimcount: 0, claim: legacyClaimDate, fbox: 0 },
				},
				{ upsert: true, session }
			);
			await crate.updateOne(
				{ uid, cratetype: 0 },
				{
					$inc: { boxcount: 1 },
					$setOnInsert: { uid, cratetype: 0, claimcount: 0, claim: legacyClaimDate },
				},
				{ upsert: true, session }
			);
			await mongoNumeric.add(cowoncy, { id }, 'money', 1000, { upsert: true, session }, { id });
			await rep.updateOne(
				{ id },
				{ $inc: { count: 1 }, $setOnInsert: { id } },
				{ upsert: true, session }
			);
			await shards.updateOne(
				{ uid },
				{ $inc: { count: 100 }, $setOnInsert: { uid } },
				{ upsert: true, session }
			);
			claimed = true;
		});
	} catch (err) {
		console.error(err);
		return { error: true };
	} finally {
		await session.endSession();
	}
	return { claimed };
}
