/*
 * OwO Bot for Discord
 * Copyright (C) 2020 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');
const itemUtil = require('./util/itemUtil.js');
const mongoNumeric = require('../../../utils/mongoNumeric.js');

const thumbsup = '👍';
const thumbsdown = '👎';
const tada = '🎉';
const spacer = '                                                               ';

module.exports = new CommandInterface({
	alias: ['trade', 'tr', 'gift'],

	args: 'itemId @user price {count}',

	desc: 'Trade an item with a user!',

	example: ['owo trade 10 @user 10000 1'],

	related: [],

	permissions: ['sendMessages', 'embedLinks'],

	group: ['economy'],

	cooldown: 5000,

	execute: async function (p) {
		const info = await validate(p);
		if (info.error) return;
		await awaitReaction(p, info);
	},
});

async function validate(p) {
	let [itemId, user, price, count = 1] = p.args;
	if (!itemId) {
		await p.errorMsg(', please include what item you want to trade!', 3000);
		return { error: true };
	}
	if (!p.global.isInt(itemId)) {
		await p.errorMsg(', invalid item id! Item id must be a number!', 3000);
		return { error: true };
	}
	itemId = parseInt(itemId);
	const item = itemUtil.getById(itemId);
	if (!item) {
		await p.errorMsg(', an item with that id does not exist or you cannot trade that item.', 3000);
		return { error: true };
	}
	if (item.untradeable) {
		await p.errorMsg(`, ${item.emoji} **${item.name}** is not tradeable!`, 3000);
		return { error: true };
	}

	user = p.getMention(user);
	if (!user) {
		await p.errorMsg(', please tag a user you want to trade with!', 3000);
		return { error: true };
	}
	if (user.id == p.msg.author.id) {
		await p.errorMsg(', you cannot trade with yourself!', 3000);
		return { error: true };
	}

	if (!item.giveOnly && !price) {
		await p.errorMsg(', please specify what price you want to sell the item for!', 3000);
		return { error: true };
	}
	if (!item.giveOnly && !p.global.isInt(price)) {
		await p.errorMsg(', price must be a number!', 3000);
		return { error: true };
	}
	price = parseInt(price) || 0;
	if (item.giveOnly) {
		if (price > 0) {
			await p.errorMsg(', this item cannot be traded for cowoncy!', 3000);
			return { error: true };
		}
	} else if (price < 1) {
		await p.errorMsg(', the price must be greater than 0!', 3000);
		return { error: true };
	} else if (price > 2000000) {
		await p.errorMsg(', the price per ticket is too high!', 3000);
		return { error: true };
	}

	if (!p.global.isInt(count)) {
		await p.errorMsg(', the number of items is invalid!', 3000);
		return { error: true };
	}
	count = parseInt(count);
	if (count < 1) {
		await p.errorMsg(', the number of items must be greater than one!', 3000);
		return { error: true };
	}

	const sellerUid = await p.global.getUid(p.msg.author.id);
	const buyerUid = await p.global.getUid(user.id);
	const inventory = await p.mongo.collection('user_item');
	const timeouts = await p.mongo.collection('timeout');
	const row = await inventory.findOne({ uid: sellerUid, name: item.column });
	if (!row || Number(row.count || 0) < count) {
		await p.errorMsg(`, you do not have enough ${item.name}s!`, 3000);
		return { error: true };
	}
	if (await isTimedOut(timeouts, user.id)) {
		await p.errorMsg(', you cannot trade with this user!', 3000);
		return { error: true };
	}
	const limitError = checkTradeLimit(p, item, row, count);
	if (limitError) {
		await p.errorMsg(limitError, 3000);
		return { error: true };
	}

	return { item, user, price, count, sellerUid, buyerUid };
}

async function isTimedOut(timeouts, id) {
	const rows = await timeouts.find({ id: String(id) }).toArray();
	const now = Date.now();
	return rows.some((row) => {
		const time = row.time instanceof Date ? row.time.getTime() : new Date(row.time).getTime();
		return Number.isFinite(time) && now - time < Number(row.penalty || 0) * 3600000;
	});
}

function checkTradeLimit(p, item, row, count) {
	if (!item.tradeLimit) return;
	if (count > item.tradeLimit) return `, you can only trade this item ${item.tradeLimit}x per day!`;
	const afterMid = p.dateUtil.afterMidnight(row.daily_reset);
	if (afterMid.after) return;
	const current = Number(row.daily_count || 0);
	if (current >= item.tradeLimit) return `, you can only trade this item ${item.tradeLimit}x per day!`;
	if (current + count > item.tradeLimit) {
		return `, you can only trade this item ${item.tradeLimit - current} more times today!`;
	}
}

async function sendMessage(p, { item, user, price, count }) {
	const embed = {
		description: `Both users must hit the ${thumbsup} reaction to trade.\nEither user can hit the ${thumbsdown} reaction to stop the trade.`,
		color: p.config.embed_color,
		timestamp: new Date(),
		thumbnail: { url: p.global.getEmojiURL(item.emoji) },
		author: {
			name: `${p.getName()} wants to trade with ${p.getName(user)}!`,
			icon_url: p.msg.author.avatarURL,
		},
		fields: [
			{
				name: `${p.getUniqueName()} will give:`,
				value: `\`\`\`fix\n${count} ${item.name}${count > 1 ? 's' : ''}${spacer}\n\`\`\``,
				inline: true,
			},
			{
				name: `${p.getUniqueName(user)} will give:`,
				value: `\`\`\`fix\n${p.global.toFancyNum(count * price)} cowoncy${spacer}\n\`\`\``,
				inline: true,
			},
		],
	};
	if (item.tradeNote) embed.description += '\n\n' + item.tradeNote;
	if (item.tradeLimit) {
		embed.description += `\n\n📑 **You can only trade this item ${item.tradeLimit} times per day.**`;
	}
	if (item.giveOnly) {
		embed.description +=
			'\n\n⚠️ **You can not trade this item for cowoncy. Failure to follow these rules can result in a ban.**';
	}
	const msg = await p.send({ embed });
	return { msg, embed };
}

async function awaitReaction(p, info) {
	const { msg, embed } = await sendMessage(p, info);
	const user1 = p.msg.author.id;
	const user2 = info.user.id;
	let user1Reaction = false;
	let user2Reaction = false;
	const filter = (emoji, userId) =>
		(emoji.name === thumbsup || emoji.name === thumbsdown) && (userId === user2 || userId === user1);
	const collector = p.reactionCollector.create(msg, filter, { time: 300000, idle: 300000 });

	await msg.addReaction(thumbsup);
	await msg.addReaction(thumbsdown);

	collector.on('collect', async (emoji, userId) => {
		if (emoji.name === thumbsdown) {
			collector.stop('cancel');
			return;
		}
		if (userId == user1) {
			if (user1Reaction) return;
			user1Reaction = true;
		}
		if (userId == user2) {
			if (user2Reaction) return;
			user2Reaction = true;
		}
		if (user1Reaction && user2Reaction) {
			collector.stop('done');
			await executeTransaction(p, msg, embed, info);
		}
	});

	collector.on('end', async function (reason) {
		if (reason == 'cancel') {
			embed.color = 6381923;
			await msg.edit({ content: 'The trade was canceled.', embed });
		} else if (reason != 'done') {
			embed.color = 6381923;
			await msg.edit({ content: 'This message is now inactive', embed });
		}
	});
}

async function executeTransaction(p, msg, embed, info) {
	const result = await performTrade(p, info);
	if (!result.ok) {
		embed.color = p.config.fail_color;
		let content;
		if (result.reason === 'money') {
			content = `${p.config.emoji.error} **| ${p.getName(info.user)}** does not have enough money!`;
		} else if (result.reason === 'items') {
			content = `${p.config.emoji.error} **| ${p.getName()}** does not have enough ${info.item.emoji} **${
				info.item.name
			}s**!`;
		} else if (result.reason === 'limit') {
			content = `${p.config.emoji.error} **| ${p.getName()}**${result.message}`;
		} else {
			content = `${p.config.emoji.error} **|** The trade failed. Please try again later.`;
		}
		await msg.edit({ content, embed });
		return;
	}

	embed.color = p.config.success_color;
	await msg.edit({ content: `${tada} **|** Successfully traded!`, embed });
}

async function performTrade(p, { item, user, price, count, sellerUid, buyerUid }) {
	const totalPrice = count * price;
	const inventory = await p.mongo.collection('user_item');
	const cowoncy = await p.mongo.collection('cowoncy');
	const transactions = await p.mongo.collection('transaction');
	const session = await p.mongo.startSession();
	let outcome = { ok: false };

	try {
		await session.withTransaction(async () => {
			outcome = { ok: false };
			const sellerItem = await inventory.findOne({ uid: sellerUid, name: item.column }, { session });
			if (!sellerItem || Number(sellerItem.count || 0) < count) {
				outcome = { ok: false, reason: 'items' };
				return;
			}

			const limitError = checkTradeLimit(p, item, sellerItem, count);
			if (limitError) {
				outcome = { ok: false, reason: 'limit', message: limitError };
				return;
			}

			if (!item.giveOnly && totalPrice > 0) {
				const debit = await mongoNumeric.subtractIfEnough(
					cowoncy,
					{ id: String(user.id) },
					'money',
					totalPrice,
					{ session }
				);
				if (!debit.modifiedCount) {
					outcome = { ok: false, reason: 'money' };
					return;
				}
				await mongoNumeric.add(
					cowoncy,
					{ id: String(p.msg.author.id) },
					'money',
					totalPrice,
					{ upsert: true, session },
					{ id: String(p.msg.author.id) }
				);
			}

			const removed = await inventory.updateOne(
				{ uid: sellerUid, name: item.column, count: { $gte: count } },
				{ $inc: { count: -count } },
				{ session }
			);
			if (!removed.modifiedCount) {
				outcome = { ok: false, reason: 'items' };
				return;
			}

			if (item.tradeLimit) {
				const afterMid = p.dateUtil.afterMidnight(sellerItem.daily_reset);
				const dailyCount = afterMid.after ? count : Number(sellerItem.daily_count || 0) + count;
				const set = { daily_count: dailyCount };
				if (afterMid.after) set.daily_reset = afterMid.now;
				await inventory.updateOne(
					{ uid: sellerUid, name: item.column },
					{ $set: set },
					{ session }
				);
			}

			let tradeColumn = item.column;
			if (item.tradeConvert) tradeColumn = itemUtil.getById(item.tradeConvert).column;
			await inventory.updateOne(
				{ uid: buyerUid, name: tradeColumn },
				{
					$inc: { count },
					$setOnInsert: { uid: buyerUid, name: tradeColumn, daily_count: 0 },
				},
				{ upsert: true, session }
			);

			await transactions.insertOne(
				{
					sender: String(user.id),
					reciever: String(p.msg.author.id),
					amount: mongoNumeric.integerString(totalPrice),
					createdAt: new Date(),
					type: 'item_trade',
					item: tradeColumn,
					count,
				},
				{ session }
			);
			outcome = { ok: true };
		});
	} catch (err) {
		console.error(err);
		return { ok: false, reason: 'error' };
	} finally {
		await session.endSession();
	}
	return outcome;
}
