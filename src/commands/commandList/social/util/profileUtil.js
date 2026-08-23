/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const rings = require('../../../../data/rings.json');
const levels = require('../../../../utils/levels.js');
const localCardRenderer = require('../../../../utils/localCardRenderer.js');
const wallpaperUtil = require('../../../../utils/wallpaper.js');
const animalUtil = require('../../battle/util/animalUtil.js');
const offsetID = 200;
const settingEmoji = '⚙';

var display = (exports.display = async function (p, user) {
	try {
		const info = await generateJson(p, user);
		return await localCardRenderer.renderProfileCard(info);
	} catch (err) {
		console.error('[ProfileCard] Failed to render local profile image:', err);
		return null;
	}
});

async function generateJson(p, user) {
	let avatarURL = user.dynamicAvatarURL('png');
	avatarURL = avatarURL.replace(/\?[a-zA-Z0-9=?&]+/gi, '');

	let promises = [
		getMarriage(p, user),
		getRank(p, user),
		getCookie(p, user),
		getTeam(p, user),
		getBackground(p, user),
		levels.getUserLevel(user.id),
		getInfo(p, user),
	];
	promises = await Promise.all(promises);

	let marriage = promises[0];
	let rank = promises[1];
	let cookie = promises[2];
	let team = promises[3];
	let background = promises[4];
	let level = promises[5];
	let userInfo = promises[6];

	let aboutme = userInfo.about;
	let title = userInfo.title;
	let accent = userInfo.accent;
	let accent2 = userInfo.accent2;
	if (accent) background.color = accent;

	level = { lvl: level.level, maxxp: level.maxxp, currentxp: level.currentxp };

	let info = [];
	if (rank) info.push(rank);
	if (cookie) info.push(cookie);
	if (marriage) info.push(marriage);

	return {
		theme: {
			background: background.id,
			backgroundURL: background.url,
			name_color: background.color,
			accent,
			accent2,
		},
		user: {
			avatarURL,
			name: p.getName(user),
			title,
		},
		aboutme,
		level,
		info,
		team,
		rank,
		cookie,
		marriage,
	};
}

async function getRank(p, user) {
	let rank = p.global.toFancyNum(await levels.getUserRank(user.id));
	if (!rank || rank == 'NaN') rank = 'Last';
	else rank = '#' + rank;
	return {
		img: 'trophy.png',
		text: rank,
	};
}

async function getCookie(p, user) {
	const reps = await p.mongo.collection('rep');
	const result = await reps.findOne({ id: String(user.id) }, { projection: { count: 1 } });
	if (!result) return { img: 'cookie.png', text: '+0' };

	let count = result.count;
	count = '+' + shortenInt(count);
	return { img: 'cookie.png', text: count };
}

async function getMarriage(p, user) {
	const uid = await p.global.getUid(user.id);
	const marriages = await p.mongo.collection('marriage');
	const users = await p.mongo.collection('user');
	const result = await marriages.findOne({ $or: [{ uid1: uid }, { uid2: uid }] });

	if (!result) return;

	let ring = rings[result.rid];
	let so = uid == result.uid1 ? result.uid2 : result.uid1;
	const storedPartner = await users.findOne({ uid: so }, { projection: { id: 1 } });
	so = storedPartner?.id ? await p.fetch.getUser(String(storedPartner.id)) : null;
	let tag = '';
	if (!so) so = 'Someone';
	else so = p.getName(so);
	return { img: ring ? 'ring_' + ring.id + '.png' : 'ring.png', text: so, tag };
}

function shortenInt(value) {
	let newValue = value;
	if (value >= 1000) {
		let suffixes = ['', 'K', 'M', 'B', 'T'];
		let suffixNum = Math.floor((('' + value).length - 1) / 3);
		let shortValue = value / Math.pow(10, suffixNum * 3);
		let offset = Math.pow(10, 2 - Math.floor(Math.log10(shortValue)));
		if (offset == 0) shortValue = Math.round(shortValue);
		else shortValue = Math.round(shortValue * offset) / offset;
		newValue = shortValue + suffixes[suffixNum];
	}
	return newValue;
}

async function getTeam(p, user) {
	const uid = await p.global.getUid(user.id);
	const teams = await p.mongo.collection('pet_team');
	const activeTeams = await p.mongo.collection('pet_team_active');
	const teamAnimals = await p.mongo.collection('pet_team_animal');
	const animalsCollection = await p.mongo.collection('animal');

	const active = await activeTeams.findOne({ uid }, { projection: { pgid: 1 } });
	let team = active?.pgid ? await teams.findOne({ uid, pgid: active.pgid }) : null;
	if (!team) team = await teams.find({ uid }).sort({ pgid: 1 }).limit(1).next();
	if (!team) return;

	const slots = await teamAnimals.find({ pgid: team.pgid }).sort({ pos: -1 }).toArray();
	if (!slots.length) return;
	const pids = slots.map((slot) => slot.pid).filter((pid) => pid != null);
	const animalRows = pids.length
		? await animalsCollection.find({ pid: { $in: pids } }).toArray()
		: [];
	const byPid = new Map(animalRows.map((animal) => [animal.pid, animal]));

	let animals = [];
	for (let i in slots) {
		const row = byPid.get(slots[i].pid);
		if (!row) continue;
		let animal = p.global.validAnimal(row.name);
		if (animal) {
			let animalID = animal.value.match(/:[0-9]+>/g);
			if (animalID) animalID = animalID[0].match(/[0-9]+/g)[0];
			else animalID = animal.value.substring(1, animal.value.length - 1);
			if (animal.hidden) animalID = animal.hidden;
			animals.push({ img: animalID, info: animalUtil.toLvl(row.xp) });
		}
	}
	let name = team.tname;
	if (!name) name = 'My Team';
	return { name, animals };
}

async function getBackground(p, user) {
	const users = await p.mongo.collection('user');
	const profiles = await p.mongo.collection('user_profile');
	const backgrounds = await p.mongo.collection('backgrounds');
	const storedUser = await users.findOne({ id: String(user.id) }, { projection: { uid: 1 } });
	let bid = 1;
	if (storedUser) {
		const profile = await profiles.findOne({ uid: storedUser.uid }, { projection: { bid: 1 } });
		if (profile && profile.bid !== undefined && profile.bid !== null) bid = profile.bid;
	}

	const background = await backgrounds.findOne({ bid });
	if (!background) return { id: bid };
	return {
		id: background.bid,
		color: background.name_color,
		url: wallpaperUtil.getUrl(background),
	};
}

async function getInfo(p, user) {
	const users = await p.mongo.collection('user');
	const profiles = await p.mongo.collection('user_profile');
	const storedUser = await users.findOne({ id: String(user.id) }, { projection: { uid: 1 } });
	const result = storedUser ? await profiles.findOne({ uid: storedUser.uid }) : null;
	let info = {
		about: "I'm just a plain human.",
		title: 'An OwO Bot User',
	};
	if (result) {
		if (result.about) info.about = result.about;
		if (result.accent) info.accent = result.accent;
		if (result.accent2) info.accent2 = result.accent2;
		if (result.title) info.title = result.title;
	}
	return info;
}

//======================================================= PROFILE EDITS =========================================

var displayProfile = (exports.displayProfile = async function (p, user) {
	try {
		const data = await display(p, user);
		if (!data) throw new Error('Local profile renderer returned no image');
		await p.send('', null, { file: data, name: 'profile.png' });
	} catch (e) {
		console.error('[ProfileCard] Failed to send profile image:', e);
		p.errorMsg(', failed to create profile image... Try again later :(', 3000);
	}
});

exports.editBackground = async function (p) {
	if (p.args.length < 3) {
		p.errorMsg(', the correct command is `owo profile set wallpaper {wallpaperID}`', 3000);
		return;
	}

	let bid = p.args[2];
	if (!p.global.isInt(bid)) {
		p.errorMsg(', the correct command is `owo profile set wallpaper {wallpaperID}`', 3000);
		return;
	}
	bid = parseInt(bid) - offsetID;

	const uid = await getUid(p);
	const owned = await p.mongo.collection('user_backgrounds');
	const backgrounds = await p.mongo.collection('backgrounds');
	const ownership = await owned.findOne({ uid, bid });
	const background = ownership ? await backgrounds.findOne({ bid }) : null;
	if (!background) {
		p.errorMsg(", You don't have a wallpaper with this id! Please buy one from `owo shop`!", 3000);
		return;
	}

	const profiles = await p.mongo.collection('user_profile');
	await profiles.updateOne({ uid }, { $set: { bid: background.bid }, $setOnInsert: { uid } }, { upsert: true });
	await displayProfile(p, p.msg.author);
};

exports.editAbout = async function (p) {
	if (p.args.length < 3) {
		p.errorMsg(', Invalid arguments! Please use `owo profile set about {text}`', 6000);
		return;
	}

	let uid = await getUid(p);
	if (!uid) {
		p.errorMsg(', failed to change settings', 3000);
		return;
	}

	let about = p.args.slice(2, p.args.length).join(' ');
	const profiles = await p.mongo.collection('user_profile');
	await profiles.updateOne({ uid }, { $set: { about }, $setOnInsert: { uid } }, { upsert: true });
	await displayProfile(p, p.msg.author);
};

exports.editTitle = async function (p) {
	if (p.args.length < 3) {
		p.errorMsg(', Invalid arguments! Please use `owo profile set title {text}`', 6000);
		return;
	}

	let uid = await getUid(p);
	if (!uid) {
		p.errorMsg(', failed to change settings', 3000);
		return;
	}

	let title = p.args.slice(2, p.args.length).join(' ');
	const profiles = await p.mongo.collection('user_profile');
	await profiles.updateOne({ uid }, { $set: { title }, $setOnInsert: { uid } }, { upsert: true });
	await displayProfile(p, p.msg.author);
};

exports.editAccent = async function (p) {
	if (p.args.length < 3) {
		p.errorMsg(', Invalid arguments! Please use `owo profile set accent {#rgb}`', 6000);
		return;
	}

	let rgb = p.args
		.slice(2, p.args.length)
		.join('')
		.replace(/[#, ]+/gi, '')
		.toLowerCase();
	if (rgb.length != 6) {
		p.errorMsg(', Invalid RGB! The correct format should look like `#FFFFFF`', 6000);
		return;
	}
	rgb = parseRGB(rgb);
	if (!rgb) {
		p.errorMsg(', Invalid RGB! The correct format should look like `#FFFFFF`', 6000);
		return;
	}

	let uid = await getUid(p);
	if (!uid) {
		p.errorMsg(', failed to change settings', 3000);
		return;
	}
	const profiles = await p.mongo.collection('user_profile');
	await profiles.updateOne({ uid }, { $set: { accent: rgb }, $setOnInsert: { uid } }, { upsert: true });
	await displayProfile(p, p.msg.author);
};

exports.editAccent2 = async function (p) {
	if (p.args.length < 3) {
		p.errorMsg(', Invalid arguments! Please use `owo profile set accent2 {#rgb}`', 6000);
		return;
	}

	let rgb = p.args
		.slice(2, p.args.length)
		.join('')
		.replace(/[#, ]+/gi, '')
		.toLowerCase();
	if (rgb.length != 6) {
		p.errorMsg(', Invalid RGB! The correct format should look like `#FFFFFF`', 6000);
		return;
	}
	rgb = parseRGB(rgb);
	if (!rgb) {
		p.errorMsg(', Invalid RGB! The correct format should look like `#FFFFFF`', 6000);
		return;
	}

	let uid = await getUid(p);
	if (!uid) {
		p.errorMsg(', failed to change settings', 3000);
		return;
	}
	const profiles = await p.mongo.collection('user_profile');
	await profiles.updateOne({ uid }, { $set: { accent2: rgb }, $setOnInsert: { uid } }, { upsert: true });
	await displayProfile(p, p.msg.author);
};

exports.setPublic = async function (p) {
	let uid = await getUid(p);
	if (!uid) {
		p.errorMsg(', failed to change settings', 3000);
		return;
	}
	const profiles = await p.mongo.collection('user_profile');
	await profiles.updateOne({ uid }, { $set: { private: 0 }, $setOnInsert: { uid } }, { upsert: true });

	p.replyMsg(settingEmoji, ', Your profile can now be seen by anyone!');
};

exports.setPrivate = async function (p) {
	let uid = await getUid(p);
	if (!uid) {
		p.errorMsg(', failed to change settings', 3000);
		return;
	}
	const profiles = await p.mongo.collection('user_profile');
	await profiles.updateOne({ uid }, { $set: { private: 1 }, $setOnInsert: { uid } }, { upsert: true });

	p.replyMsg(settingEmoji, ', Your profile can **not** be seen by anyone!');
};

async function getUid(p) {
	return p.global.getUid(p.msg.author.id);
}

function parseRGB(rgb) {
	let rgb1 = parseInt(rgb.substring(0, 2), 16);
	if (rgb1 < 0 || rgb1 > 255) return;
	let rgb2 = parseInt(rgb.substring(2, 4), 16);
	if (rgb2 < 0 || rgb2 > 255) return;
	let rgb3 = parseInt(rgb.substring(4, 6), 16);
	if (rgb3 < 0 || rgb3 > 255) return;
	return rgb1 + ',' + rgb2 + ',' + rgb3 + ',255';
}
