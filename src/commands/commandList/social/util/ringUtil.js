/*
 * OwO Bot for Discord
 * Copyright (C) 2020 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const alterBuy = require('../../patreon/alterBuy.js');
const rings = require('../../../../data/rings.json');
const mongoNumeric = require('../../../../utils/mongoNumeric.js');
const cart = '🛒';
const sold = '💰';

exports.buy = async function (p, id) {
	let ring = rings[id];
	if (!ring) {
		p.errorMsg(', that item does not exist! Please choose one from `owo shop`!', 3000);
		return;
	}

	const uid = await p.global.getUid(p.msg.author.id);
	const session = await p.mongo.startSession();
	try {
		session.startTransaction();
		const balances = await p.mongo.collection('cowoncy');
		const debit = await mongoNumeric.subtractIfEnough(
			balances,
			{ id: String(p.msg.author.id) },
			'money',
			ring.price,
			{ session }
		);
		if (!debit.modifiedCount) {
			await session.abortTransaction();
			p.errorMsg(', you do not have enough cowoncy! >:c', 3000);
			return;
		}

		const userRings = await p.mongo.collection('user_ring');
		await userRings.updateOne(
			{ uid, rid: ring.id },
			{ $inc: { rcount: 1 }, $setOnInsert: { uid, rid: ring.id } },
			{ upsert: true, session }
		);
		await session.commitTransaction();
	} catch (err) {
		if (session.inTransaction()) await session.abortTransaction();
		console.error(err);
		p.errorMsg(', failed to buy that ring. Please try again later.', 3000);
		return;
	} finally {
		await session.endSession();
	}

	p.logger.decr('cowoncy', -1 * ring.price, { type: 'ring' }, p.msg);
	let an = p.global.isVowel(ring.name) ? 'n' : '';
	let text = `${cart} **| ${p.getName()}**, you bought a${an} ${ring.emoji} **${
		ring.name
	}** for **${p.global.toFancyNum(ring.price)}** ${p.config.emoji.cowoncy}!`;
	text = alterBuy.alter(p, text, {
		type: 'ring',
		an,
		ring,
		price: p.global.toFancyNum(ring.price),
		user: p.msg.author,
	});

	p.send(text);
};

exports.getItems = async function (p) {
	const uid = await p.global.getUid(p.msg.author.id);
	const userRings = await p.mongo.collection('user_ring');
	const result = await userRings.find({ uid, rcount: { $gt: 0 } }).toArray();
	if (!result.length) return {};

	let items = {};
	for (let i in result) {
		let id = result[i].rid;
		let count = result[i].rcount;
		let ring = rings[id];
		if (ring) items[id] = { emoji: ring.emoji, id: id, count };
	}
	return items;
};

exports.sell = async function (p, id) {
	let ring = rings[id];
	if (!ring) {
		p.errorMsg(', invalid ring id!', 3000);
		return;
	}

	const uid = await p.global.getUid(p.msg.author.id);
	const price = Math.round(ring.price * 0.75);
	const session = await p.mongo.startSession();
	try {
		session.startTransaction();
		const userRings = await p.mongo.collection('user_ring');
		const decrement = await userRings.updateOne(
			{ uid, rid: ring.id, rcount: { $gt: 0 } },
			{ $inc: { rcount: -1 } },
			{ session }
		);
		if (!decrement.modifiedCount) {
			await session.abortTransaction();
			p.errorMsg(', you do not have that ring! >:c', 3000);
			return;
		}

		const balances = await p.mongo.collection('cowoncy');
		await mongoNumeric.add(
			balances,
			{ id: String(p.msg.author.id) },
			'money',
			price,
			{ upsert: true, session },
			{ id: String(p.msg.author.id) }
		);
		await session.commitTransaction();
	} catch (err) {
		if (session.inTransaction()) await session.abortTransaction();
		console.error(err);
		p.errorMsg(', failed to sell that ring. Please try again later.', 3000);
		return;
	} finally {
		await session.endSession();
	}

	p.logger.incr('cowoncy', price, { type: 'ring' }, p.msg);
	p.replyMsg(
		sold,
		', you sold a' +
			(p.global.isVowel(ring.name) ? 'n' : '') +
			' ' +
			ring.emoji +
			' **' +
			ring.name +
			'** for **' +
			p.global.toFancyNum(price) +
			'** ' +
			p.config.emoji.cowoncy
	);
};

var maxID = -1;
for (let i in rings) if (rings[i].id > maxID) maxID = rings[i].id;
exports.getMaxID = function () {
	return maxID;
};
