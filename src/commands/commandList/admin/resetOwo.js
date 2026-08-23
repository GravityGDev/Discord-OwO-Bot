/*
 * OwO Bot for Discord
 * Copyright (C) 2021 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');

module.exports = new CommandInterface({
	alias: ['resetowo'],

	owner: true,
	admin: true,

	execute: async function (p) {
		if (p.args.length <= 1) {
			p.errorMsg(', Please include a reset reason', 3000);
			return;
		}

		if (!p.global.isUser('<@' + p.args[0] + '>')) {
			p.errorMsg(', Invalid user id', 3000);
			return;
		}

		const id = String(p.args[0]);
		const users = await p.mongo.collection('user');
		const guilds = await p.mongo.collection('guild');
		const storedUser = await users.findOne({ id }, { projection: { count: 1 } });
		const storedGuild = await guilds.findOne({ id }, { projection: { count: 1 } });

		if (storedUser) {
			await users.updateOne({ id }, { $set: { count: 0 } });
		} else if (storedGuild) {
			await guilds.updateOne({ id }, { $set: { count: 0 } });
			const guild = await p.fetch.getGuild(id);
			const guildName = guild ? guild.name : id;
			return p.send(
				`📨 **|** Successfully reset owo count for **${guildName}**\n${p.config.emoji.blank} **|** Previously had: ${storedGuild.count || 0} owos`
			);
		} else {
			return p.send(`⚠ **|** Failed to reset owo count for ${id}`);
		}

		const count = storedUser.count || 0;
		let warn = p.args.slice(1).join(' ');
		let user = await p.sender.msgUser(id, '**⚠ |** Your owo count has been reset due to: **' + warn + '**');
		if (user && !user.dmError) {
			p.send(
				`📨 **|** Successfully reset owo count for **${p.getUniqueName(user)}**\n${p.config.emoji.blank} **|** Previously had: ${count} owos`
			);
		} else {
			const label = user ? p.getUniqueName(user) : id;
			p.send(
				`⚠ **|** Successfully reset owo count for **${label}**\n${p.config.emoji.blank} **|** Previously had: ${count} owos\n${p.config.emoji.blank} **|** I couldn't DM them.`
			);
		}
	},
});
