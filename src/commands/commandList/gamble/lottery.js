/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');
const mongoNumeric = require('../../../utils/mongoNumeric.js');

const maxBet = 250000;

module.exports = new CommandInterface({
	alias: ['lottery', 'bet', 'lotto'],

	args: '{amount}',

	desc: 'Bet your money in the lottery! The more money you bet, the higher the chance to win!\nThe lottery ends at 12am PST everyday!',

	example: ['owo lottery 1000'],

	related: ['owo money'],

	permissions: ['sendMessages', 'embedLinks'],

	group: ['gambling'],

	cooldown: 5000,
	half: 80,
	six: 500,

	execute: async function (p) {
		if (p.args.length > 0) await bet(p.msg, p.args, p.global, p);
		else await display(p.msg, p);
	},
});

async function getLotteryTotals(collection) {
	const result = await collection
		.aggregate([
			{ $match: { valid: 1 } },
			{ $group: { _id: null, sum: { $sum: '$amount' }, count: { $sum: 1 } } },
		])
		.toArray();
	return {
		sum: Number(result[0]?.sum || 0),
		count: Number(result[0]?.count || 0),
	};
}

async function bet(msg, args, global, p) {
	let amount = 0;
	let all = false;
	if (args.length == 1 && global.isInt(args[0])) amount = parseInt(args[0]);
	else if (args.length == 1 && args[0] == 'all') all = true;
	else {
		p.errorMsg(', wrong arguments! >:c', 3000);
		return;
	}

	if (amount == 0 && !all) {
		p.errorMsg(', You bet... nothing?', 3000);
		return;
	} else if (amount < 0 && !all) {
		p.errorMsg(', Do you understand how lotteries work...?', 3000);
		return;
	}

	const userId = String(msg.author.id);
	const balances = await p.mongo.collection('cowoncy');
	const lottery = await p.mongo.collection('lottery');
	const balance = await balances.findOne({ id: userId }, { projection: { money: 1 } });
	const money = mongoNumeric.toBigInt(balance?.money || 0);
	if (money <= 0n) {
		p.errorMsg(", You don't have enough cowoncy!", 3000);
		return;
	}
	if (all) amount = Number(money > BigInt(maxBet) ? BigInt(maxBet) : money);

	const session = await p.mongo.startSession();
	let prevBet = 0;
	try {
		session.startTransaction();
		const current = await lottery.findOne({ id: userId }, { session, projection: { amount: 1, valid: 1 } });
		if (current?.valid === 1) prevBet = Number(current.amount || 0);

		if (prevBet >= maxBet) {
			await session.abortTransaction();
			p.errorMsg(', You can only bet up to ' + p.global.toFancyNum(maxBet) + ' cowoncy!', 3000);
			return;
		}
		if (amount > maxBet - prevBet) amount = maxBet - prevBet;
		if (amount <= 0) {
			await session.abortTransaction();
			p.errorMsg(', You bet... nothing?', 3000);
			return;
		}

		const debit = await mongoNumeric.subtractIfEnough(
			balances,
			{ id: userId },
			'money',
			amount,
			{ session }
		);
		if (!debit.modifiedCount) {
			await session.abortTransaction();
			p.errorMsg(", You don't have enough cowoncy!", 3000);
			return;
		}

		await lottery.updateOne(
			{ id: userId },
			{
				$inc: { amount },
				$set: { channel: String(msg.channel.id), valid: 1 },
				$setOnInsert: { id: userId },
			},
			{ upsert: true, session }
		);
		await session.commitTransaction();
	} catch (err) {
		if (session.inTransaction()) await session.abortTransaction();
		console.error(err);
		p.errorMsg(', I failed to submit that lottery bet. Please try again.', 3000);
		return;
	} finally {
		await session.endSession();
	}

	p.logger.decr('cowoncy', -1 * amount, { type: 'lottery' }, p.msg);

	const { sum } = await getLotteryTotals(lottery);
	const totalBet = prevBet + amount;
	let chance = sum ? (totalBet / sum) * 100 : 100;
	if (chance >= 0.01) chance = Math.trunc(chance * 100) / 100;

	let embed = {
		description: 'Lottery ends once a day! The maximum lottery submission is 250k cowoncy!',
		color: p.config.embed_color,
		timestamp: new Date(),
		footer: {
			icon_url:
				'https://cdn.discordapp.com/app-icons/408785106942164992/00d934dce5e41c9e956aca2fd3461212.png',
			text: '*Percentage and jackpot may change over time',
		},
		author: {
			name: p.getName() + "'s Lottery Submission",
		},
		fields: [
			{
				name: 'You added',
				value: '```fix\n' + p.global.toFancyNum(amount) + ' Cowoncy```',
				inline: true,
			},
			{
				name: 'Your Total Submission',
				value: '```fix\n' + p.global.toFancyNum(totalBet) + ' Cowoncy```',
				inline: true,
			},
			{
				name: 'Winning Chance',
				value: '```fix\n' + chance + '%```',
				inline: true,
			},
			{
				name: 'Current Jackpot',
				value: '```fix\n' + p.global.toFancyNum(sum + 500) + ' Cowoncy```',
				inline: true,
			},
			{
				name: 'Ends in',
				value: '```fix\n' + getTimeLeft() + '```',
				inline: true,
			},
		],
	};
	p.send({ embed });
}

async function display(msg, p) {
	const lottery = await p.mongo.collection('lottery');
	const [{ sum, count }, userBet] = await Promise.all([
		getLotteryTotals(lottery),
		lottery.findOne({ id: String(msg.author.id), valid: 1 }, { projection: { amount: 1 } }),
	]);

	const totalBet = Number(userBet?.amount || 0);
	let chance = 0;
	if (totalBet) {
		chance = sum ? (totalBet / sum) * 100 : 100;
		if (chance >= 0.01) chance = Math.trunc(chance * 100) / 100;
	}

	let embed = {
		description: 'Lottery ends every day at 12AM PST! Good Luck!!',
		color: 4886754,
		timestamp: new Date(),
		footer: {
			icon_url:
				'https://cdn.discordapp.com/app-icons/408785106942164992/00d934dce5e41c9e956aca2fd3461212.png',
			text: '*Percentage and jackpot may change over time',
		},
		author: {
			name: p.getName() + "'s Lottery Status",
		},
		fields: [
			{
				name: 'Your Total Submission',
				value: '```fix\n' + p.global.toFancyNum(totalBet) + ' Cowoncy```',
				inline: true,
			},
			{
				name: 'Winning Chance',
				value: '```fix\n' + chance + '%```',
				inline: true,
			},
			{
				name: 'Number of Risk Takers',
				value: '```fix\n' + p.global.toFancyNum(count) + ' users```',
				inline: true,
			},
			{
				name: 'Current Jackpot',
				value: '```fix\n' + p.global.toFancyNum(sum + 500) + ' Cowoncy```',
				inline: true,
			},
			{
				name: 'Ends in',
				value: '```fix\n' + getTimeLeft() + '```',
				inline: true,
			},
		],
	};
	p.send({ embed });
}

function getTimeLeft() {
	var now = new Date();
	var mill = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 24, 0, 0, 0) - now;
	if (mill < 0) {
		mill += 86400000;
	}
	mill = Math.trunc(mill / 1000);
	var sec = mill % 60;
	mill = Math.trunc(mill / 60);
	var min = mill % 60;
	mill = Math.trunc(mill / 60);
	var hour = mill % 60;
	return hour + 'h ' + min + 'm ' + sec + 's';
}
