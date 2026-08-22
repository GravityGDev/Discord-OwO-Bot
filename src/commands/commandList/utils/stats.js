/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');
const request = require('request');

module.exports = new CommandInterface({
	alias: ['stats', 'stat', 'info'],

	args: '',

	desc: 'Some bot stats!',

	example: [],

	related: [],

	permissions: ['sendMessages', 'embedLinks'],

	group: ['utility'],

	cooldown: 60000,
	half: 100,
	six: 500,

	execute: async function (p) {
		const client = p.client;
		const msg = p.msg;
		const userCollection = await p.mongo.collection('user');
		const animalCounts = await p.mongo.collection('animal_count');
		const disabledCollection = await p.mongo.collection('disabled');

		const { guilds, users } = await fetchInfo();
		const ping = p.client.shards.get(p.client.guildShardMap[p.msg.channel.guild.id]).latency;

		const userCount = await userCollection.countDocuments({});
		const userTotals = await userCollection
			.aggregate([{ $group: { _id: null, total: { $sum: { $ifNull: ['$count', 0] } } } }])
			.toArray();
		const animalTotals = await animalCounts
			.aggregate([
				{
					$group: {
						_id: null,
						common: { $sum: { $ifNull: ['$common', 0] } },
						uncommon: { $sum: { $ifNull: ['$uncommon', 0] } },
						rare: { $sum: { $ifNull: ['$rare', 0] } },
						epic: { $sum: { $ifNull: ['$epic', 0] } },
						mythical: { $sum: { $ifNull: ['$mythical', 0] } },
						legendary: { $sum: { $ifNull: ['$legendary', 0] } },
					},
				},
			])
			.toArray();
		const disabledRows = await disabledCollection
			.find({ channel: String(msg.channel.id) }, { projection: { command: 1 } })
			.toArray();

		const counts = animalTotals[0] || {
			common: 0,
			uncommon: 0,
			rare: 0,
			epic: 0,
			mythical: 0,
			legendary: 0,
		};
		const totalAnimals =
			Number(counts.common || 0) +
			Number(counts.uncommon || 0) +
			Number(counts.rare || 0) +
			Number(counts.epic || 0) +
			Number(counts.mythical || 0) +
			Number(counts.legendary || 0);
		let disabled = disabledRows.map((row) => row.command).join(', ');
		if (disabled == '') disabled = 'no disabled commands';

		const embed = {
			description:
				"Here's a little bit of information! If you need help with commands, type `owo help`.",
			color: p.config.embed_color,
			timestamp: new Date(),
			author: {
				name: 'OwO Bot Information',
				url: 'https://discordapp.com/api/oauth2/authorize?client_id=408785106942164992&permissions=444480&scope=bot',
				icon_url:
					'https://cdn.discordapp.com/app-icons/408785106942164992/00d934dce5e41c9e956aca2fd3461212.png',
			},
			fields: [
				{
					name: 'Current Guild',
					value:
						'```md\n<userID:  ' +
						msg.author.id +
						'>\n<channelID: ' +
						msg.channel.id +
						'>\n<guildID:   ' +
						msg.channel.guild.id +
						'>```',
				},
				{
					name: 'Global information',
					value:
						'```md\n<TotalOwOs:  ' +
						p.global.toFancyNum(userTotals[0]?.total || 0) +
						'>\n<OwOUsers:   ' +
						p.global.toFancyNum(userCount) +
						'>``````md\n<animalsCaught: ' +
						p.global.toFancyNum(totalAnimals) +
						'>\n<common: ' +
						p.global.toFancyNum(counts.common || 0) +
						'>\n<uncommon: ' +
						p.global.toFancyNum(counts.uncommon || 0) +
						'>\n<rare: ' +
						p.global.toFancyNum(counts.rare || 0) +
						'>\n<epic: ' +
						p.global.toFancyNum(counts.epic || 0) +
						'>\n<mythical: ' +
						p.global.toFancyNum(counts.mythical || 0) +
						'>\n<legendary: ' +
						p.global.toFancyNum(counts.legendary || 0) +
						'>```',
				},
				{
					name: 'Bot Information',
					value:
						'```md\n<Guilds:    ' +
						p.global.toFancyNum(guilds) +
						'>\n<Channels:  alot>\n<Users:     ' +
						p.global.toFancyNum(users) +
						'>``````md\n<Ping:       ' +
						ping +
						'ms>\n<UpdatedOn:  ' +
						new Date(client.startTime) +
						'>\n<Uptime:     ' +
						client.uptime +
						'>```',
				},
			],
		};
		p.send({ embed });
	},
});

function fetchInfo() {
	return new Promise((resolve, reject) => {
		setTimeout(function () {
			request(
				{
					method: 'GET',
					uri: process.env.SHARDER_HOST + '/botinfo',
				},
				(error, res, body) => {
					if (error) {
						reject();
						return;
					}
					if (res.statusCode == 200) resolve(JSON.parse(body));
					else reject();
				}
			);
		}, 500);
	});
}
