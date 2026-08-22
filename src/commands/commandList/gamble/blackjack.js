/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');
const mongoNumeric = require('../../../utils/mongoNumeric.js');

const maxBet = 250000;
const deck = [
	1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27,
	28, 29, 30, 31, 32, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52,
];
const bjUtil = require('./blackjackUtil.js');
const hitEmoji = '👊';
const stopEmoji = '🛑';

module.exports = new CommandInterface({
	alias: ['blackjack', 'bj', '21'],

	args: '{bet}',

	desc: 'Gamble your money away in blackjack!\nYou can hit or stand by reacting with emojis! If the command stops responding, retype the command to resume the game!',

	example: [],

	related: ['owo money'],

	permissions: ['sendMessages', 'embedLinks', 'addReactions'],

	group: ['gambling'],

	cooldown: 15000,
	half: 100,
	six: 600,
	bot: true,

	execute: async function (p) {
		let amount = 1;
		if (p.global.isInt(p.args[0])) amount = parseInt(p.args[0]);
		if (p.args[0] == 'all') amount = 'all';
		else if (amount == undefined) {
			p.send('**🚫 | ' + p.getName() + '**, Invalid arguments!', 3000);
			p.setCooldown(5);
			return;
		} else if (amount <= 0) {
			p.send('**🚫 | ' + p.getName() + "**, You can't bet that much silly!", 3000);
			p.setCooldown(5);
			return;
		}

		const userId = String(p.msg.author.id);
		const existing = await getActiveGame(p, userId);
		if (existing) {
			await blackjack(p, existing.player, existing.dealer, existing.bet, true);
			return;
		}

		const balances = await p.mongo.collection('cowoncy');
		const balance = await balances.findOne({ id: userId }, { projection: { money: 1 } });
		const money = mongoNumeric.toBigInt(balance?.money || 0);
		if (money <= 0n) {
			p.send('**🚫 | ' + p.getName() + '**, You do not have enough cowoncy!', 3000);
			return;
		}

		if (amount == 'all') amount = Number(money > BigInt(maxBet) ? BigInt(maxBet) : money);
		else if (maxBet && amount > maxBet) amount = maxBet;
		if (amount <= 0 || money < BigInt(amount)) {
			p.send('**🚫 | ' + p.getName() + '**, You do not have enough cowoncy!', 3000);
			return;
		}

		const tdeck = deck.slice(0);
		const player = [await bjUtil.randCard(tdeck, 'f'), await bjUtil.randCard(tdeck, 'f')];
		const dealer = [await bjUtil.randCard(tdeck, 'f'), await bjUtil.randCard(tdeck, 'b')];
		const games = await p.mongo.collection('blackjack');
		const session = await p.mongo.startSession();
		let raceGame;
		try {
			session.startTransaction();
			raceGame = await getActiveGame(p, userId, session);
			if (raceGame) {
				await session.abortTransaction();
			} else {
				const debit = await mongoNumeric.subtractIfEnough(
					balances,
					{ id: userId },
					'money',
					amount,
					{ session }
				);
				if (!debit.modifiedCount) {
					await session.abortTransaction();
					p.send('**🚫 | ' + p.getName() + '**, You do not have enough cowoncy!', 3000);
					return;
				}

				await games.updateOne(
					{ id: userId },
					{
						$set: {
							id: userId,
							bet: amount,
							date: new Date(),
							active: 1,
							player,
							dealer,
						},
					},
					{ upsert: true, session }
				);
				await session.commitTransaction();
			}
		} catch (err) {
			if (session.inTransaction()) await session.abortTransaction();
			console.error(err);
			p.errorMsg(', I failed to start that blackjack game. Please try again.', 3000);
			return;
		} finally {
			await session.endSession();
		}

		if (raceGame) {
			await blackjack(p, raceGame.player, raceGame.dealer, raceGame.bet, true);
			return;
		}

		await blackjack(p, player, dealer, amount);
		p.quest('gamble');
	},
});

async function getActiveGame(p, id, session) {
	const games = await p.mongo.collection('blackjack');
	const options = session ? { session } : {};
	const game = await games.findOne({ id: String(id), active: 1 }, options);
	if (!game) return null;
	if (Array.isArray(game.player) && Array.isArray(game.dealer)) return game;
	if (game.bjid === undefined || game.bjid === null) return null;

	const cards = await p.mongo.collection('blackjack_card');
	const rows = await cards
		.find({ bjid: game.bjid }, options)
		.sort({ sort: 1, dealer: -1 })
		.toArray();
	if (!rows.length) return null;

	const player = [];
	const dealer = [];
	for (const row of rows) {
		if (row.dealer == 0) player.push({ card: row.card, type: 'c' });
		else if (row.dealer == 1) dealer.push({ card: row.card, type: 'b' });
		else dealer.push({ card: row.card, type: 'c' });
	}
	if (!session) {
		await games.updateOne({ id: String(id), active: 1 }, { $set: { player, dealer } });
	}
	return { ...game, player, dealer };
}

async function blackjack(p, player, dealer, bet, resume) {
	let embed = bjUtil.generateEmbed(p.msg.author, dealer, player, bet);
	let filter = (emoji, userID) =>
		(emoji.name === hitEmoji || emoji.name === stopEmoji) && userID === p.msg.author.id;
	if (resume) embed.footer.text = '🎲 ~ resuming previous game';

	let message = await p.send({ embed });
	await message.addReaction(hitEmoji);
	await message.addReaction(stopEmoji);

	let collector = p.reactionCollector.create(message, filter, { time: 60000 });
	collector.on('collect', async function (emoji) {
		const game = await getActiveGame(p, p.msg.author.id);
		if (!game?.player || !game?.dealer) {
			collector.stop('done');
			message.edit('**🚫 |** This match is already finished');
			return;
		}
		if (emoji.name == hitEmoji) {
			await hit(p, game.player, game.dealer, message, game.bet, collector);
		} else if (emoji.name == stopEmoji) {
			collector.stop('done');
			await stop(p, game.player, game.dealer, message, game.bet);
		}
	});

	collector.on('end', (collected, reason) => {
		if (reason == 'time')
			message.edit('**⏱ |** This session has expired. Retype `owo blackjack` to resume');
	});
}

async function hit(p, player, dealer, msg, bet, collector) {
	for (let i = 0; i < player.length; i++) player[i].type = 'c';
	for (let i = 0; i < dealer.length; i++) {
		if (dealer[i].type == 'f') dealer[i].type = 'c';
	}

	let tdeck = bjUtil.initDeck(deck.slice(0), player, dealer);
	let card = await bjUtil.randCard(tdeck, 'f');
	player.push(card);
	let ppoints = bjUtil.cardValue(player).points;

	if (ppoints > 21) {
		collector.stop('done');
		await stop(p, player, dealer, msg, bet, true);
		return;
	}

	const games = await p.mongo.collection('blackjack');
	const storedPlayer = player.map((entry) => ({ card: entry.card, type: 'c' }));
	const storedDealer = dealer.map((entry) => ({
		card: entry.card,
		type: entry.type == 'b' ? 'b' : 'c',
	}));
	const result = await games.updateOne(
		{ id: String(p.msg.author.id), active: 1 },
		{ $set: { player: storedPlayer, dealer: storedDealer } }
	);
	if (!result.matchedCount) {
		collector.stop('done');
		msg.edit('**🚫 |** This match is already finished');
		return;
	}

	let embed = bjUtil.generateEmbed(p.msg.author, dealer, player, bet);
	msg.edit({ embed });
}

async function stop(p, player, dealer, msg, bet, fromHit) {
	if (!fromHit) for (let i = 0; i < player.length; i++) player[i].type = 'c';
	for (let i = 0; i < dealer.length; i++) {
		if (dealer[i].type == 'b') dealer[i].type = 'f';
		else dealer[i].type = 'c';
	}

	let ppoints = bjUtil.cardValue(player).points;
	let dpoints = bjUtil.cardValue(dealer).points;
	let tdeck = bjUtil.initDeck(deck.slice(0), player, dealer);
	while (dpoints < 17) {
		dealer.push(await bjUtil.randCard(tdeck, 'f'));
		dpoints = bjUtil.cardValue(dealer).points;
	}

	let winner;
	if (ppoints > 21 && dpoints > 21) winner = 'tb';
	else if (ppoints == dpoints) winner = 't';
	else if (ppoints > 21) winner = 'l';
	else if (dpoints > 21) winner = 'w';
	else if (ppoints > dpoints) winner = 'w';
	else winner = 'l';

	const games = await p.mongo.collection('blackjack');
	const cards = await p.mongo.collection('blackjack_card');
	const balances = await p.mongo.collection('cowoncy');
	const session = await p.mongo.startSession();
	let settled = false;
	try {
		session.startTransaction();
		const current = await games.findOne(
			{ id: String(p.msg.author.id), active: 1 },
			{ session, projection: { bjid: 1 } }
		);
		if (!current) {
			await session.abortTransaction();
			return;
		}

		const result = await games.updateOne(
			{ id: String(p.msg.author.id), active: 1 },
			{
				$set: {
					active: 0,
					player: player.map((entry) => ({ card: entry.card, type: 'c' })),
					dealer: dealer.map((entry) => ({ card: entry.card, type: 'c' })),
					winner,
					endedAt: new Date(),
				},
			},
			{ session }
		);
		if (!result.modifiedCount) {
			await session.abortTransaction();
			return;
		}

		if (winner == 'w') {
			await mongoNumeric.add(
				balances,
				{ id: String(p.msg.author.id) },
				'money',
				bet * 2,
				{ upsert: true, session }
			);
		} else if (winner == 't' || winner == 'tb') {
			await mongoNumeric.add(
				balances,
				{ id: String(p.msg.author.id) },
				'money',
				bet,
				{ upsert: true, session }
			);
		}
		if (current.bjid !== undefined && current.bjid !== null) {
			await cards.deleteMany({ bjid: current.bjid }, { session });
		}
		await session.commitTransaction();
		settled = true;
	} catch (err) {
		if (session.inTransaction()) await session.abortTransaction();
		console.error(err);
		msg.edit('Something went wrong...');
		return;
	} finally {
		await session.endSession();
	}

	if (!settled) return;
	if (winner == 'w') {
		p.logger.incr(`gamble.blackjack.${p.msg.author.id}`);
		p.logger.incr(`cowoncy.blackjack.${p.msg.author.id}`, bet);
	} else if (winner == 'l') {
		p.logger.decr(`gamble.blackjack.${p.msg.author.id}`);
		p.logger.decr(`cowoncy.blackjack.${p.msg.author.id}`, -1 * bet);
	}
	let embed = bjUtil.generateEmbed(p.msg.author, dealer, player, bet, winner, bet);
	msg.edit({ embed });
}
