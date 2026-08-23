/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

/*
 * Handles quest counter/rewards
 */

const quests = require('../data/quests.json');
const global = require('../utils/global.js');
const cacheUtil = require('../utils/cacheUtil.js');
const mongo = require('../utils/mongo.js');
const mongoNumeric = require('../utils/mongoNumeric.js');

const questBy = ['friendlyBattle', 'friendlyBattleBy', 'emoteBy', 'prayBy', 'curseBy', 'cookieBy'];
const legacyClaimDate = new Date('2017-01-01T10:10:10.000Z');

module.exports = class Quest {
	constructor() {}

	/* progress in a specific quest */
	async increment(msg, questName, count = 1, extra) {
		let id = String(msg.author.id);
		let username = global.getName(msg.member || msg.author);
		if (questBy.includes(questName)) {
			id = String(extra.id);
			username = extra.username;
		}

		if (questName == 'friendlyBattleBy') questName = 'friendlyBattle';

		const result = await cacheUtil.getQuestByName(questName, id);
		if (!result[0]) return;

		for (let i = 0; i < result.length; i++) {
			await check(msg, id, username, questName, result[i], count, extra);
		}
	}
};

/* Check if user finished quest or increment quest progress */
async function check(msg, id, username, questName, result, count, extra) {
	const quest = quests[questName];
	if (!quest || !result) return;

	let current = Number(result.count || 0) + count;
	const level = result.level;
	let needed = quest.count[level];
	const rewardType = result.prize;
	const reward = quest[rewardType][level];

	if (questName == 'find') {
		needed = 3;
		const rank = extra.find((ele) => ele.rank === quest.count[level]);
		if (rank) {
			count = rank.count;
			current = Number(result.count || 0) + count;
		} else {
			return;
		}
	}

	const uid = await cacheUtil.getUid(id);
	const questCollection = await mongo.collection('quest');

	if (current < needed) {
		await questCollection.updateOne(
			{ uid, qid: result.qid, qname: questName },
			{ $inc: { count } }
		);
		cacheUtil.clearQuests(id);
		return;
	}

	const session = await mongo.startSession();
	let completed = false;
	try {
		session.startTransaction();

		const removed = await questCollection.deleteOne(
			{ uid, qid: result.qid, qname: questName },
			{ session }
		);

		// A different shard may have completed this cached quest first.
		if (!removed.deletedCount) {
			await session.abortTransaction();
			return;
		}

		await grantReward(id, uid, rewardType, reward, session);
		await session.commitTransaction();
		completed = true;
	} catch (err) {
		if (session.inTransaction()) await session.abortTransaction();
		throw err;
	} finally {
		await session.endSession();
		cacheUtil.clearQuests(id);
	}

	if (!completed) return;

	let text = '**📜 | ' + username + '**! You finished a quest and earned: ';
	if (rewardType == 'lootbox') {
		text += '<:box:427352600476647425>'.repeat(reward);
	} else if (rewardType == 'crate') {
		text += '<:crate:523771259302182922>'.repeat(reward);
	} else if (rewardType == 'shards') {
		text += '<:weaponshard:655902978712272917>**x' + reward + '**';
	} else {
		text += global.toFancyNum(reward) + ' <:cowoncy:416043450337853441>';
	}
	text += '!';
	await msg.channel.createMessage(text);
}

async function grantReward(id, uid, rewardType, reward, session) {
	if (rewardType == 'lootbox') {
		const collection = await mongo.collection('lootbox');
		await collection.updateOne(
			{ id },
			{
				$inc: { boxcount: reward },
				$setOnInsert: {
					id,
					claimcount: 0,
					claim: legacyClaimDate,
					fbox: 0,
				},
			},
			{ upsert: true, session }
		);
		return;
	}

	if (rewardType == 'crate') {
		const collection = await mongo.collection('crate');
		await collection.updateOne(
			{ uid, cratetype: 0 },
			{
				$inc: { boxcount: reward },
				$setOnInsert: {
					uid,
					cratetype: 0,
					claimcount: 0,
					claim: legacyClaimDate,
				},
			},
			{ upsert: true, session }
		);
		return;
	}

	if (rewardType == 'shards') {
		const collection = await mongo.collection('shards');
		await collection.updateOne(
			{ uid },
			{ $inc: { count: reward }, $setOnInsert: { uid } },
			{ upsert: true, session }
		);
		return;
	}

	const collection = await mongo.collection('cowoncy');
	await mongoNumeric.add(
		collection,
		{ id },
		'money',
		reward,
		{ upsert: true, session },
		{ id }
	);
}
