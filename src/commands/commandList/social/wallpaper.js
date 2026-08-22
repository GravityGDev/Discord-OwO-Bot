/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');

const offsetID = 200;
const nextPageEmoji = '➡️';
const prevPageEmoji = '⬅️';
const buyEmoji = '🖼️';

module.exports = new CommandInterface({
	alias: ['wallpaper', 'wp', 'wallpapers', 'background', 'backgrounds'],

	args: '{id}',

	desc: 'View your current wallpapers! Equipped them by clicking the wallpaper emoji.\nYou can buy more wallpapers from the shop.',

	example: ['owo wallpaper', 'owo wallpaper 201'],

	related: ['owo shop', 'owo profile'],

	permissions: ['sendMessages', 'embedLinks', 'attachFiles', 'addReactions'],

	group: ['social'],

	cooldown: 15000,

	execute: async function (p) {
		let totalPages = await getTotalPages(p);
		let currentPage = 1;
		let page = await createPage(p, currentPage, totalPages);
		let msg = await p.send(page);

		if (totalPages <= 0) return;

		let filter = (emoji, userID) =>
			(emoji.name === buyEmoji || emoji.name === nextPageEmoji || emoji.name === prevPageEmoji) &&
			userID == p.msg.author.id;
		let collector = p.reactionCollector.create(msg, filter, {
			time: 900000,
			idle: 120000,
		});

		await msg.addReaction(prevPageEmoji);
		await msg.addReaction(nextPageEmoji);
		await msg.addReaction(buyEmoji);

		collector.on('collect', async function (emoji) {
			if (emoji.name === nextPageEmoji) {
				if (currentPage < totalPages) currentPage++;
				else currentPage = 1;
				page = await createPage(p, currentPage, totalPages);
				await msg.edit(page);
			} else if (emoji.name === prevPageEmoji) {
				if (currentPage > 1) currentPage--;
				else currentPage = totalPages;
				page = await createPage(p, currentPage, totalPages);
				await msg.edit(page);
			} else if (emoji.name == buyEmoji) {
				if (page.embed.bid) {
					const uid = await p.global.getUid(p.msg.author.id);
					const profiles = await p.mongo.collection('user_profile');
					await profiles.updateOne(
						{ uid },
						{ $set: { bid: page.embed.bid }, $setOnInsert: { uid } },
						{ upsert: true }
					);
					page = await createPage(p, currentPage, totalPages);
					await msg.edit(page);
				}
			}
		});

		collector.on('end', async function (_collected) {
			page = await createPage(p, currentPage, totalPages);
			page.embed.color = 6381923;
			await msg.edit({
				content: 'This message is now inactive',
				embed: page.embed,
			});
		});
	},
});

async function createPage(p, page, totalPages) {
	const uid = await p.global.getUid(p.msg.author.id);
	const inventory = await p.mongo.collection('user_backgrounds');
	const backgrounds = await p.mongo.collection('backgrounds');
	const profiles = await p.mongo.collection('user_profile');
	const ownership = await inventory
		.find({ uid })
		.sort({ bid: 1 })
		.skip(Math.max(0, page - 1))
		.limit(1)
		.next();
	const background = ownership ? await backgrounds.findOne({ bid: ownership.bid }) : null;
	const profile = await profiles.findOne({ uid }, { projection: { bid: 1 } });

	let embed = {
		author: {
			name: p.getName() + "'s wallpapers",
			icon_url: p.msg.author.avatarURL,
		},
		color: p.config.embed_color,
		footer: {
			text: 'Page ' + page + '/' + totalPages,
		},
	};

	if (background) {
		embed.description = '`' + (offsetID + background.bid) + '` **' + background.bname + '**';
		embed.image = {
			url: `${process.env.GEN_HOST}/background/${background.bid}.png`,
		};
		if (profile?.bid === background.bid) embed.description += '   *Currently Equipped*';
		embed.bid = background.bid;
	} else {
		embed.description = "You don't have any wallpapers! :c Purchase one in `owo shop`!";
		delete embed.footer;
	}

	return { embed };
}

async function getTotalPages(p) {
	const uid = await p.global.getUid(p.msg.author.id);
	const inventory = await p.mongo.collection('user_backgrounds');
	return inventory.countDocuments({ uid });
}
