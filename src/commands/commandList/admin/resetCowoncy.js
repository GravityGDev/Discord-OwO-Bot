/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');

module.exports = new CommandInterface({
	alias: ['resetcowoncy'],

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

		const balances = await p.mongo.collection('cowoncy');
		const id = String(p.args[0]);
		const previous = await balances.findOne({ id }, { projection: { money: 1 } });
		if (previous) await balances.updateOne({ id }, { $set: { money: '0' } });
		const cowoncy = previous?.money;

		const warn = p.args.slice(1).join(' ');
		const user = await p.sender.msgUser(
			p.args[0],
			'**⚠ |** Your cowoncy has been reset due to: **' + warn + '**'
		);
		if (user && !user.dmError && cowoncy) {
			p.send(
				`📨 **|** Successfully reset cowoncy for **${p.getUniqueName(user)}**\n${
					p.config.emoji.blank
				} **|** Previously had: ${cowoncy} cowoncy`
			);
		} else if (cowoncy) {
			p.send(
				`⚠ **|** Successfully reset cowoncy for **${p.getUniqueName(user)}**\n${
					p.config.emoji.blank
				} **|** Previously had: ${cowoncy} cowoncy**\n${
					p.config.emoji.blank
				} **|** I couldn't DM them.`
			);
		} else {
			p.send('⚠ **|** Failed to reset cowoncy');
		}
	},
});
