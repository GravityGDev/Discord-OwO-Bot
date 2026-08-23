/*
 * OwO Bot for Discord
 * Copyright (C) 2023 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const global = require('./global.js');
const sender = require('./sender.js');
const rewardUtil = require('./rewardUtil.js');
const mongo = require('./mongo.js');
const config = require('../data/config.json');
const giveawayJson = require('../data/giveaway.json');
let owo;
let totalGiveawayChance = 0;
let giveaways = [];
const giveawayTimers = {};
for (let key in giveawayJson) {
	const giveaway = giveawayJson[key];
	totalGiveawayChance += giveaway.chance;
	giveaway.id = key;
	giveaway.type = giveaway.type || giveaway.id;
	giveaways.push(giveaway);
}
const multigiveChance = 0.2;
const maxTime = 3 * 24 * 60 * 60 * 1000;
const minTime = 6 * 60 * 60 * 1000;
const maxWinners = 50;
const minWinners = 5;
const giveawayLogChannel = '1155790018598682624';

async function createGiveaway(channelId, user, useTicket) {
	channelId = String(channelId);
	const { endDate, diff } = getEndDate();
	const giveaway = {
		channelId,
		rewards: getRandomGiveaways(channelId),
		endDate,
		winners: minWinners + Math.floor(Math.random() * (maxWinners - minWinners)),
	};

	if (await giveawayExistsInChannel(channelId)) {
		this?.errorMsg?.(', a giveaway already exists in this channel!');
		return;
	}
	const result = await saveGiveaway.bind(this)(giveaway, user, useTicket);
	if (!result) return;
	createGiveawayTimeout(channelId, diff);
	const msg = await sendMessage(giveaway);
	await saveMsgId(channelId, msg);

	let logText = `${config.emoji.gift} **| ${user ? global.getUniqueName(user) : 'OwO'}** created a giveaway in ${channelId}`;
	if (user && channelId === this?.msg?.channel?.id) {
		logText += `\n${config.emoji.blank} **| Channel:** [${this.msg.channel.id}] ${this.msg.channel.name}`;
		logText += `\n${config.emoji.blank} **| Guild:** [${this.msg.channel.guild.id}] ${this.msg.channel.guild.name}`;
	}
	sender.msgChannel(giveawayLogChannel, logText);
}
exports.createGiveaway = createGiveaway;

exports.giveawayExists = async function (channelId, userId) {
	channelId = String(channelId);
	const giveawayCollection = await mongo.collection('giveaway');
	const row = await giveawayCollection.findOne({ cid: channelId });
	if (!row || !row.active) return { active: false };

	let joinedUid;
	const users = await mongo.collection('user');
	const user = await users.findOne({ id: String(userId) }, { projection: { uid: 1 } });
	if (user?.uid !== undefined) {
		const participants = await mongo.collection('user_giveaway');
		const joined = await participants.findOne({ cid: channelId, uid: user.uid });
		if (joined) joinedUid = user.uid;
	}

	return {
		active: true,
		channelId,
		userId: String(userId),
		rewards: parseRewards(row.rewards),
		endDate: new Date(row.endDate),
		winners: row.winners,
		uid: joinedUid,
	};
};

async function giveawayExistsInChannel(channelId) {
	const collection = await mongo.collection('giveaway');
	return !!(await collection.findOne({ cid: String(channelId), active: 1 }));
}

exports.addUser = async function (channelId, uid) {
	channelId = String(channelId);
	const participants = await mongo.collection('user_giveaway');
	await participants.updateOne(
		{ cid: channelId, uid },
		{ $setOnInsert: { cid: channelId, uid } },
		{ upsert: true }
	);
	return participants.countDocuments({ cid: channelId });
};

exports.createContent = function (giveaway) {
	return createMessage(giveaway);
};

exports.checkGiveawayTimeout = async function (_owo) {
	owo = _owo;
	const collection = await mongo.collection('giveaway');
	const result = await collection.find({ active: 1 }).toArray();
	result.forEach((giveaway) => {
		if (_owo.debug && giveaway.cid !== '420713232265641985') return;
		if (owo.bot.channelGuildMap[giveaway.cid]) {
			const diff = new Date(giveaway.endDate) - Date.now();
			console.log(`Found giveaway timeout for: ${giveaway.cid} ${diff}ms`);
			if (diff <= 0) selectWinners(giveaway.cid);
			else createGiveawayTimeout(giveaway.cid, diff);
		}
	});
};

async function selectWinners(channelId) {
	channelId = String(channelId);
	console.log('Selecting winners for ' + channelId);
	const session = await mongo.startSession();
	let giveaway;
	let winners = [];
	let sourceRow;
	let noUsers = false;

	try {
		session.startTransaction();
		const giveawayCollection = await mongo.collection('giveaway');
		const participantCollection = await mongo.collection('user_giveaway');
		const users = await mongo.collection('user');
		sourceRow = await giveawayCollection.findOne({ cid: channelId, active: 1 }, { session });
		if (!sourceRow) {
			console.log(`Giveaway not found for ${channelId}`);
			await session.abortTransaction();
			return;
		}

		const participantRows = await participantCollection.find({ cid: channelId }, { session }).toArray();
		const uids = participantRows.map((row) => row.uid);
		const userRows = uids.length
			? await users.find({ uid: { $in: uids } }, { session, projection: { uid: 1, id: 1 } }).toArray()
			: [];
		const userMap = new Map(userRows.map((row) => [row.uid, row]));
		const pool = participantRows.map((row) => userMap.get(row.uid)).filter(Boolean);

		giveaway = {
			active: !!sourceRow.active,
			channelId,
			rewards: parseRewards(sourceRow.rewards),
			endDate: new Date(sourceRow.endDate),
			winners: sourceRow.winners,
			giveawayCount: pool.length,
		};

		if (!pool.length) {
			noUsers = true;
			await clearGiveaway(channelId, session);
			await session.commitTransaction();
		} else {
			winners = selectWinnersFromPool(pool, giveaway.winners);
			await distributeRewards(giveaway, winners, session);
			await clearGiveaway(channelId, session);
			await session.commitTransaction();
		}
	} catch (err) {
		console.error(err);
		if (session.inTransaction()) await session.abortTransaction();
		return;
	} finally {
		await session.endSession();
	}

	try {
		if (sourceRow?.mid) {
			const content = await createMessage(giveaway, winners, noUsers);
			await sender.editMsg(channelId, sourceRow.mid, content);
			if (!noUsers) msgWinners(winners, channelId, sourceRow.mid);
		}
	} catch (err) {
		console.error(err);
	}

	if (config.giveawayChannels.includes(channelId)) createGiveaway(channelId);
	const logText = `${config.emoji.gift} **|** Giveaway ended in ${channelId} with ${winners.length} winner(s).`;
	sender.msgChannel(giveawayLogChannel, logText);
}

function createGiveawayTimeout(channelId, diff) {
	channelId = String(channelId);
	console.log(`Creating timeout for: ${channelId} ${diff}ms`);
	if (giveawayTimers[channelId]) clearTimeout(giveawayTimers[channelId].timer);
	giveawayTimers[channelId] = {
		timer: setTimeout(() => selectWinners(channelId), diff),
		channelId,
	};
}

function parseRewards(rewardString) {
	return rewardString.split(';').map((i) => {
		let [rewardId, count] = i.split(':');
		const reward = giveawayJson[rewardId];
		return { ...reward, count: Number(count) };
	});
}

async function saveGiveaway({ channelId, winners, rewards, endDate }, user, useTicket) {
	channelId = String(channelId);
	const rewardData = rewards.map((i) => `${i.id}:${i.count}`).join(';');
	const session = await mongo.startSession();
	try {
		session.startTransaction();
		if (useTicket) {
			const users = await mongo.collection('user');
			const userRow = await users.findOne({ id: String(user?.id) }, { session, projection: { uid: 1 } });
			if (!userRow?.uid) {
				await session.abortTransaction();
				this?.errorMsg?.(`, you don't have a **Giveaway Ticket**!`, 3000);
				return false;
			}
			const items = await mongo.collection('user_item');
			const consumed = await items.updateOne(
				{ uid: userRow.uid, name: 'giveaway_tickets', count: { $gte: 1 } },
				{ $inc: { count: -1 } },
				{ session }
			);
			if (!consumed.modifiedCount) {
				await session.abortTransaction();
				this?.errorMsg?.(`, you don't have a **Giveaway Ticket**!`, 3000);
				return false;
			}
		}

		const giveawayCollection = await mongo.collection('giveaway');
		await giveawayCollection.updateOne(
			{ cid: channelId },
			{
				$set: { rewards: rewardData, endDate, winners, active: 1 },
				$setOnInsert: { cid: channelId },
			},
			{ upsert: true, session }
		);
		const participants = await mongo.collection('user_giveaway');
		await participants.deleteMany({ cid: channelId }, { session });
		await session.commitTransaction();
		return true;
	} catch (err) {
		console.error(err);
		if (session.inTransaction()) await session.abortTransaction();
		this?.errorMsg?.(', failed to use item.', 3000);
		return false;
	} finally {
		await session.endSession();
	}
}

async function createMessage(
	{ winners, rewards, endDate, giveawayCount = 0 },
	userWinners = [],
	noWinners
) {
	const embed = {
		color: config.embed_color,
		author: { name: config.emoji.tada + ' A New Giveaway Appeared!' },
		description: `**${winners} Lucky Users** will have a chance to win!\nWinners will win:\n\n`,
		timestamp: new Date(),
		footer: { text: giveawayCount + ' Users' },
	};
	rewards.forEach((reward) => {
		embed.description += `**• ${reward.emoji} ${reward.name} x${reward.count}**\n`;
	});

	const components = [
		{
			type: 1,
			components: [
				{
					type: 2,
					label: 'Join Giveaway!',
					style: 1,
					custom_id: 'join_giveaway',
					emoji: { id: null, name: config.emoji.tada },
				},
			],
		},
	];

	if (userWinners.length || noWinners) {
		embed.color = config.timeout_color;
		components[0].components[0].disabled = true;
		embed.author.name = config.emoji.tada + ' Giveaway has ended!';
		if (noWinners) {
			embed.description += `\nGiveaway ended **${global.toDiscordTimestamp(
				endDate
			)}**\nUnfortunately, there were no winners.`;
		} else {
			embed.description += `\nGiveaway ended **${global.toDiscordTimestamp(
				endDate
			)}**\nCongrats to the following players for winning!\n`;
			for (let i in userWinners) {
				const winner = userWinners[i];
				const user = await owo.fetch.getUser(winner.id, false);
				if (user) embed.description += `\n${global.getUniqueName(user)} • <@${winner.id}>`;
				else embed.description += `\nUnknown User • <@${winner.id}>`;
			}
		}
	} else {
		embed.description += `\nGiveaway will end **${global.toDiscordTimestamp(
			endDate
		)}**\nGoodluck to those who join!`;
	}
	return { embed, components };
}

async function msgWinners(winners, channelId, messageId) {
	const guildId = owo.bot.channelGuildMap[channelId];
	const msg = `${config.emoji.tada} **|** Congratulations! You won the giveaway in https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
	winners.forEach((winner) => sender.msgUser(winner.id, msg));
}

async function sendMessage(giveaway) {
	const content = await createMessage(giveaway);
	return sender.msgChannel(giveaway.channelId, content);
}

async function saveMsgId(channelId, msg) {
	const collection = await mongo.collection('giveaway');
	await collection.updateOne({ cid: String(channelId) }, { $set: { mid: String(msg.id) } });
}

function getEndDate() {
	const diff = minTime + Math.random() * (maxTime - minTime);
	return { endDate: new Date(Date.now() + diff), diff };
}

function getRandomGiveaways(cid) {
	const giveaway = [];
	let chance = 0;
	do {
		giveaway.push(getRandomGiveaway(cid));
		chance = Math.random();
	} while (chance <= multigiveChance);
	return giveaway;
}

function getRandomGiveaway(cid) {
	let random = Math.random() * totalGiveawayChance;
	let chance = 0;
	let giveaway;
	for (let i = 0; i < giveaways.length; i++) {
		chance += giveaways[i].chance;
		if (random <= chance) {
			giveaway = giveaways[i];
			break;
		}
	}
	if (!giveaway) giveaway = giveaways[giveaways.length - 1];
	if (giveaway.owoOnly && !config.giveawayChannels.includes(cid)) return getRandomGiveaway(cid);

	random = Math.random() * giveaway.count.chances.reduce((a, b) => a + b);
	chance = 0;
	let count = giveaway.count.values[giveaway.count.values.length - 1];
	for (let i = 0; i < giveaway.count.values.length; i++) {
		chance += giveaway.count.chances[i];
		if (random <= chance) {
			count = giveaway.count.values[i];
			break;
		}
	}
	return { ...giveaway, count };
}

function selectWinnersFromPool(users, winnerCount) {
	const winners = [];
	for (let i = 0; i < winnerCount; i++) {
		if (users.length <= 0) return winners;
		winners.push(users.splice(Math.floor(Math.random() * users.length), 1)[0]);
	}
	return winners;
}

async function distributeRewards(giveaway, winners, session) {
	for (const reward of giveaway.rewards) {
		for (const winner of winners) {
			const rewardResult = await rewardUtil.getReward(
				winner.id,
				winner.uid,
				null,
				reward.type,
				reward.rewardId,
				reward.count
			);
			if (rewardResult?.apply) await rewardResult.apply({ session });
		}
	}
}

async function clearGiveaway(channelId, session) {
	const participants = await mongo.collection('user_giveaway');
	const giveawayCollection = await mongo.collection('giveaway');
	await participants.deleteMany({ cid: String(channelId) }, { session });
	await giveawayCollection.updateOne(
		{ cid: String(channelId), active: 1 },
		{ $set: { active: 0 } },
		{ session }
	);
}
