/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');
const mongoNumeric = require('../../../utils/mongoNumeric.js');
const weaponUtil = require('../battle/util/weaponUtil.js');
const ringUtil = require('../social/util/ringUtil.js');

module.exports = new CommandInterface({
	alias: ['sell'],

	args: '{animal|rank|weaponID|ringID} {count}',

	desc: 'Sell animals from your zoo! Selling animals will NOT affect your zoo score!\nYou can also sell weapons by their unique weaponID!\nSelling animals will not prevent you from using them in battle!',

	example: [
		'owo sell dog',
		'owo sell cat 1',
		'owo sell ladybug all',
		'owo sell uncommon',
		'owo sell all',
		'owo sell rareweapons',
	],

	related: ['owo hunt'],

	permissions: ['sendMessages'],

	group: ['animals'],

	cooldown: 1000,
	half: 150,
	six: 500,
	bot: true,

	execute: async function (p) {
		const global = p.global;
		const args = p.args;
		let name;
		let count = 1;
		let ranks;

		if (args.length == 0) {
			p.send('**🚫 | ' + p.getName() + '**, Please specify what rank/animal to sell!', 3000);
			return;
		} else if (args.length == 2 && (global.isInt(args[0]) || args[0].toLowerCase() == 'all')) {
			count = args[0].toLowerCase() == 'all' ? 'all' : parseInt(args[0]);
			name = args[1];
		} else if (args.length == 2 && (global.isInt(args[1]) || args[1].toLowerCase() == 'all')) {
			count = args[1].toLowerCase() == 'all' ? 'all' : parseInt(args[1]);
			name = args[0];
		} else if (args.length == 1) {
			if (args[0].toLowerCase() == 'all') ranks = global.getAllRanks();
			else name = args[0];
		} else {
			ranks = {};
			for (const arg of args) {
				const tempRank = global.validRank(arg.toLowerCase());
				if (!tempRank) {
					p.send('**🚫 | ' + p.getName() + '**, Invalid arguments!', 3000);
					return;
				}
				if (!(tempRank.rank in ranks)) ranks[tempRank.rank] = tempRank;
			}
		}

		if (name) name = name.toLowerCase();
		let animal;
		let rank;
		if (ranks) {
			await sellRanks.bind(p)(Object.values(ranks));
		} else if ((animal = global.validAnimal(name))) {
			if (args.length < 3) await sellAnimal(p, animal, count);
			else {
				p.send(
					`**🚫 | ${p.getName()}**, The correct syntax for selling ranks is \`owo sell {animal} {count}\`!`,
					3000
				);
			}
		} else if ((rank = global.validRank(name))) {
			if (args.length != 1) {
				p.send(
					`**🚫 | ${p.getName()}**, The correct syntax for selling ranks is \`owo sell {rank}\`!`,
					3000
				);
			} else await sellRanks.bind(p)([rank]);
		} else if (args.length == 1) {
			if (global.isInt(name) && parseInt(name) > 0 && parseInt(name) <= ringUtil.getMaxID()) {
				await ringUtil.sell(p, parseInt(args[0]));
			} else {
				await weaponUtil.sell(p, args[0]);
			}
		} else {
			p.send('**🚫 |** I could not find that animal or rank!', 3000);
		}
	},
});

async function sellAnimal(p, animal, requestedCount) {
	if (requestedCount != 'all' && requestedCount <= 0) {
		p.send('**🚫 |** You need to sell more than 1 silly~', 3000);
		return;
	}

	const animals = await p.mongo.collection('animal');
	const cowoncy = await p.mongo.collection('cowoncy');
	const id = String(p.msg.author.id);
	const session = await p.mongo.startSession();
	let soldCount = 0;

	try {
		await session.withTransaction(async () => {
			soldCount = 0;
			const row = await animals.findOne({ id, name: animal.value }, { session });
			const owned = Number(row?.count || 0);
			const count = requestedCount === 'all' ? owned : requestedCount;
			if (!row || !count || owned < count) return;

			const changed = await animals.updateOne(
				{ _id: row._id, count: { $gte: count } },
				{ $inc: { count: -count, sellcount: count } },
				{ session }
			);
			if (!changed.modifiedCount) return;

			await mongoNumeric.add(
				cowoncy,
				{ id },
				'money',
				count * animal.price,
				{ upsert: true, session },
				{ id }
			);
			soldCount = count;
		});
	} catch (err) {
		console.error(err);
		p.errorMsg(', failed to sell animal.', 3000);
		return;
	} finally {
		await session.endSession();
	}

	if (!soldCount) {
		p.send(
			requestedCount === 'all'
				? `**🚫 | ${p.getName()}**, You don't have enough animals! >:c`
				: `**🚫 | ${p.getName()}**, You can't sell more than you have silly! >:c`,
			3000
		);
		return;
	}

	const total = soldCount * animal.price;
	p.send(
		`**🔪 | ${p.getName()}** sold **${p.global.unicodeAnimal(animal.value)}x${soldCount}** for a total of **<:cowoncy:416043450337853441> ${p.global.toFancyNum(
			total
		)}**`
	);
	p.logger.incr('cowoncy', total, { type: 'sell' }, p.msg);
}

async function sellRanks(ranks) {
	const rankMap = new Map(ranks.map((rank) => [rank.rank, rank]));
	const id = String(this.msg.author.id);
	const animals = await this.mongo.collection('animal');
	const cowoncy = await this.mongo.collection('cowoncy');
	const session = await this.mongo.startSession();
	let total = 0;
	let sold = '';

	try {
		await session.withTransaction(async () => {
			total = 0;
			sold = '';
			const rows = await animals.find({ id, count: { $gt: 0 } }, { session }).toArray();
			const selected = rows.filter((row) => {
				const info = this.global.validAnimal(row.name);
				return info && rankMap.has(info.rank);
			});
			if (!selected.length) return;

			for (const row of selected) {
				const info = this.global.validAnimal(row.name);
				const rank = rankMap.get(info.rank);
				const count = Number(row.count || 0);
				total += count * rank.price;
				await animals.updateOne(
					{ _id: row._id, count: row.count },
					{ $set: { count: 0 }, $inc: { sellcount: count } },
					{ session }
				);
			}

			if (!total) return;
			await mongoNumeric.add(
				cowoncy,
				{ id },
				'money',
				total,
				{ upsert: true, session },
				{ id }
			);

			const combined = {};
			for (const row of selected) {
				const info = this.global.validAnimal(row.name);
				combined[info.rank] = (combined[info.rank] || 0) + Number(row.count || 0);
			}
			for (const rankName in combined) {
				const rank = rankMap.get(rankName);
				sold += `${rank.emoji}x${combined[rankName]} `;
			}
		});
	} catch (err) {
		console.error(err);
		this.errorMsg(', failed to sell rank.', 3000);
		return;
	} finally {
		await session.endSession();
	}

	if (!total) {
		this.errorMsg(", You don't have enough animals! >:c", 3000);
		return;
	}

	this.send(
		`**🔪 | ${this.getName()}** sold **${sold.trim()}** for a total of **<:cowoncy:416043450337853441> ${this.global.toFancyNum(
			total
		)}**`
	);
	this.logger.incr('cowoncy', total, { type: 'sell' }, this.msg);
}
