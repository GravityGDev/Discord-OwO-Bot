/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');

module.exports = new CommandInterface({
	alias: ['lift'],

	owner: true,
	admin: true,

	execute: async function (p) {
		let time;
		let hasTime = false;
		if (p.args[1] && p.global.isInt(p.args[1])) {
			time = parseInt(p.args[1]);
			hasTime = true;
		} else if (p.args[1]) {
			p.errorMsg(', Wrong time format');
			return;
		}

		if (!p.global.isUser('<@' + p.args[0] + '>')) {
			p.errorMsg(', Invalid user id');
			return;
		}

		const timeout = await p.mongo.collection('timeout');
		const changes = { penalty: 0 };
		if (hasTime) changes.prev_penalty = time;
		await timeout.updateMany({ id: String(p.args[0]) }, { $set: changes });

		let user, guild;
		if (
			(user = await p.sender.msgUser(
				p.args[0],
				'**🙇 |** Your penalty has been lifted by an admin! Sorry for the inconvenience!'
			))
		) {
			if (user.dmError) {
				p.send('⚠ **|** Penalty has been set to 0 for ' + user.username + ", I couldn't DM them.");
			} else {
				p.send('Penalty has been set to 0 for ' + user.username);
			}
		} else if ((guild = await p.fetch.getGuild(p.args[0], false)))
			p.send('Penalty has been set to 0 for guild: ' + guild.name);
		else p.send('Failed to set penalty for that user');
	},
});
