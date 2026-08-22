/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');
const mongoNumeric = require('../../../utils/mongoNumeric.js');
const patreon = require('../../../botHandlers/patreonHandler.js');
const config = require('../../../data/config.json');
let cowoncy = [config.owner];

module.exports = new CommandInterface({
	alias: ['getpatreons', 'distributecowoncy'],

	owner: true,

	execute: async function (p) {
		if (p.command == 'getpatreons') {
			console.log('Starting fetching patreons...');
			await getPatreons(p);
		} else {
			await distributeCowoncy(p);
		}
	},
});

function isActivePatreon(row) {
	if (!row?.patreonTimer || !row?.patreonMonths) return false;
	const expires = new Date(row.patreonTimer);
	expires.setMonth(expires.getMonth() + Number(row.patreonMonths));
	return expires > new Date();
}

async function getActivePatreonUsers(p) {
	const patreonsCollection = await p.mongo.collection('patreons');
	const active = (await patreonsCollection.find({ patreonMonths: { $gt: 0 } }).toArray()).filter(
		isActivePatreon
	);
	if (!active.length) return [];

	const uids = active.map((row) => row.uid);
	const users = await p.mongo.collection('user');
	const rows = await users.find({ uid: { $in: uids } }, { projection: { id: 1 } }).toArray();
	return rows.map((row) => ({ id: String(row.id) }));
}

function displayPatreonUser(entry) {
	const discord = entry.discord ? String(entry.discord) : 'Discord not linked';
	const mention = entry.discord ? `<@${entry.discord}>` : 'No Discord account';
	return `${mention} | **${entry.name || 'Hidden Patreon member'}** | ${discord}\n`;
}

async function getPatreons(p) {
	const cookie = process.env.PATREON_COOKIE;
	if (!cookie) {
		await p.errorMsg(', PATREON_COOKIE is not configured in the private .env file.', 5000);
		return;
	}

	let patreons;
	try {
		patreons = await patreon.request(cookie);
	} catch (err) {
		console.error(err);
		return;
	}

	const flags = new Set(p.args.map((arg) => String(arg).toLowerCase()));
	const ignoreStoredPatreons = flags.has('ignoremongo') || flags.has('ignoresql');
	let result = [];
	if (!ignoreStoredPatreons) {
		result = await getActivePatreonUsers(p);
	}

	let text = '';

	console.log('customized commands');
	if (patreons.customizedCommand.length) {
		text += '**Customized Command**\n';
		for (const entry of patreons.customizedCommand) text += displayPatreonUser(entry);
	}

	console.log('custom commands');
	if (patreons.customCommand.length) {
		text += '\n**Custom Command**\n';
		for (const entry of patreons.customCommand) text += displayPatreonUser(entry);
	}

	console.log('custom pet');
	let csv =
		'Discord Name,Discord ID,Patreon Name,Pet Name,hp str pr wp mag mr,Pet Desc,Pet ID,MongoDB\n';
	if (patreons.pet.length) {
		text += '\n**Custom Pet**\n';
		for (const entry of patreons.pet) {
			text += displayPatreonUser(entry);
			let user;
			if (entry.discord) user = await p.fetch.getUser(String(entry.discord));
			csv +=
				(user ? user.username : 'A User') +
				',' +
				(entry.discord || '') +
				',' +
				(entry.name || 'Hidden Patreon member') +
				'\n';
		}
	}

	console.log('monthly cowoncy');
	cowoncy = [];
	if (patreons.cowoncy.length) {
		for (const entry of patreons.cowoncy) {
			if (entry.discord && !cowoncy.includes(String(entry.discord))) {
				cowoncy.push(String(entry.discord));
			}
		}
	}
	for (const entry of result) {
		if (!cowoncy.includes(String(entry.id))) cowoncy.push(String(entry.id));
	}

	console.log('done');

	if (text) await p.send(text, null, null, { split: true });
	await p.send(
		'Type `owo distributecowoncy {amount}` to send monthly cowoncy to ' +
			cowoncy.length +
			' unique users'
	);
	await p.send('```' + csv + '```', null, null, {
		split: { prepend: '```', append: '```' },
	});
}

async function distributeCowoncy(p) {
	if (p.args.length != 1 || !p.global.isInt(p.args[0])) {
		p.errorMsg(', Invalid param', 4000);
		return;
	}
	const amount = parseInt(p.args[0]);
	const balances = await p.mongo.collection('cowoncy');
	let modified = 0;
	for (const id of [...new Set(cowoncy.map(String))]) {
		const result = await mongoNumeric.add(
			balances,
			{ id },
			'money',
			amount,
			{ upsert: true },
			{ id }
		);
		modified += result.modifiedCount || result.upsertedCount || 0;
	}

	let text =
		'Distributed ' +
		amount +
		' cowoncy to ' +
		cowoncy.length +
		' users\n```json\n' +
		JSON.stringify({ recipients: cowoncy.length, modified }, null, 2) +
		'```';
	await p.send(text);
}
