/*
 * OwO Bot for Discord
 * Copyright (C) 2023 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */
const events = require('../data/event.json');
const mongo = require('./mongo.js');
let rewardUtil;
const eventMax = 10;
const itemToEvents = {};
for (const key in events) {
	const event = events[key];
	if (typeof event.start === 'string') event.start = new Date(event.start).getTime();
	if (typeof event.end === 'string') event.end = new Date(event.end).getTime();
	if (event.item) itemToEvents[event.item.id] = event;
}

let activeEvents = {};
setActiveEvents();

exports.useItem = async function (item) {
	const event = getEventByItem(item.column);
	const uid = await this.global.getUserUid(this.msg.author);
	const session = await mongo.startSession();
	let reward;

	try {
		session.startTransaction();
		const userItems = await mongo.collection('user_item');
		const consumed = await userItems.updateOne(
			{ uid, name: item.column, count: { $gte: 1 } },
			{ $inc: { count: -1 } },
			{ session }
		);
		if (!consumed.modifiedCount) {
			await session.abortTransaction();
			try {
				await this.errorMsg(`, you don't have a **${item.name}**!`, 3000);
			} catch (err) {
				/* empty */
			}
			return;
		}

		reward = await getRandomReward.bind(this)(event.item.rewards);
		if (reward.apply) await reward.apply({ session });
		await session.commitTransaction();
	} catch (err) {
		console.error(err);
		if (session.inTransaction()) await session.abortTransaction();
		this.errorMsg(', failed to use item.', 3000);
		return;
	} finally {
		await session.endSession();
	}

	let text = `${event.item.openEmoji} **|** You open the **${item.name}** and received **${reward.text}**!`;
	if (reward.nextLine) text += `\n${reward.nextLine}`;
	this.send(text);
};

const getEventItem = (exports.getEventItem = async function ({ overrideEvent, overrideItem } = {}) {
	const event = getCurrentActive(overrideEvent);
	if (!event) return;
	const random = Math.random();
	if (!overrideEvent && random >= event.chance) return;

	let today = new Date();
	today = today.toLocaleDateString();
	if (!overrideEvent && this.msg.author.eventItemDone) {
		const date = this.msg.author.eventItemDone;
		if (date === today) return;
		delete this.msg.author.eventItemDone;
	}

	const uid = await this.global.getUserUid(this.msg.author);
	const session = await mongo.startSession();
	let claimed;
	let output;

	try {
		session.startTransaction();
		const userEvents = await mongo.collection('user_event');
		const row = await userEvents.findOne({ uid, name: event.type }, { session });
		claimed = Number(row?.claim_count || 0) + 1;

		const reset = this.dateUtil.afterMidnight(row?.claim_reset);
		if (!overrideEvent && row && Number(row.claim_count || 0) >= eventMax && !reset.after) {
			this.msg.author.eventItemDone = today;
			await session.abortTransaction();
			return;
		}
		if (reset.after) claimed = 1;

		await userEvents.updateOne(
			{ uid, name: event.type },
			{
				$set: { claim_count: claimed, claim_reset: reset.now },
				$setOnInsert: { uid, name: event.type },
			},
			{ upsert: true, session }
		);

		output = await getEventRewards.bind(this)(this.msg.author, event, overrideItem);
		if (output.reward.apply) await output.reward.apply({ session });
		await session.commitTransaction();
	} catch (err) {
		console.error(err);
		if (session.inTransaction()) await session.abortTransaction();
		return;
	} finally {
		await session.endSession();
	}

	this.send(`${output.rewardEmoji} **|** \`[${claimed}/${eventMax}]\` ${output.rewardTxt}`);
});

exports.getAllItems = async function (overrideEvent) {
	const event = events[overrideEvent];
	if (!event) {
		this.errorMsg(', no event');
		return;
	}
	for (let overrideItem in event.rewards) {
		await getEventItem.bind(this)({ overrideEvent, overrideItem });
	}
};

exports.isValentines = function () {
	return getCurrentActive()?.type === 'valentine';
};

function isEventActive(event) {
	if (!event) return false;
	if (!event.start || !event.end) {
		console.error(`No event start/end with name: ${event.id}`);
		return false;
	}
	const now = Date.now();
	return event.start < now && now < event.end;
}

function setActiveEvents() {
	activeEvents = {};
	for (const key in events) {
		const event = events[key];
		if (Date.now() < event.end) {
			event.id = key;
			activeEvents[key] = event;
		}
	}
	console.log('Upcoming/Active: ' + Object.keys(activeEvents));
	const current = getCurrentActive();
	console.log('Current: ' + current?.id);
}

function getCurrentActive(override) {
	if (override) return events[override];
	let resetActive = false;
	for (const key in activeEvents) {
		if (isEventActive(activeEvents[key])) return activeEvents[key];
		if (Date.now() >= activeEvents[key].end) resetActive = true;
	}
	if (resetActive) setActiveEvents();
}

exports.getCurrentActive = getCurrentActive;

function getEventByItem(itemName) {
	return itemToEvents[itemName];
}

async function getRandomReward(rewards) {
	const totalChance = rewards.reduce((a, b) => a + b.chance, 0);
	const rand = Math.random() * totalChance;
	let chance = 0;
	let result;
	const newRewards = [];

	rewards.forEach((reward) => {
		chance += reward.chance;
		if (!result && rand < chance) result = reward;
		else newRewards.push(reward);
	});
	if (!result) throw 'No reward found';

	result = await parseReward.bind(this)(result);
	if (!result) result = await getRandomReward.bind(this)(newRewards);
	return result;
}

async function parseReward(reward) {
	const uid = await this.global.getUserUid(this.msg.author);
	return rewardUtil.getReward(this.msg.author.id, uid, null, reward.type, reward.id, reward.count);
}

async function getEventRewards(user, event, override) {
	const id = user.id;
	const uid = await this.global.getUserUid(user);
	if (!event.rewardTotal) event.rewardTotal = event.rewards.reduce((acc, curr) => acc + curr.chance, 0);
	const rewardDefinition =
		event.rewards[override] || this.global.selectRandom(event.rewards, event.rewardTotal);

	let count = rewardDefinition.count;
	if (rewardDefinition.min && rewardDefinition.max) {
		count =
			rewardDefinition.min +
			Math.floor(Math.random() * (rewardDefinition.max - rewardDefinition.min));
	}
	const reward = await rewardUtil.getReward(
		id,
		uid,
		null,
		rewardDefinition.type,
		rewardDefinition.id,
		count
	);

	let rewardTxt = rewardDefinition.text;
	for (let key in reward) rewardTxt = rewardTxt.replaceAll(`?${key}?`, reward[key]);
	return {
		rewardTxt,
		rewardEmoji: rewardDefinition.textEmoji,
		reward,
	};
}

exports.init = async function (main) {
	rewardUtil = main.rewardUtil;
};
