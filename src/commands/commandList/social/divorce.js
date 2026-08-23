/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');

const rings = require('../../../data/rings.json');
const yes = '✅';
const no = '❎';
const heartBreak = '💔';
const heartBeat = '💝';
const dateOptions = {
	weekday: 'short',
	year: 'numeric',
	month: 'short',
	day: 'numeric',
};

module.exports = new CommandInterface({
	alias: ['divorce'],

	args: '',

	desc: 'Escape your marriage',

	example: [],

	related: ['owo marry', 'owo dm'],

	permissions: ['sendMessages', 'embedLinks', 'addReactions'],

	group: ['social'],

	cooldown: 3000,

	execute: async function (p) {
		const uid = await p.global.getUid(p.msg.author.id);
		const marriages = await p.mongo.collection('marriage');
		const marriage = await marriages.findOne({ $or: [{ uid1: uid }, { uid2: uid }] });

		if (!marriage) {
			p.errorMsg(", you can't divorce if you aren't married, silly butt!", 3000);
			return;
		}

		let ring = rings[marriage.rid];
		let soUid = uid == marriage.uid1 ? marriage.uid2 : marriage.uid1;
		const users = await p.mongo.collection('user');
		const storedPartner = await users.findOne({ uid: soUid }, { projection: { id: 1 } });
		const so = storedPartner?.id ? await p.fetch.getUser(String(storedPartner.id)) : null;
		const marriedDate = new Date(marriage.marriedDate);
		const days = Math.max(0, Math.floor((Date.now() - marriedDate.getTime()) / 86400000));

		let embed = {
			author: {
				name:
					p.getName() + ', are you sure you want to divorce' + (so ? ' ' + so.username : '') + '?',
				icon_url: p.msg.author.avatarURL,
			},
			description:
				'You married on **' +
				marriedDate.toLocaleDateString('default', dateOptions) +
				'** and have been married for **' +
				days +
				'** days and claimed **' +
				(marriage.dailies || 0) +
				'** dailies together... Once you divorce, the ring will break and disappear.',
			thumbnail: {
				url:
					'https://cdn.discordapp.com/emojis/' +
					ring.emoji.match(/[0-9]+/)[0] +
					'.' +
					(ring.id > 5 ? 'gif' : 'png'),
			},
			color: p.config.embed_color,
		};
		let msg = await p.send({ embed });

		await msg.addReaction(yes);
		await msg.addReaction(no);
		let filter = (emoji, userID) =>
			(emoji.name === yes || emoji.name === no) && userID === p.msg.author.id;
		let collector = p.reactionCollector.create(msg, filter, { time: 60000 });
		let reacted = false;
		collector.on('collect', async (emoji) => {
			if (reacted) return;
			reacted = true;
			if (emoji.name == yes) {
				const removed = await marriages.deleteOne({ uid1: marriage.uid1, uid2: marriage.uid2 });
				if (removed.deletedCount) {
					embed.description += '\n\n ' + heartBreak + ' You have decided to divorce.';
				} else {
					embed.description += '\n\n 🚫 This marriage no longer exists.';
				}
				collector.stop();
			} else {
				embed.description += '\n\n ' + heartBeat + ' You have decided to stay married!';
				collector.stop();
			}
		});

		collector.on('end', async function (_collected) {
			embed.color = 6381923;
			await msg.edit({ embed });
		});
	},
});
