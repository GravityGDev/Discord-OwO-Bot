/*
 * OwO Bot for Discord
 * Copyright (C) 2022 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const levels = require('../../../../utils/levels.js');
const mongoNumeric = require('../../../../utils/mongoNumeric.js');

const getUserLimits = (exports.getUserLimits = async function (id) {
	const lvl = (await levels.getUserLevel(id)).level;
	const tens = Math.floor(lvl / 10);
	const limit = 50000 + lvl * 14000 + tens * 5000000;

	return {
		send: limit,
		receive: Math.ceil(limit * (tens / 2 + 1)),
	};
});

function limitError(type, user, current, amount, limit, global) {
	const currentBig = BigInt(current);
	const amountBig = BigInt(amount);
	const limitBig = BigInt(limit);

	if (currentBig > limitBig) {
		if (type === 'send') {
			return {
				error: `, you already hit your daily cowoncy give limit of: **${global.toFancyNum(current)}**`,
				limit: global.toFancyNum(current),
				senderoverlimit: true,
			};
		}
		return {
			error: `, **${user.username}** has already received the daily receive limit of: **${global.toFancyNum(
				current
			)}**`,
			limit: global.toFancyNum(current),
			receiveoverlimit: true,
		};
	}

	if (currentBig + amountBig > limitBig) {
		const diff = limitBig - currentBig;
		if (diff > 0n) {
			if (type === 'send') {
				return {
					error: `, you can only send **${global.toFancyNum(diff.toString())}** more cowoncy today!`,
					limit: global.toFancyNum(limit),
					limit_diff: global.toFancyNum(diff.toString()),
					senderlimit: true,
				};
			}
			return {
				error: `, **${user.username}** can only receive **${global.toFancyNum(
					diff.toString()
				)}** more cowoncy today!`,
				limit: global.toFancyNum(limit),
				limit_diff: global.toFancyNum(diff.toString()),
				receivelimit: true,
			};
		}
		if (type === 'send') {
			return {
				error: ', you cannot send any more cowoncy today.',
				limit: global.toFancyNum(current),
				senderoverlimit: true,
			};
		}
		return {
			error: `, **${user.username}** cannot receive any more cowoncy today.`,
			limit: global.toFancyNum(current),
			receiveoverlimit: true,
		};
	}
	return null;
}

/*
 * Mongo-native check used by economy commands. The returned mutation plan is
 * applied inside the same transaction as the balance movement.
 */
exports.canGiveMongo = async function (
	sender,
	receiver,
	amount,
	{ skipCowoncyCheck = false, session } = {}
) {
	const numericAmount = mongoNumeric.integerString(amount);
	const amountBig = BigInt(numericAmount);
	const options = session ? { session } : {};
	const cowoncy = await this.mongo.collection('cowoncy');
	const limits = await this.mongo.collection('cowoncy_limit');

	let senderBalance = null;
	if (!skipCowoncyCheck) {
		senderBalance = await cowoncy.findOne(
			{ id: String(sender.id) },
			{ ...options, projection: { money: 1 } }
		);
	}
	const senderRow = await limits.findOne({ id: String(sender.id) }, options);
	const receiverRow = await limits.findOne({ id: String(receiver.id) }, options);
	const senderLimits = await getUserLimits(sender.id);
	const receiverLimits = await getUserLimits(receiver.id);

	if (
		!skipCowoncyCheck &&
		(!senderBalance || mongoNumeric.toBigInt(senderBalance.money || '0') < amountBig)
	) {
		return {
			error: ", you silly hooman! You don't have enough cowoncy!",
			none: true,
		};
	}

	const senderAfterMid = this.dateUtil.afterMidnight(senderRow?.reset);
	const receiverAfterMid = this.dateUtil.afterMidnight(receiverRow?.reset);
	const senderCurrent = senderAfterMid.after ? 0n : mongoNumeric.toBigInt(senderRow?.send || '0');
	const receiverCurrent = receiverAfterMid.after
		? 0n
		: mongoNumeric.toBigInt(receiverRow?.receive || '0');

	if (senderAfterMid.after && amountBig > BigInt(senderLimits.send)) {
		return {
			error: `, you can only send **${this.global.toFancyNum(senderLimits.send)}** more cowoncy today!`,
			limit: this.global.toFancyNum(senderLimits.send),
			senderlimit: true,
		};
	}
	const senderError = limitError(
		'send',
		sender,
		senderCurrent.toString(),
		numericAmount,
		senderLimits.send,
		this.global
	);
	if (senderError) return senderError;

	if (receiverAfterMid.after && amountBig > BigInt(receiverLimits.receive)) {
		return {
			error: `, **${receiver.username}** can only receive **${this.global.toFancyNum(
				receiverLimits.receive
			)}** more cowoncy today!`,
			limit: this.global.toFancyNum(receiverLimits.receive),
			receivelimit: true,
		};
	}
	const receiverError = limitError(
		'receive',
		receiver,
		receiverCurrent.toString(),
		numericAmount,
		receiverLimits.receive,
		this.global
	);
	if (receiverError) return receiverError;

	return {
		mongo: {
			sender: {
				id: String(sender.id),
				reset: senderAfterMid.after,
				next: (senderCurrent + amountBig).toString(),
				resetAt: senderAfterMid.now,
			},
			receiver: {
				id: String(receiver.id),
				reset: receiverAfterMid.after,
				next: (receiverCurrent + amountBig).toString(),
				resetAt: receiverAfterMid.now,
			},
		},
	};
};

exports.applyGiveLimitsMongo = async function (plan, { session } = {}) {
	if (!plan?.mongo) throw new Error('Missing MongoDB cowoncy limit mutation plan');
	const limits = await this.mongo.collection('cowoncy_limit');
	const options = { upsert: true, ...(session ? { session } : {}) };
	const senderSet = plan.mongo.sender.reset
		? {
				id: plan.mongo.sender.id,
				send: plan.mongo.sender.next,
				receive: '0',
				reset: plan.mongo.sender.resetAt,
			  }
		: { id: plan.mongo.sender.id, send: plan.mongo.sender.next };
	const receiverSet = plan.mongo.receiver.reset
		? {
				id: plan.mongo.receiver.id,
				send: '0',
				receive: plan.mongo.receiver.next,
				reset: plan.mongo.receiver.resetAt,
			  }
		: { id: plan.mongo.receiver.id, receive: plan.mongo.receiver.next };

	// Keep transaction operations sequential; Mongo does not support parallel work on one session.
	await limits.updateOne({ id: plan.mongo.sender.id }, { $set: senderSet }, options);
	await limits.updateOne({ id: plan.mongo.receiver.id }, { $set: receiverSet }, options);
};

/*
for (let lvl = 1; lvl < 60; lvl++) {
	const tens = Math.floor(lvl / 10);
	const limit = 50000 + lvl * 14000 + tens * 5000000;

	const send = limit;
	const receive = Math.ceil(limit * (tens / 2 + 1));

	console.log(`[${lvl}] ${send} | ${receive}`);
}
*/
