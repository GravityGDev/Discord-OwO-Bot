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
const equipEmoji = '🖼️';

module.exports = new CommandInterface({
	alias: ['wallpaper', 'wp', 'wallpapers', 'background', 'backgrounds'],

	args: '{id}',

	desc: 'View your current wallpapers! Equip them by clicking the wallpaper emoji.\nYou can buy more wallpapers from the shop.',

	example: ['owo wallpaper', 'owo wallpaper 201'],

	related: ['owo shop', 'owo profile'],

	permissions: ['sendMessages', 'embedLinks', 'attachFiles', 'addReactions'],

	group: ['social'],

	cooldown: 15000,

	execute: async function (p) {
		try {
			const totalPages = await getTotalPages(p);
			let currentPage = await getStartPage(p, totalPages);
			if (currentPage === null) return;

			let page = await createPage(p, currentPage, totalPages);
			const msg = await p.send({ embed: page.embed });

			if (totalPages <= 0) return;

			const filter = (emoji, userID) =>
				(emoji.name === equipEmoji ||
					emoji.name === nextPageEmoji ||
					emoji.name === prevPageEmoji) &&
				userID == p.msg.author.id;
			const collector = p.reactionCollector.create(msg, filter, {
				time: 900000,
				idle: 120000,
			});

			await msg.addReaction(prevPageEmoji);
			await msg.addReaction(nextPageEmoji);
			await msg.addReaction(equipEmoji);

			collector.on('collect', async function (emoji) {
				try {
					if (emoji.name === nextPageEmoji) {
						if (currentPage < totalPages) currentPage++;
						else currentPage = 1;
						page = await createPage(p, currentPage, totalPages);
						await msg.edit({ embed: page.embed });
					} else if (emoji.name === prevPageEmoji) {
						if (currentPage > 1) currentPage--;
						else currentPage = totalPages;
						page = await createPage(p, currentPage, totalPages);
						await msg.edit({ embed: page.embed });
					} else if (emoji.name === equipEmoji && page.bid !== null) {
						const uid = await p.global.getUid(p.msg.author.id);
						const profiles = await p.mongo.collection('user_profile');
						await profiles.updateOne(
							{ uid },
							{ $set: { bid: page.bid }, $setOnInsert: { uid } },
							{ upsert: true }
						);
						page = await createPage(p, currentPage, totalPages);
						await msg.edit({ embed: page.embed });
					}
				} catch (err) {
					console.error('[wallpaper] Failed to handle wallpaper reaction:', err);
				}
			});

			collector.on('end', async function (_reason) {
				try {
					page = await createPage(p, currentPage, totalPages);
					page.embed.color = 6381923;
					await msg.edit({
						content: 'This message is now inactive',
						embed: page.embed,
					});
				} catch (err) {
					console.error('[wallpaper] Failed to close wallpaper viewer:', err);
				}
			});
		} catch (err) {
			console.error('[wallpaper] Failed to display wallpapers:', err);
			p.errorMsg(', failed to load your wallpapers. Please try again later.', 3000);
		}
	},
});

async function getStartPage(p, totalPages) {
	if (totalPages <= 0 || p.args.length <= 0) return 1;

	if (!p.global.isInt(p.args[0])) {
		p.errorMsg(', please provide a valid wallpaper id, for example `owo wallpaper 202`.', 3000);
		return null;
	}

	const bid = parseInt(p.args[0], 10) - offsetID;
	const uid = await p.global.getUid(p.msg.author.id);
	const inventory = await p.mongo.collection('user_backgrounds');
	const ownership = await inventory.findOne({ uid, bid }, { projection: { bid: 1 } });

	if (!ownership) {
		p.errorMsg(", you don't own a wallpaper with that id!", 3000);
		return null;
	}

	const previous = await inventory.countDocuments({ uid, bid: { $lt: bid } });
	return previous + 1;
}

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

	const embed = {
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
	} else {
		embed.description = "You don't have any wallpapers! :c Purchase one in `owo shop`!";
		delete embed.footer;
	}

	return {
		embed,
		bid: background?.bid ?? null,
	};
}

async function getTotalPages(p) {
	const uid = await p.global.getUid(p.msg.author.id);
	const inventory = await p.mongo.collection('user_backgrounds');
	return inventory.countDocuments({ uid });
}
