/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');
const mongoNumeric = require('../../../utils/mongoNumeric.js');

module.exports = new CommandInterface({
	alias: ['giveall'],

	owner: true,

	execute: async function (p) {
		let amount = 0;
		if (p.global.isInt(p.args[0])) amount = parseInt(p.args[0]);
		else return;

		const ids = [];
		p.msg.channel.guild.members.forEach((_member, id) => ids.push(String(id)));
		const cowoncy = await p.mongo.collection('cowoncy');
		await cowoncy.updateMany(
			{ id: { $in: ids } },
			[
				{
					$set: {
						money: {
							$toString: {
								$add: [mongoNumeric.fieldAsDecimal('money'), mongoNumeric.decimal(amount)],
							},
						},
					},
				},
			]
		);
		p.send('**💎 |** ' + p.getName() + ' gave @everyone ' + amount + ' cowoncy!!!');
	},
});
