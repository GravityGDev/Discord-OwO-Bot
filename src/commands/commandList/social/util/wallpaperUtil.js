/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const mongoNumeric = require('../../../../utils/mongoNumeric.js');
const offsetID = 200;
const wallpaperEmoji = '🖼';

exports.buy = async function (p, id) {
	const bid = id - offsetID;
	const backgrounds = await p.mongo.collection('backgrounds');
	const background = await backgrounds.findOne({ bid, active: 1 });

	if (!background) {
		p.errorMsg(', That wallpaper id is not available!', 3000);
		return;
	}

	const uid = await p.global.getUid(p.msg.author.id);
	const inventory = await p.mongo.collection('user_backgrounds');
	if (await inventory.findOne({ uid, bid })) {
		p.errorMsg(', you already own that wallpaper!', 3000);
		return;
	}

	const session = await p.mongo.startSession();
	try {
		session.startTransaction();
		const existing = await inventory.findOne({ uid, bid }, { session });
		if (existing) {
			await session.abortTransaction();
			p.errorMsg(', you already own that wallpaper!', 3000);
			return;
		}

		const balances = await p.mongo.collection('cowoncy');
		const debit = await mongoNumeric.subtractIfEnough(
			balances,
			{ id: String(p.msg.author.id) },
			'money',
			background.price,
			{ session }
		);
		if (!debit.modifiedCount) {
			await session.abortTransaction();
			p.errorMsg(", you don't have enough cowoncy! :c", 3000);
			return;
		}

		await inventory.insertOne({ uid, bid }, { session });
		await session.commitTransaction();
	} catch (err) {
		if (session.inTransaction()) await session.abortTransaction();
		if (err.code === 11000) p.errorMsg(', you already own that wallpaper!', 3000);
		else {
			console.error(err);
			p.errorMsg(', failed to purchase that wallpaper. Please try again later.', 3000);
		}
		return;
	} finally {
		await session.endSession();
	}

	const embed = {
		author: {
			name: p.getName() + ', you have successfully purchased "' + background.bname + '"!',
			icon_url: p.msg.author.avatarURL,
		},
		color: p.config.embed_color,
		image: {
			url: `${process.env.GEN_HOST}/background/${bid}.png`,
		},
	};
	await p.send({ embed });
};

exports.getItems = async function (p) {
	const uid = await p.global.getUid(p.msg.author.id);
	const inventory = await p.mongo.collection('user_backgrounds');
	const count = await inventory.countDocuments({ uid });
	if (count <= 0) return {};

	return {
		'2--': {
			emoji: wallpaperEmoji,
			id: 200,
			count,
		},
	};
};
