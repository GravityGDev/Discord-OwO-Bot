/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');

const essence = '<a:essence:451638978299428875>';

module.exports = new CommandInterface({
	alias: ['sacrifice', 'essence', 'butcher', 'sac', 'sc'],

	args: '{animal|rank} {count}',

	desc: 'Sacrifice an animal to turn them into animal essence! Animal essence is used to upgrade your huntbot!\nSacrificing animals will not prevent you from using them in battle!',

	example: [
		'owo sacrifice dog',
		'owo sacrifice rare',
		'owo sacrifice bug 100',
		'owo sacrifice all',
	],

	related: ['owo autohunt', 'owo upgrade'],

	permissions: ['sendMessages'],

	group: ['animals'],

	cooldown: 1000,
	half: 120,
	six: 500,
	bot: true,

	execute: async function (p) {
		const global = p.global;
		const args = p.args;
		let name;
		let count = 1;
		let ranks;

		if (args.length == 0) {
			p.errorMsg(', Please specify what rank/animal to sacrifice!', 3000);
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
					p.errorMsg(', Invalid arguments!', 3000);
					return;
				}
				if (!(tempRank.rank in ranks)) ranks[tempRank.rank] = tempRank;
			}
		}

		if (name) name = name.toLowerCase();
		let animal;
		let rank;
		if (ranks) {
			await sacrificeRanks.bind(p)(Object.values(ranks));
		} else if ((animal = global.validAnimal(name))) {
			if (args.length < 3) await sacrificeAnimal(p, animal, count);
			else {
				p.errorMsg(
					', The correct syntax for sacrificing ranks is `owo sacrifice {animal} {count}`!',
					3000
				);
			}
		} else if ((rank = global.validRank(name))) {
			if (args.length != 1) {
				p.errorMsg(', The correct syntax for sacrificing ranks is `owo sacrifice {rank}`!', 3000);
			} else await sacrificeRanks.bind(p)([rank]);
		} else {
			p.errorMsg(', I could not find that animal or rank!', 3000);
		}
	},
});

async function sacrificeAnimal(p, animal, requestedCount) {
	if (requestedCount != 'all' && requestedCount <= 0) {
		p.send('**🚫 |** You need to sacrifice more than 1 silly~', 3000);
		return;
	}

	const id = String(p.msg.author.id);
	const animals = await p.mongo.collection('animal');
	const huntbots = await p.mongo.collection('autohunt');
	const session = await p.mongo.startSession();
	let sacrificed = 0;

	try {
		await session.withTransaction(async () => {
			sacrificed = 0;
			const row = await animals.findOne({ id, name: animal.value }, { session });
			const owned = Number(row?.count || 0);
			const count = requestedCount === 'all' ? owned : requestedCount;
			if (!row || !count || owned < count) return;

			const changed = await animals.updateOne(
				{ _id: row._id, count: { $gte: count } },
				{ $inc: { count: -count, saccount: count } },
				{ session }
			);
			if (!changed.modifiedCount) return;

			const gain = count * animal.essence;
			await huntbots.updateOne(
				{ id },
				{
					$inc: { essence: gain, total: gain },
					$setOnInsert: {
						id,
						efficiency: 0,
						duration: 0,
						cost: 0,
						gain: 0,
						exp: 0,
						radar: 0,
					},
				},
				{ upsert: true, session }
			);
			sacrificed = count;
		});
	} catch (err) {
		console.error(err);
		p.errorMsg(', failed to sacrifice animal.', 3000);
		return;
	} finally {
		await session.endSession();
	}

	if (!sacrificed) {
		p.send(
			requestedCount === 'all'
				? `**🚫 | ${p.getName()}**, You don't have enough animals! >:c`
				: `**🚫 | ${p.getName()}**, You can't sacrifice more than you have silly! >:c`,
			3000
		);
		return;
	}

	const gain = sacrificed * animal.essence;
	p.send(
		`**🔪 | ${p.getName()}** sacrificed **${p.global.unicodeAnimal(animal.value)}x${sacrificed}** for **${essence} ${p.global.toFancyNum(
			gain
		)}**`
	);
	p.logger.incr('essence', gain, { type: 'sacrifice' }, p.msg);
}

async function sacrificeRanks(ranks) {
	const rankMap = new Map(ranks.map((rank) => [rank.rank, rank]));
	const id = String(this.msg.author.id);
	const animals = await this.mongo.collection('animal');
	const huntbots = await this.mongo.collection('autohunt');
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

			const combined = {};
			for (const row of selected) {
				const info = this.global.validAnimal(row.name);
				const rank = rankMap.get(info.rank);
				const count = Number(row.count || 0);
				const gain = count * rank.essence;
				total += gain;
				combined[info.rank] = (combined[info.rank] || 0) + count;
				const changed = await animals.updateOne(
					{ _id: row._id, count: row.count },
					{ $set: { count: 0 }, $inc: { saccount: count } },
					{ session }
				);
				if (!changed.modifiedCount) throw new Error('Animal inventory changed during sacrifice');
			}
			if (!total) return;

			await huntbots.updateOne(
				{ id },
				{
					$inc: { essence: total, total },
					$setOnInsert: {
						id,
						efficiency: 0,
						duration: 0,
						cost: 0,
						gain: 0,
						exp: 0,
						radar: 0,
					},
				},
				{ upsert: true, session }
			);

			for (const rankName in combined) {
				const rank = rankMap.get(rankName);
				sold += `${rank.emoji}x${combined[rankName]} `;
			}
		});
	} catch (err) {
		console.error(err);
		this.errorMsg(', failed to sacrifice rank.', 3000);
		return;
	} finally {
		await session.endSession();
	}

	if (!total) {
		this.errorMsg(", You don't have enough animals! >:c", 3000);
		return;
	}

	this.send(
		`**🔪 | ${this.getName()}** sacrificed **${sold.trim()}** for a total of **${
			this.config.emoji.essence
		} ${this.global.toFancyNum(total)}**`
	);
	this.logger.incr('essence', total, { type: 'sell' }, this.msg);
}
