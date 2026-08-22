/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const PageClass = require('./../PageClass.js');

const perPage = 10;
const pictureEmoji = '🖼';
const idOffset = 200;

module.exports = class WallpaperPage extends PageClass {
	constructor(p) {
		super(p);
		this.id = 2;
	}

	async totalPages() {
		const backgrounds = await this.p.mongo.collection('backgrounds');
		const count = await backgrounds.countDocuments({ active: 1 });
		return Math.ceil(count / perPage);
	}

	async getPage(page, embed) {
		embed.author.name = 'OwO Shop: Wallpapers';
		embed.description =
			'Purchase a wallpaper for your profile!\n- **`owo shop wp {page}`** to view the wallpaper as images\n- **`owo buy {id}`** to buy an item\n- **`owo wallpaper`** to view your wallpapers\n- **`owo profile set wallpaper {id}`** to use it\n' +
			'═'.repeat(this.charLen + 2) +
			'\n';

		const uid = await this.p.global.getUid(this.p.msg.author.id);
		const backgrounds = await this.p.mongo.collection('backgrounds');
		const userBackgrounds = await this.p.mongo.collection('user_backgrounds');
		const result = await backgrounds
			.find({ active: 1 })
			.skip(perPage * (page - 1))
			.limit(perPage)
			.toArray();
		const bids = result.map((wallpaper) => wallpaper.bid);
		const ownedRows = bids.length
			? await userBackgrounds
					.find({ uid, bid: { $in: bids } }, { projection: { bid: 1 } })
					.toArray()
			: [];
		const owned = new Set(ownedRows.map((row) => row.bid));

		for (let i in result) {
			const wallpaper = result[i];
			embed.description += this.toItem({
				id: idOffset + wallpaper.bid,
				emoji: pictureEmoji,
				name: wallpaper.bname,
				url: `${process.env.GEN_HOST}/background/${wallpaper.bid}.png`,
				price: this.p.global.toShortNum(wallpaper.price),
				priceEmoji: '<:cowoncy:416043450337853441>',
				lineThrough: owned.has(wallpaper.bid),
			});
		}
		return embed;
	}
};
