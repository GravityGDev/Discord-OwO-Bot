/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');

const alterMarry = require('../patreon/alterMarry.js');
const rings = require('../../../data/rings.json');
const dateOptions = {
	weekday: 'short',
	year: 'numeric',
	month: 'short',
	day: 'numeric',
};
const quotes = [
	'How cute!',
	'You look wonderful together!',
	'You guys are adorable!',
	'The perfect pair!',
	'Too cute~!!!',
	'Now kiss!',
];
const quotes2 = [
	'（´・｀ ）♡',
	'(๑°꒵°๑)･*♡',
	'♡´･ᴗ･`♡',
	'(*´c_,｀*)',
	'(●´Д`●)',
	'(つω`●）',
	'(◕ᴗ◕✿)',
	'(●⌒ｖ⌒●)',
	'(´ ꒳ ` ✿)',
	'OwO',
	'<3',
	';3',
	'c;',
];
const yes = '✅';
const no = '❎';

module.exports = new CommandInterface({
	alias: ['propose', 'marry', 'marriage', 'wife', 'husband'],

	args: '{ringID} {@user1}',

	desc: 'Use a ring to marry another user for extra daily rewards! You can reuse the command to upgrade a ring. All rings are the same, there are no extra benefits for a better ring.',

	example: ['owo marry 2 @Scuttler#0001'],

	related: ['owo daily', 'owo shop'],

	permissions: ['sendMessages', 'embedLinks', 'addReactions'],

	group: ['social'],

	cooldown: 30000,

	execute: async function (p) {
		if (p.args.length <= 1) {
			display(p);
			return;
		}

		let id;
		let ringId;
		if (p.global.isUser(p.args[0]) && p.global.isInt(p.args[1])) {
			id = p.args[0].match(/[0-9]+/)[0];
			ringId = parseInt(p.args[1]);
		} else if (p.global.isUser(p.args[1]) && p.global.isInt(p.args[0])) {
			id = p.args[1].match(/[0-9]+/)[0];
			ringId = parseInt(p.args[0]);
		} else {
			p.errorMsg(
				", invalid arguments! Please include the person you're marrying and the ring id.",
				3000
			);
			return;
		}

		if (ringId < 1 || ringId > 7) {
			p.errorMsg(", that's not a valid ring id!", 3000);
			return;
		} else if (id == p.msg.author.id) {
			p.errorMsg(", silly. You can't marry yourself!", 3000);
			return;
		} else if (id == p.client.user.id) {
			p.errorMsg(", sorry love! I'm already taken c;", 3000);
			return;
		}

		let user = await p.getMention(id);
		if (!user) {
			p.errorMsg(', please tag a user to marry them!', 3000);
			return;
		} else if (user.bot) {
			p.errorMsg(", you silly hooman! You can't marry a bot!", 3000);
			return;
		}

		await propose(p, user, ringId);
	},
});

async function propose(p, user, ringId) {
	const senderId = String(p.msg.author.id);
	const receiverId = String(user.id);
	const senderUid = await p.global.getUid(senderId);
	const receiverUid = await p.global.getUid(receiverId);
	const marriages = await p.mongo.collection('marriage');
	const proposals = await p.mongo.collection('propose');
	const userRings = await p.mongo.collection('user_ring');

	const marriage = await marriages.findOne({
		$or: [
			{ uid1: { $in: [senderUid, receiverUid] } },
			{ uid2: { $in: [senderUid, receiverUid] } },
		],
	});
	const ringInventory = await userRings.findOne({ uid: senderUid, rid: ringId, rcount: { $gt: 0 } });

	if (marriage) {
		const users = await p.mongo.collection('user');
		const marriageUsers = await users
			.find({ uid: { $in: [marriage.uid1, marriage.uid2] } }, { projection: { uid: 1, id: 1 } })
			.toArray();
		const ids = new Map(marriageUsers.map((row) => [row.uid, String(row.id)]));
		await upgradeRing(
			p,
			user,
			ringId,
			{ ...marriage, id1: ids.get(marriage.uid1), id2: ids.get(marriage.uid2) },
			!!ringInventory
		);
		return;
	}

	const pending = await proposals.findOne({
		$or: [
			{ sender: { $in: [senderId, receiverId] } },
			{ receiver: { $in: [senderId, receiverId] } },
		],
	});
	if (pending) {
		p.errorMsg(', you or your friend already has a marriage pending!');
		return;
	}
	if (!ringInventory) {
		p.errorMsg(", You don't have this ring! Please buy one at `owo shop`!");
		return;
	}

	const session = await p.mongo.startSession();
	try {
		session.startTransaction();
		const stillPending = await proposals.findOne(
			{
				$or: [
					{ sender: { $in: [senderId, receiverId] } },
					{ receiver: { $in: [senderId, receiverId] } },
				],
			},
			{ session }
		);
		if (stillPending) {
			await session.abortTransaction();
			p.errorMsg(', you or your friend already has a marriage pending!');
			return;
		}

		const decrement = await userRings.updateOne(
			{ uid: senderUid, rid: ringId, rcount: { $gt: 0 } },
			{ $inc: { rcount: -1 } },
			{ session }
		);
		if (!decrement.modifiedCount) {
			await session.abortTransaction();
			p.errorMsg(", You don't have this ring! Please buy one at `owo shop`!");
			return;
		}

		await proposals.insertOne(
			{ sender: senderId, receiver: receiverId, rid: ringId, time: new Date() },
			{ session }
		);
		await session.commitTransaction();
	} catch (err) {
		if (session.inTransaction()) await session.abortTransaction();
		console.error(err);
		p.errorMsg(', failed to create that marriage proposal. Please try again later.', 3000);
		return;
	} finally {
		await session.endSession();
	}

	let ring = rings[ringId];
	let embed = {
		fields: [
			{
				name: 'Once you have accepted, you will receive an extra lootbox or weapon crate when you both complete your daily!',
				value:
					'`owo am` to accept  |  `owo dm` to decline\nYou can divorce anytime with `owo divorce` or upgrade your marriage ring with `owo marry @' +
					p.getUniqueName(user) +
					' {ringID}`',
			},
		],
		color: p.config.embed_color,
		author: {
			name: p.getName() + ' has proposed to ' + p.getName(user) + ' with a ' + ring.name + '!',
			icon_url: p.msg.author.avatarURL,
		},
		timestamp: new Date(),
		thumbnail: {
			url:
				'https://cdn.discordapp.com/emojis/' +
				ring.emoji.match(/[0-9]+/)[0] +
				'.' +
				(ringId > 5 ? 'gif' : 'png'),
		},
	};
	p.send({ embed });
}

async function upgradeRing(p, user, ringId, result, hasRing) {
	if (
		!(
			(String(p.msg.author.id) == result.id1 && String(user.id) == result.id2) ||
			(String(p.msg.author.id) == result.id2 && String(user.id) == result.id1)
		)
	) {
		p.errorMsg(', you or your friend is already married!');
		return;
	} else if (!hasRing) {
		p.errorMsg(", you cannot upgrade your ring if you don't have it silly!", 3000);
		return;
	} else if (ringId == result.rid) {
		p.errorMsg(', you silly. You are already using a ring with the same rarity!');
		return;
	}

	let currentRing = rings[result.rid];
	let newRing = rings[ringId];
	let embed = {
		description:
			'**' +
			p.getName() +
			'**, are you sure you want to change your **' +
			currentRing.name +
			'** to a' +
			(p.global.isVowel(newRing.name) ? 'n' : '') +
			' **' +
			newRing.name +
			'**?\n*You will not get your ring back!*',
		thumbnail: {
			url:
				'https://cdn.discordapp.com/emojis/' +
				currentRing.emoji.match(/[0-9]+/)[0] +
				'.' +
				(currentRing.id > 5 ? 'gif' : 'png'),
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
	collector.on('collect', async function (emoji) {
		if (reacted) return;
		reacted = true;
		collector.stop('done');
		if (emoji.name == yes) {
			embed.color = 6381923;
			const uid = await p.global.getUid(p.msg.author.id);
			const session = await p.mongo.startSession();
			try {
				session.startTransaction();
				const userRings = await p.mongo.collection('user_ring');
				const decrement = await userRings.updateOne(
					{ uid, rid: ringId, rcount: { $gt: 0 } },
					{ $inc: { rcount: -1 } },
					{ session }
				);
				if (!decrement.modifiedCount) {
					await session.abortTransaction();
					embed.description += "\n\n🚫 I don't see the ring in your inventory... 😏";
					await msg.edit({ embed });
					return;
				}

				const marriages = await p.mongo.collection('marriage');
				const changed = await marriages.updateOne(
					{ uid1: result.uid1, uid2: result.uid2 },
					{ $set: { rid: ringId } },
					{ session }
				);
				if (!changed.matchedCount) {
					await session.abortTransaction();
					embed.description += '\n\n🚫 You are currently not married...';
					await msg.edit({ embed });
					return;
				}
				await session.commitTransaction();
			} catch (err) {
				if (session.inTransaction()) await session.abortTransaction();
				console.error(err);
				embed.description += '\n\n🚫 Failed to change the ring. Please try again later.';
				await msg.edit({ embed });
				return;
			} finally {
				await session.endSession();
			}

			embed.description += '\n\n' + newRing.emoji + ' You decided to change the ring!';
			embed.thumbnail.url =
				'https://cdn.discordapp.com/emojis/' +
				newRing.emoji.match(/[0-9]+/)[0] +
				'.' +
				(newRing.id > 5 ? 'gif' : 'png');
			await msg.edit({ embed });
		} else {
			embed.color = 6381923;
			embed.description += '\n\n' + currentRing.emoji + ' You decided not to upgrade';
			await msg.edit({ embed });
		}
	});

	collector.on('end', async function (_collected, reason) {
		if (reason == 'done') return;
		embed.color = 6381923;
		await msg.edit({ embed });
	});
}

async function display(p) {
	const uid = await p.global.getUid(p.msg.author.id);
	const marriages = await p.mongo.collection('marriage');
	const result = await marriages.findOne({ $or: [{ uid1: uid }, { uid2: uid }] });

	if (!result) {
		p.errorMsg(
			', you are not married! Please purchase and include the ring id in the command! ex. `owo marry @user {ringID}`',
			3000
		);
		return;
	}

	let ring = rings[result.rid];
	let soUid = uid == result.uid1 ? result.uid2 : result.uid1;
	const users = await p.mongo.collection('user');
	const storedPartner = await users.findOne({ uid: soUid }, { projection: { id: 1 } });
	const so = storedPartner?.id ? await p.fetch.getUser(String(storedPartner.id)) : null;
	const marriedDate = new Date(result.marriedDate);
	const days = Math.max(0, Math.floor((Date.now() - marriedDate.getTime()) / 86400000));

	let embed = {
		author: {
			name: p.getName() + ', you are happily married to ' + (so ? so.username : 'someone') + '!',
			icon_url: p.msg.author.avatarURL,
		},
		description:
			'Married since **' +
			marriedDate.toLocaleDateString('default', dateOptions) +
			'** (**' +
			days +
			' days**)\nYou have claimed **' +
			(result.dailies || 0) +
			' dailies** together!\n' +
			quotes[Math.floor(Math.random() * quotes.length)] +
			' ' +
			quotes2[Math.floor(Math.random() * quotes2.length)],
		thumbnail: {
			url:
				'https://cdn.discordapp.com/emojis/' +
				ring.emoji.match(/[0-9]+/)[0] +
				'.' +
				(ring.id > 5 ? 'gif' : 'png'),
		},
		color: p.config.embed_color,
	};

	embed = alterMarry.alter(p, embed, {
		user: p.msg.author,
		so,
		marriedSince: marriedDate.toLocaleDateString('default', dateOptions),
		marriedDays: days,
		marriedClaims: result.dailies || 0,
	});
	p.send({ embed });
}
