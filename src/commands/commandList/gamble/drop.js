/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');
const mongoNumeric = require('../../../utils/mongoNumeric.js');

module.exports = new CommandInterface({
	alias: ['drop', 'pickup'],

	args: '{amount}',

	desc: "This command is now deprecated. ~~Drop some cowoncy in a channel with 'owo drop {amount}'! Users can pick it up with 'owo pickup {amount}' If you try to pick up more than what's on the floor, you'll lose that amount! Be careful!~~",

	example: ['owo drop 3000'],

	related: [],

	permissions: ['sendMessages'],

	group: ['gambling'],

	cooldown: 30000,
	half: 50,
	six: 300,
	bot: true,

	execute: async function (p) {
		if (p.command == 'drop') {
			await p.errorMsg(', This command is now deprecated.', 3000);
		} else if (p.command == 'pickup') {
			await pickup(p);
		}
	},
});

async function pickup(p) {
	let amount;
	if (p.global.isInt(p.args[0])) amount = parseInt(p.args[0]);
	if (!amount) {
		p.errorMsg(', Please specify the pickup amount!', 3000);
		return;
	}
	if (amount <= 0) {
		p.errorMsg(', Invalid arguments!', 3000);
		return;
	}

	const drops = await p.mongo.collection('cowoncydrop');
	const balances = await p.mongo.collection('cowoncy');
	const session = await p.mongo.startSession();
	try {
		session.startTransaction();
		const result = await drops.updateOne(
			{ channel: String(p.msg.channel.id), amount: { $gte: amount } },
			{ $inc: { amount: -amount } },
			{ session }
		);
		if (!result.modifiedCount) {
			await session.abortTransaction();
			await p.errorMsg(", there isn't enough cowoncy on the floor!", 3000);
			return;
		}

		await mongoNumeric.add(
			balances,
			{ id: String(p.msg.author.id) },
			'money',
			amount,
			{ upsert: true, session }
		);
		await session.commitTransaction();
	} catch (err) {
		if (session.inTransaction()) await session.abortTransaction();
		console.error(err);
		await p.errorMsg(', there was an error picking up cowoncy! Please try again later.', 3000);
		return;
	} finally {
		await session.endSession();
	}

	p.logger.incr('cowoncy', amount, { type: 'drop' }, p.msg);
	await p.replyMsg(p.config.emoji.cowoncy, `, you picked up **${amount} cowoncy**!`);
}
