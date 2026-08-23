/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');

const tada = '🎉';
const gear = '⚙';

module.exports = new CommandInterface({
	alias: ['addpatreon', 'addpatreons'],

	owner: true,

	execute: async function (p) {
		if (p.command == 'addpatreon') {
			let { user, date } = await addPatreon(p, p.args[0], p.args[1], p.args[2]);
			await p.replyMsg(
				tada,
				`, Updated **${p.getUniqueName(user)}** patreon perks until **${date}**`
			);
		} else {
			await addPatreons(p);
		}
	},
});

async function addPatreons(p) {
	let success = '**Success**\n';
	let failed = '**Failed**\n';
	let lines = p.args.join(' ').split(/\n+/gi);
	for (let line of lines) {
		const args = line
			.replace(/[^ \d]/gi, ' ')
			.trim()
			.split(/\s+/gi);
		try {
			let result = await addPatreon(p, args[0], args[1], args[2]);
			if (result) {
				success += `\`${p.getUniqueName(result.user)} -> ${result.date}\`\n`;
			} else {
				failed += `\`failed for [${args.join(', ')}]\`\n`;
			}
		} catch (err) {
			console.error(err);
			failed += `failed for [${args.join(', ')}]\n`;
		}
	}

	p.send(success + failed);
}

function fullMonthsPassed(start, now = new Date()) {
	if (!start) return 0;
	start = new Date(start);
	let months = (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth();
	const anniversary = new Date(start);
	anniversary.setMonth(anniversary.getMonth() + months);
	if (anniversary > now) months--;
	return Math.max(0, months);
}

async function addPatreon(p, id, addMonths = 1, type = 1) {
	if (!p.global.isUser(id) && !p.global.isUser('<@' + id + '>')) {
		p.errorMsg(', Invalid user id: ' + id, 3000);
		return;
	}

	if (addMonths && p.global.isInt(addMonths)) addMonths = parseInt(addMonths);

	if (type && p.global.isInt(type)) type = parseInt(type);
	if (type && (type > 3 || type < 1)) {
		p.errorMsg(', wrong patreon types for ' + id);
		return;
	}

	const uid = await p.global.getUid(id);
	const patreons = await p.mongo.collection('patreons');
	const current = await patreons.findOne({ uid });
	const months = current?.patreonMonths || 0;
	const monthsPassed = current?.patreonTimer
		? fullMonthsPassed(current.patreonTimer)
		: months;

	if (!type) type = current?.patreonType || 1;

	let date;
	if (!current || months <= monthsPassed) {
		const timer = new Date();
		await patreons.updateOne(
			{ uid },
			{
				$set: {
					uid,
					patreonType: type,
					patreonMonths: addMonths,
					patreonTimer: timer,
				},
			},
			{ upsert: true }
		);
		date = new Date(timer);
		date.setMonth(date.getMonth() + addMonths);
	} else {
		await patreons.updateOne(
			{ uid },
			{ $set: { patreonType: type }, $inc: { patreonMonths: addMonths } }
		);
		date = new Date(current.patreonTimer);
		date.setMonth(date.getMonth() + addMonths + months);
	}
	date = date.toString();

	let user;
	if (addMonths > 0)
		user = await p.sender.msgUser(
			id,
			`${tada} **|** Your patreon has been extended by ${addMonths} month(s)!\n${p.config.emoji.blank} **|** Expires on: **${date}**`
		);
	else
		user = await p.sender.msgUser(
			id,
			`${gear} **|** Your patreon perks have been changed!\n${p.config.emoji.blank} **|** Expires on: **${date}**`
		);
	if (user && !user.dmError) return { user, date };
	else await p.errorMsg(', Failed to message user for ' + id, 3000);
}
