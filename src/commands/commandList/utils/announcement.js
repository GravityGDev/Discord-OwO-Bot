/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');

module.exports = new CommandInterface({
	alias: ['announce', 'changelog', 'announcement', 'announcements'],

	args: '{disable|enable}',

	desc: "View the latest announcement! Announcements will also be displayed in your daily command! You can disable this by typing 'owo announcement disable'",

	example: ['owo announcement', 'owo announcement enable', 'owo announcement disable'],

	related: ['owo daily'],

	permissions: ['sendMessages', 'embedLinks', 'attachFiles'],

	group: ['utility'],

	cooldown: 10000,
	half: 100,
	six: 500,

	execute: function (p) {
		if (p.args[0] && (p.args[0] == 'disable' || p.args[0] == 'enable')) announcementSetting(p);
		else announcement(p);
	},
});

async function announcement(p) {
	const announcements = await p.mongo.collection('announcement');
	const result = await announcements.find({}).sort({ aid: -1 }).limit(1).next();
	if (!result) p.send('**📮 |** There are no announcements!', 3000);
	else {
		let embed = {
			author: {
				name: p.getName() + ', here is the latest announcement!',
				icon_url: p.msg.author.avatarURL,
			},
			color: p.config.embed_color,
			timestamp: new Date(result.adate),
			image: {
				url: result.url,
			},
		};
		p.send({ embed });
	}
}

async function announcementSetting(p) {
	try {
		const uid = await p.global.getUid(p.msg.author.id);
		const announcements = await p.mongo.collection('announcement');
		const preferences = await p.mongo.collection('user_announcement');
		const earliest = await announcements.find({}).sort({ aid: 1 }).limit(1).next();
		const disabled = p.args[0] == 'enable' ? 0 : 1;
		await preferences.updateOne(
			{ uid },
			{
				$set: { disabled },
				$setOnInsert: { uid, aid: earliest?.aid || 0 },
			},
			{ upsert: true }
		);

		if (disabled) {
			p.send('**📮 | ' + p.getName() + '** You have disabled announcements!');
		} else {
			p.send('**📮 | ' + p.getName() + '** You will now receive announcements in your daily command!');
		}
	} catch (err) {
		console.error(err);
		p.errorMsg(', failed to update your announcement setting. Please try again later.', 3000);
	}
}
