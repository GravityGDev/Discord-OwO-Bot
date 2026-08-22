/*
 * OwO Bot for Discord
 * Copyright (C) 2021 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const global = require('../../../utils/global.js');
const animals = require('../../../utils/animalInfoUtil.js');
const eventUtil = require('../../../utils/eventUtil.js');
const cacheUtil = require('../../../utils/cacheUtil.js');
const mongo = require('../../../utils/mongo.js');

let enableDistortedTier = true;
setTimeout(() => {
	// Disable distorted after 6 hours;
	enableDistortedTier = false;
}, 21600000);

function randAnimal(opts = {}) {
	const event = getEventAnimals();
	opts.event = event;
	const rarities = getRarities(opts);

	const rankName = getRandomRank(rarities);
	const rank = animals.getRank(rankName);
	let animalName;
	if (rankName !== 'special') {
		animalName = rank.animals[Math.floor(Math.random() * rank.animals.length)];
	} else {
		animalName = getRandomEventAnimal(event);
	}

	return animals.getAnimal(animalName);
}

function getRandomEventAnimal(event) {
	const totalRarity = event.reduce((sum, val) => sum + val.rarity, 0);
	const rand = Math.random() * totalRarity;

	let total = 0;
	for (let i in event) {
		total += event[i].rarity;
		if (rand < total) {
			return event[i].animal;
		}
	}
}

function getRandomRank(rarities) {
	const totalRarity = Object.values(rarities).reduce((sum, val) => sum + val, 0);
	const rand = Math.random() * totalRarity;

	let total = 0;
	for (let rank in rarities) {
		total += rarities[rank];
		if (rand < total) {
			return rank;
		}
	}
}

function getRarities(opts) {
	const rarity = {};
	const ranks = animals.getRanks();
	for (let key in ranks) {
		const rank = ranks[key];
		if (!rank.conditional) {
			rarity[key] = rank.rarity;
		} else {
			rarity[key] = 0;
		}
	}

	if (opts.patreon) {
		const patreon = animals.getRank('patreon');
		rarity[patreon.id] = patreon.rarity;
		rarity.common -= patreon.rarity;
		const cpatreon = animals.getRank('cpatreon');
		rarity[cpatreon.id] = cpatreon.rarity;
		rarity.common -= cpatreon.rarity;
	}

	if (opts.gem) {
		const gem = animals.getRank('gem');
		let gemRarity = gem.rarity;
		if (opts.lucky) {
			gemRarity *= opts.lucky.amount;
		}
		rarity[gem.id] = gemRarity;
		rarity.common -= gemRarity;
	}

	if (enableDistortedTier && opts.manual) {
		const distorted = animals.getRank('distorted');
		rarity[distorted.id] = distorted.rarity;
		rarity.common -= distorted.rarity;
	}

	if (opts.huntbot) {
		const bot = animals.getRank('bot');
		rarity[bot.id] = opts.huntbot;
		rarity.common -= opts.huntbot;
	}

	if (opts.event) {
		let specialRarity = opts.event.reduce((sum, val) => sum + val.rarity, 0);
		if (opts.special) {
			specialRarity *= 2;
		}
		if (opts.huntbot) {
			specialRarity /= 4;
		}
		const special = animals.getRank('special');
		rarity[special.id] = specialRarity;
		rarity.common -= specialRarity;
	}

	return rarity;
}

function getEventAnimals() {
	const event = eventUtil.getCurrentActive();
	if (!event || !event.animals) {
		return [];
	}

	const eventAnimals = [];
	event.animals.forEach((animal) => {
		eventAnimals.push({
			animal: animal.animal,
			rarity: getEventRarity(animal, event),
		});
	});

	return eventAnimals;
}

function getEventRarity(animal, event) {
	const start = new Date(event.start).getTime();
	const end = new Date(event.end).getTime();
	const diff = end - start;
	let rate = animal.minRate;
	const now = Date.now();

	if (end < now || now < start) {
		return 0;
	}

	const percentDiff = (now - start) / diff;
	rate += (animal.maxRate - animal.minRate) * percentDiff;
	return rate;
}

function generateMultipleAnimals(count, opt) {
	const total = {};
	let xp = 0;
	for (let i = 0; i < count; i++) {
		const animal = randAnimal(opt);
		const rank = animals.getRank(animal.rank);
		xp += rank.xp;
		if (total[animal.value]) {
			total[animal.value].count++;
			total[animal.value].totalXp += rank.xp;
		} else {
			total[animal.value] = {
				count: 1,
				rank: rank.id,
				value: animal.value,
				text: `**${rank.id}** ${rank.emoji}`,
				totalXp: rank.xp,
				singleXp: rank.xp,
				rankSort: rank.order,
			};
		}
	}

	const ordered = sortAnimals(total);
	const typeCount = buildTypeCount(ordered);
	return { animals: total, ordered, xp, typeCount };
}

exports.getMultipleAnimals = async function (count, user, opt) {
	return exports.getMultipleAnimalsMongo(count, user, opt);
};

exports.getMultipleAnimalsMongo = async function (count, user, opt) {
	const generated = generateMultipleAnimals(count, opt);
	await ensureAnimalBatch(user.id, generated.ordered);
	return generated;
};

exports.ensureAnimalBatch = ensureAnimalBatch;
async function ensureAnimalBatch(id, ordered) {
	for (const animal of ordered) {
		await cacheUtil.insertAnimal(String(id), animal.value);
	}
}

exports.applyAnimalBatch = async function (id, ordered, typeCount, { session } = {}) {
	id = String(id);
	const animalCollection = await mongo.collection('animal');
	const countCollection = await mongo.collection('animal_count');
	const options = session ? { session } : {};

	for (const animal of ordered) {
		const result = await animalCollection.updateOne(
			{ id, name: animal.value },
			{ $inc: { count: animal.count, totalcount: animal.count } },
			options
		);
		if (!result.matchedCount) {
			throw new Error(`Animal document missing after ensure: ${id}/${animal.value}`);
		}
	}

	const increments = {};
	for (const row of typeCount) increments[row.rank] = row.count;
	if (Object.keys(increments).length) {
		await countCollection.updateOne(
			{ id },
			{ $inc: increments, $setOnInsert: { id } },
			{ upsert: true, ...options }
		);
	}
};

exports.zooScore = function (zoo) {
	let text = '';
	if (zoo.hidden > 0) text += 'H-' + zoo.hidden + ', ';
	if (zoo.fabled > 0) text += 'F-' + zoo.fabled + ', ';
	if (zoo.cpatreon > 0) text += 'CP-' + zoo.cpatreon + ', ';
	if (zoo.distorted > 0) text += 'D-' + zoo.distorted + ', ';
	if (zoo.bot > 0) text += 'B-' + zoo.bot + ', ';
	if (zoo.gem > 0) text += 'G-' + zoo.gem + ', ';
	if (zoo.legendary > 0) text += 'L-' + zoo.legendary + ', ';
	if (zoo.patreon > 0 || zoo.cpatreon > 0) text += 'P-' + zoo.patreon + ', ';
	text += 'M-' + zoo.mythical + ', ';
	if (zoo.special > 0) text += 'S-' + zoo.special + ', ';
	text += 'E-' + zoo.epic + ', ';
	text += 'R-' + zoo.rare + ', ';
	text += 'U-' + zoo.uncommon + ', ';
	text += 'C-' + zoo.common;
	return text;
};

exports.hasSpecials = function () {
	const event = eventUtil.getCurrentActive();
	return !!event?.animals;
};

exports.getPid = async function (id, pet) {
	const userId = String(id);
	const uid = await global.getUid(userId);
	const animalCollection = await mongo.collection('animal');

	if (global.isInt(pet) && parseInt(pet) < 10) {
		const teams = await mongo.collection('pet_team');
		const active = await mongo.collection('pet_team_active');
		const memberships = await mongo.collection('pet_team_animal');
		const teamRows = await teams.find({ uid }).sort({ pgid: 1 }).toArray();
		if (!teamRows.length) return undefined;
		const activeRow = await active.findOne({ uid }, { projection: { pgid: 1 } });
		let pgid = activeRow?.pgid;
		if (!pgid || !teamRows.some((row) => row.pgid === pgid)) pgid = teamRows[0].pgid;
		const member = await memberships.findOne({ pgid, pos: parseInt(pet) });
		return member?.pid;
	}

	const row = await animalCollection.findOne(
		{ id: userId, name: pet.value },
		{ projection: { pid: 1 } }
	);
	return row?.pid;
};

function sortAnimals(animalMap) {
	const animalList = [];
	for (let value in animalMap) animalList.push(animalMap[value]);
	animalList.sort((a, b) => {
		if (a.rankSort < b.rankSort) return -1;
		if (a.rankSort > b.rankSort) return 1;
		if (a.value < b.value) return -1;
		if (a.value > b.value) return 1;
		return 0;
	});
	return animalList;
}

function buildTypeCount(ordered) {
	const byRank = {};
	for (const animal of ordered) {
		if (!byRank[animal.rank]) byRank[animal.rank] = { rank: animal.rank, count: 0 };
		byRank[animal.rank].count += animal.count;
	}
	return Object.values(byRank);
}
