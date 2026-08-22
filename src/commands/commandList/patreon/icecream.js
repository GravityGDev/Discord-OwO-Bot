/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');

const icecreamEmoji = '🍨';
const lord = '520399213683671074';
const words = [
	'Brain freeze!!!',
	'Yum!',
	'Delicious!',
	'*Drools...*',
	'Lucky!!',
	':0',
	'Yummy!',
	'Gimme gimme!',
];

module.exports = new CommandInterface({
	alias: ['icecream'],

	args: '{@user}',

	desc: 'Give an ice cream to someone! You can only gain ice cream if you receive it! This command was created by Łord',

	example: [],

	related: [],

	permissions: ['sendMessages'],

	group: ['patreon'],

	cooldown: 30000,
	half: 80,
	six: 400,
	bot: true,

	execute: async function (p) {
		if (p.args.length == 0) {
			await display(p);
			p.setCooldown(5);
		} else {
			let user = p.getMention(p.args[0]);
			if (!user) {
				user = await p.fetch.getMember(p.msg.channel.guild, p.args[0]);
				if (!user) {
					p.errorMsg(', Invalid syntax! Please tag a user!', 3000);
					p.setCooldown(5);
					return;
				}
			}
			if (user.id == p.msg.author.id) {
				p.errorMsg(', You cannot give ice cream to yourself!!', 3000);
				p.setCooldown(5);
				return;
			}
			await give(p, user);
		}
	},
});

async function display(p) {
	const uid = await p.global.getUid(p.msg.author.id);
	const collection = await p.mongo.collection('icecream');
	const result = await collection.findOne({ uid }, { projection: { count: 1 } });
	const count = Number(result?.count || 0);
	p.replyMsg(icecreamEmoji, ', You currently have **' + count + '** scoops of ice cream to give!');
}

async function give(p, user) {
	const senderUid = await p.global.getUid(p.msg.author.id);
	const receiverUid = await p.global.getUid(user.id);
	const collection = await p.mongo.collection('icecream');
	const session = await p.mongo.startSession();

	try {
		session.startTransaction();
		if (p.msg.author.id != lord) {
			const debit = await collection.updateOne(
				{ uid: senderUid, count: { $gt: 0 } },
				{ $inc: { count: -1 } },
				{ session }
			);
			if (!debit.modifiedCount) {
				await session.abortTransaction();
				p.errorMsg(', you do not have any ice cream! >:c', 3000);
				p.setCooldown(5);
				return;
			}
		}

		await collection.updateOne(
			{ uid: receiverUid },
			{ $inc: { count: 2 }, $setOnInsert: { uid: receiverUid } },
			{ upsert: true, session }
		);
		await session.commitTransaction();
	} catch (err) {
		if (session.inTransaction()) await session.abortTransaction();
		console.error(err);
		p.errorMsg(', I failed to give that ice cream. Please try again.', 3000);
		return;
	} finally {
		await session.endSession();
	}

	p.replyMsg(
		icecreamEmoji,
		', you gave two scoops of ice cream to **' +
			user.username +
			'**! ' +
			words[Math.floor(Math.random() * words.length)]
	);
}
