/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../CommandInterface.js');

module.exports = new CommandInterface({
	alias: ['points'],

	args: '',

	desc: "Gives the user a point. This is the same as just saying owo in your messages.\nYou weren't really suppose to find this.",

	example: [],

	related: [],

	cooldown: 10000,
	half: 90,
	six: 700,
	bot: true,

	execute: async function (p) {
		const uid = await p.global.getUid(p.msg.author.id);
		const users = await p.mongo.collection('user');
		const guilds = await p.mongo.collection('guild');

		await users.updateOne(
			{ id: String(p.msg.author.id) },
			{ $inc: { count: 1 }, $setOnInsert: { id: String(p.msg.author.id), uid } },
			{ upsert: true }
		);
		await guilds.updateOne(
			{ id: String(p.msg.channel.guild.id) },
			{ $inc: { count: 1 }, $setOnInsert: { id: String(p.msg.channel.guild.id) } },
			{ upsert: true }
		);

		p.quest('owo');
		p.logger.incr('cowoncy', 2, { type: 'points' }, p.msg);
		p.logger.incr('points', 1, {}, p.msg);
	},
});
