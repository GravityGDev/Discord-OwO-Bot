/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const request = require('request');
const levels = require('../../../../utils/levels.js');

exports.display = async function (p, user, opt) {
	let info = await generateJson(p, user, opt);
	info.password = process.env.GEN_PASS;

	try {
		return new Promise((resolve, _reject) => {
			request(
				{
					method: 'POST',
					uri: `${process.env.GEN_API_HOST}/levelgen`,
					json: true,
					body: info,
				},
				(error, res, body) => {
					if (error) {
						resolve('');
						return;
					}
					if (res.statusCode == 200) resolve(body);
					else resolve('');
				}
			);
		});
	} catch (err) {
		console.error(err);
		return '';
	}
};

async function generateJson(p, user, opt) {
	let avatarURL = user.dynamicAvatarURL('png');
	avatarURL = avatarURL.replace(/\?[a-zA-Z0-9=?&]+/gi, '');

	let promises = [
		getRank(p, user, opt),
		getBackground(p, user),
		opt.guild
			? levels.getUserServerLevel(user.id, p.msg.channel.guild.id)
			: levels.getUserLevel(user.id),
		getInfo(p, user),
	];
	promises = await Promise.all(promises);

	let rank = promises[0];
	let background = promises[1];
	let level = promises[2];
	let userInfo = promises[3];

	let aboutme = userInfo.about;
	let accent = userInfo.accent;
	let accent2 = userInfo.accent2;
	let title = userInfo.title;

	level = { lvl: level.level, maxxp: level.maxxp, currentxp: level.currentxp };

	return {
		theme: {
			background: background.id,
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
		rank,
	};
}

async function getRank(p, user, opt) {
	let rank;
	if (opt.guild)
		rank = p.global.toFancyNum(await levels.getUserServerRank(user.id, p.msg.channel.guild.id));
	else rank = p.global.toFancyNum(await levels.getUserRank(user.id));
	if (!rank || rank == 'NaN') rank = 'Last';
	else rank = '#' + rank;
	return {
		img: 'trophy.png',
		text: rank,
	};
}

async function getBackground(p, user) {
	const users = await p.mongo.collection('user');
	const profiles = await p.mongo.collection('user_profile');
	const backgrounds = await p.mongo.collection('backgrounds');
	const storedUser = await users.findOne({ id: String(user.id) }, { projection: { uid: 1 } });
	if (!storedUser) return { id: 1 };
	const profile = await profiles.findOne({ uid: storedUser.uid }, { projection: { bid: 1 } });
	if (!profile?.bid) return { id: 1 };
	const background = await backgrounds.findOne({ bid: profile.bid });
	if (!background) return { id: 1 };
	return { id: background.bid, color: background.name_color };
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
