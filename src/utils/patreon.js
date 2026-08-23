/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

let main;

exports.parsePatreon = function (query) {
	if (!query || !query.patreonMonths) return null;

	let months = query.patreonMonths;
	let started = query.patreonTimer;
	let passed = query.monthsPassed;
	let type = query.patreonType;
	let animal = false;
	let cowoncy = false;

	switch (type) {
		case 1:
			animal = true;
			break;
		case 3:
			animal = true;
			cowoncy = true;
			break;
		default:
			return null;
	}

	if (passed >= months) return null;
	if (!started || !months) return null;
	let expireDate = new Date(started);
	expireDate.setMonth(expireDate.getMonth() + months);

	return { animal, cowoncy, expireDate };
};

exports.parseSecondPatreon = function (query) {
	const expireDate = new Date(query.endDate);
	let animal = false;
	let cowoncy = false;

	if (expireDate < new Date()) return null;

	switch (query.patreonType) {
		case 1:
			animal = true;
			break;
		case 3:
			animal = true;
			cowoncy = true;
			break;
		default:
			return null;
	}

	return { animal, cowoncy, expireDate };
};

exports.update = function (guild, oldMember, newMember) {
	if (guild.id != '420104212895105044') return;

	if (oldMember.roles.includes('449429399217897473')) {
		if (!newMember.roles.includes('449429399217897473')) {
			lostDaily(newMember);
		}
	} else if (newMember.roles.includes('449429399217897473')) {
		gainedDaily(newMember);
	}

	if (oldMember.roles.includes('449429255781351435')) {
		if (!newMember.roles.includes('449429255781351435')) {
			lostAnimal(newMember);
		}
	} else if (newMember.roles.includes('449429255781351435')) {
		gainedAnimal(newMember);
	}
};

exports.left = async function (guild, member) {
	if (guild.id != '420104212895105044') return;
	const users = await main.mongo.collection('user');
	await users.updateOne(
		{ id: String(member.id) },
		{ $set: { patreonDaily: 0, patreonAnimal: 0 } }
	);
};

function messageUser(_user) {
	return;
}

async function ensureUser(id) {
	await main.global.getUid(id);
	return main.mongo.collection('user');
}

async function gainedDaily(user) {
	const users = await ensureUser(user.id);
	const before = await users.findOne({ id: String(user.id) }, { projection: { patreonAnimal: 1 } });
	await users.updateOne({ id: String(user.id) }, { $set: { patreonDaily: 1 } });
	if (before && !before.patreonAnimal) await messageUser(user);
}

async function lostDaily(user) {
	const users = await main.mongo.collection('user');
	await users.updateOne({ id: String(user.id) }, { $set: { patreonDaily: 0 } });
}

async function gainedAnimal(user) {
	const users = await ensureUser(user.id);
	const before = await users.findOne({ id: String(user.id) }, { projection: { patreonDaily: 1 } });
	await users.updateOne({ id: String(user.id) }, { $set: { patreonAnimal: 1 } });
	if (before && !before.patreonDaily) await messageUser(user);
}

async function lostAnimal(user) {
	const users = await main.mongo.collection('user');
	await users.updateOne({ id: String(user.id) }, { $set: { patreonAnimal: 0 } });
}

exports.checkPatreon = function (p, userID) {
	p.pubsub.publish('checkPatreon', { userID });
};

exports.init = function (main_) {
	main = main_;
};
