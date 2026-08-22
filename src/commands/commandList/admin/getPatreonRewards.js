/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');
const mongoNumeric = require('../../../utils/mongoNumeric.js');
const patreon = require('../../../botHandlers/patreonHandler.js');
var cowoncy = [
	'184587051943985152',
	'184587051943985152',
	'184587051943985152',
	'184587051943985152',
	'184587051943985152',
	'184587051943985152',
	'184587051943985152',
];

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

async function getPatreons(p) {
	let patreons;
	try {
		patreons = await patreon.request(p.args.join(' '));
	} catch (err) {
		console.error(err);
		return;
	}
	let result = [];
	if (p.args[0] != 'ignoresql') {
		result = await getActivePatreonUsers(p);
	}

	let text = '';

	console.log('customized commands');
	if (patreons.customizedCommand.length) {
		text += '**Customized Command**\n';
		let list = patreons.customizedCommand;
		for (let i in list) {
			text += '<@' + list[i].discord + '> | **' + list[i].name + '** | ' + list[i].discord + '\n';
		}
	}

	console.log('custom commands');
	if (patreons.customCommand.length) {
		text += '\n**Custom Command**\n';
		let list = patreons.customCommand;
		for (let i in list) {
			text += '<@' + list[i].discord + '> | **' + list[i].name + '** | ' + list[i].discord + '\n';
		}
	}

	console.log('custom pet');
	let csv =
		'Discord Name,Discord ID,Patreon Name,Pet Name,hp str pr wp mag mr,Pet Desc,Pet ID,MongoDB\n';
	if (patreons.pet.length) {
		text += '\n**Custom Pet**\n';
		let list = patreons.pet;
		for (let i in list) {
			text += '<@' + list[i].discord + '> | **' + list[i].name + '** | ' + list[i].discord + '\n';
			let user = await p.fetch.getUser(list[i].discord);
			csv += (user ? user.username : 'A User') + ',' + list[i].discord + ',' + list[i].name + '\n';
		}
	}

	console.log('monthly cowoncy');
	cowoncy = [];
	if (patreons.cowoncy.length) {
		let list = patreons.cowoncy;
		for (let i in list) {
			if (list[i].discord && !cowoncy.includes(String(list[i].discord))) {
				cowoncy.push(String(list[i].discord));
			}
		}
		for (let i in result) {
			if (!cowoncy.includes(String(result[i].id))) cowoncy.push(String(result[i].id));
		}
	}

	console.log('done');

	await p.send(text, null, null, { split: true });
	await p.send(
		'Type `owo distributecowoncy {amount}` to send monthly cowoncy to ' +
			patreons.cowoncy.length +
			'+' +
			result.length +
			' users'
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
	p.send(text);
}
