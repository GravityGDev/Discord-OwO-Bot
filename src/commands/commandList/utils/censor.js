/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');

module.exports = new CommandInterface({
	alias: ['censor'],

	args: '',

	desc: 'This will censor any bad words displayed in battle!',

	example: [],

	related: ['owo uncensor'],

	permissions: ['sendMessages'],

	group: ['utility'],

	cooldown: 5000,
	half: 100,
	six: 500,

	execute: async function (p) {
		if (!p.msg.member.permissions.has('manageChannels')) {
			p.send('**🚫 | ' + p.getName() + '**, You are not an admin!', 3000);
			return;
		}
		if (p.args.length > 0) {
			p.send('**🚫 | ' + p.getName() + '**, Invalid Arguments!', 3000);
			return;
		}

		const guilds = await p.mongo.collection('guild');
		const id = String(p.msg.channel.guild.id);
		await guilds.updateOne(
			{ id },
			{ $set: { young: 1 }, $setOnInsert: { id, count: 0 } },
			{ upsert: true }
		);
		p.send(
			'**⚙ |** This guild is now kid friendly! Any offensive names in `battle` will be censored!'
		);
	},
});
