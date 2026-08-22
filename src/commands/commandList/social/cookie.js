/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');

const dateUtil = require('../../../utils/dateUtil.js');
const alterCookie = require('../patreon/alterCookie.js');

module.exports = new CommandInterface({
	alias: ['cookie', 'rep'],

	args: '{@user}',

	desc: 'Give a user a cookie!',

	example: ['owo cookie @user', 'owo cookie'],

	related: [],

	permissions: ['sendMessages'],

	group: ['social'],

	cooldown: 5000,
	half: 100,
	six: 500,
	bot: true,

	execute: function (p) {
		if (p.args.length == 0) display(p);
		else give(p, p.msg, p.send);
	},
});

async function give(p, msg, send) {
	let user = p.getMention(p.args[0]);
	if (!user) {
		user = await p.fetch.getMember(p.msg.channel.guild, p.args[0]);
		if (!user) {
			p.errorMsg(', I could not find that user!', 3000);
			p.setCooldown(5);
			return;
		}
	}
	if (msg.author.id == user.id) {
		p.errorMsg(", you can't give yourself a cookie, silly!", 3000);
		return;
	}

	const uid = await p.global.getUid(p.msg.author.id);
	const timers = await p.mongo.collection('timers');
	let timer = await timers.findOne({ uid }, { projection: { cookieTime: 1 } });
	let afterMid = dateUtil.afterMidnight(timer?.cookieTime);

	if (afterMid && !afterMid.after) {
		p.errorMsg(
			', Nu! You need to wait **' +
				afterMid.hours +
				'H ' +
				afterMid.minutes +
				'M ' +
				afterMid.seconds +
				'S**',
			3000
		);
		return;
	}

	const session = await p.mongo.startSession();
	try {
		session.startTransaction();
		timer = await timers.findOne({ uid }, { projection: { cookieTime: 1 }, session });
		afterMid = dateUtil.afterMidnight(timer?.cookieTime);
		if (afterMid && !afterMid.after) {
			await session.abortTransaction();
			p.errorMsg(
				`, Nu! You need to wait **${afterMid.hours}H ${afterMid.minutes}M ${afterMid.seconds}S**`,
				3000
			);
			return;
		}

		const reps = await p.mongo.collection('rep');
		await reps.updateOne(
			{ id: String(user.id) },
			{ $inc: { count: 1 }, $setOnInsert: { id: String(user.id) } },
			{ upsert: true, session }
		);
		await timers.updateOne(
			{ uid },
			{ $set: { cookieTime: afterMid.now }, $setOnInsert: { uid } },
			{ upsert: true, session }
		);
		await session.commitTransaction();
	} catch (err) {
		if (session.inTransaction()) await session.abortTransaction();
		console.error(err);
		p.errorMsg(', failed to send that cookie. Please try again later.', 3000);
		return;
	} finally {
		await session.endSession();
	}

	let text =
		'**<a:cookieeat:423020737364885525> | ' +
		p.getTag(user) +
		'**! You got a cookie from **' +
		p.getTag() +
		'**! *nom nom nom c:<*';
	text = await alterCookie.alter(p, text, {
		from: p.msg.author,
		to: user,
	});
	send(text);
	p.quest('cookieBy', 1, user);
	p.macro.checkToCommands(p, user.id);
}

async function display(p) {
	const uid = await p.global.getUid(p.msg.author.id);
	const timers = await p.mongo.collection('timers');
	const reps = await p.mongo.collection('rep');
	const timer = await timers.findOne({ uid }, { projection: { cookieTime: 1 } });
	const rep = await reps.findOne({ id: String(p.msg.author.id) }, { projection: { count: 1 } });
	let afterMid = dateUtil.afterMidnight(timer?.cookieTime);

	let count = rep?.count || 0;
	let again = 'You have one cookie to send!';
	const opt = { count, from: p.msg.author };

	if (afterMid && !afterMid.after) {
		const timerText = `${afterMid.hours}H ${afterMid.minutes}M ${afterMid.seconds}S`;
		opt.timer = timerText;
		again = `You can send a cookie in **${timerText}**!`;
	} else {
		opt.ready = true;
	}

	let text =
		'**<a:cookieeat:423020737364885525> | ' +
		p.getName() +
		'**! You currently have **' +
		count +
		'** cookies! Yummy! c:<\n**<:blank:427371936482328596> |** ' +
		again;
	text = await alterCookie.alter(p, text, opt);
	p.send(text);
}
