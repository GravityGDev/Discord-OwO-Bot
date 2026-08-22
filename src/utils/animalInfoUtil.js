/*
 * OwO Bot for Discord
 * Copyright (C) 2024 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

let animalJson = require('../data/animal.json');
let bot;

class AnimalJson {
	constructor() {
		this.initialize = this.initialize.bind(this);
		this.reinitialize = this.reinitialize.bind(this);
		this.reinitializeAnimal = this.reinitializeAnimal.bind(this);
		this.parseAnimal = this.parseAnimal.bind(this);
		this.parseRank = this.parseRank.bind(this);
		this.getAnimal = this.getAnimal.bind(this);
		this.getRank = this.getRank.bind(this);
		this.getRanks = this.getRanks.bind(this);
		this.getOrder = this.getOrder.bind(this);
		this.ready = null;
	}

	setBot(bot_) {
		bot = bot_;
		if (!this.ready) this.ready = this.initialize();
		return this.ready;
	}

	async initialize() {
		if (!bot) throw new Error('Animal catalog cannot initialize before the bot is configured');

		const collection = await bot.mongo.collection('animals');
		const result = await collection.find({}).toArray();
		if (!result.length) {
			throw new Error(
				'MongoDB animal catalog is empty. Import/seed the animals collection before starting the bot.'
			);
		}

		const animalNameToKey = {};
		const parsedAnimals = {};
		const parsedRanks = {};
		const rankNameToKey = {};
		const previous = {
			animalNameToKey: this.animalNameToKey,
			animals: this.animals,
			ranks: this.ranks,
			rankNameToKey: this.rankNameToKey,
		};

		// Parse into temporary maps so commands never observe a half-reinitialized catalog.
		this.animalNameToKey = animalNameToKey;
		this.animals = parsedAnimals;
		this.ranks = parsedRanks;
		this.rankNameToKey = rankNameToKey;
		try {
			result.forEach(this.parseAnimal);
			Object.keys(animalJson.ranks).forEach(this.parseRank);
			this.updateAnimalsAndRanks();
			this.order = Object.keys(animalJson.ranks).sort((a, b) => {
				return animalJson.ranks[a].order - animalJson.ranks[b].order;
			});
		} catch (err) {
			this.animalNameToKey = previous.animalNameToKey;
			this.animals = previous.animals;
			this.ranks = previous.ranks;
			this.rankNameToKey = previous.rankNameToKey;
			throw err;
		}
	}

	async reinitialize(animalName) {
		if (animalName) {
			animalName = this.animalNameToKey[animalName] || animalName;
			return this.reinitializeAnimal(animalName);
		}
		const newAnimalJson = new AnimalJson();
		await newAnimalJson.initialize();
		this.copy(newAnimalJson);
	}

	deleteAnimal(animalName) {
		const animalId = this.animalNameToKey[animalName.toLowerCase()];
		if (!animalId) return;
		const animal = this.animals[animalId];
		if (!animal) return;
		delete this.animals[animalId];
		animal.alt.forEach((alt) => {
			alt = alt.toLowerCase();
			if (this.animalNameToKey[alt] === animalId) delete this.animalNameToKey[alt];
		});
		if (this.animalNameToKey[animalId.toLowerCase()] === animalId) {
			delete this.animalNameToKey[animalId.toLowerCase()];
		}
		const rank = this.ranks[animal.rank];
		rank.deleteAnimal(animal);
	}

	async reinitializeAnimal(animalName) {
		const collection = await bot.mongo.collection('animals');
		const result = await collection.findOne({ name: animalName });
		if (!result) return;
		this.parseAnimal(result);
		this.updateAnimalsAndRanks();
	}

	copy(newAnimalJson) {
		this.animalNameToKey = newAnimalJson.animalNameToKey;
		this.animals = newAnimalJson.animals;
		this.order = newAnimalJson.order;
		this.ranks = newAnimalJson.ranks;
		this.rankNameToKey = newAnimalJson.rankNameToKey;
	}

	/** Parse animal information from the database. */
	parseAnimal(rawAnimal) {
		const animal = new Animal(rawAnimal);
		this.addAnimalKeyMap(animal);
		this.animals[animal.value] = animal;
	}

	/** Parse rank information. */
	parseRank(rankName) {
		const rank = new AnimalRank(rankName);
		this.addRankKeyMap(rank);
		this.ranks[rank.id] = rank;
	}

	updateAnimalsAndRanks() {
		for (let key in this.animals) {
			const animal = this.animals[key];
			const rank = this.getRank(animal.rank);
			if (!rank) throw new Error(`Unknown animal rank '${animal.rank}' for ${animal.value}`);
			rank.addAnimalToTemp(animal);
		}
		Object.values(this.ranks).forEach((rank) => rank.useTemp());
	}

	getRank(rankName) {
		rankName = this.rankNameToKey?.[rankName?.toLowerCase()];
		return this.ranks?.[rankName];
	}

	getOrder() {
		return this.order || [];
	}

	getRanks() {
		return this.ranks || {};
	}

	getAnimal(animalName) {
		animalName = this.animalNameToKey?.[animalName?.toLowerCase()];
		return this.animals?.[animalName];
	}

	addAnimalKeyMap(animal) {
		animal.alt.forEach((value) => {
			this.animalNameToKey[value.toLowerCase()] = animal.value;
		});
		this.animalNameToKey[animal.value.toLowerCase()] = animal.value;
	}

	addRankKeyMap(rank) {
		rank.alias.forEach((value) => {
			this.rankNameToKey[value.toLowerCase()] = rank.id;
		});
		this.rankNameToKey[rank.id.toLowerCase()] = rank.id;
	}
}

class Animal {
	constructor(rawAnimal) {
		const alt = rawAnimal.alt.split(',');
		this.description = rawAnimal.description;
		this.rank = rawAnimal.rank;
		this.alt = alt;
		this.value = rawAnimal.name;
		this.emoji = rawAnimal.name;
		const emojiInfo = bot.global.parseEmoji(rawAnimal.name);
		if (emojiInfo?.name) this.alt.push(emojiInfo.name);
		this.name = emojiInfo?.name || alt[0];
		this.hpr = this.hp = rawAnimal.hp;
		this.attr = this.att = rawAnimal.att;
		this.prr = this.pr = rawAnimal.pr;
		this.wpr = this.wp = rawAnimal.wp;
		this.magr = this.mag = rawAnimal.mag;
		this.mrr = this.mr = rawAnimal.mr;
	}

	setRank(rank) {
		this.rank = rank.rank;
		this.price = rank.price;
		this.points = rank.points;
		this.essence = rank.essence;
	}
}

class AnimalRank {
	constructor(rank) {
		this.id = rank;
		this.rank = rank;
		this.name = rank;
		this.emoji = animalJson.ranks[rank].emoji;
		this.alias = [rank, ...animalJson.ranks[rank].alias];
		this.price = animalJson.ranks[rank].price;
		this.points = animalJson.ranks[rank].points;
		this.essence = animalJson.ranks[rank].essence;
		this.animals = [];
		this.tempAnimals = [];
		this.placeholder = animalJson.ranks[rank].placeholder;
		this.conditional = animalJson.ranks[rank].conditional;
		this.rarity = animalJson.ranks[rank].rarity;
		this.xp = animalJson.ranks[rank].xp;
		this.order = animalJson.ranks[rank].order;
	}

	addAnimal(animal) {
		this.animals.push(animal.value);
		animal.setRank(this);
	}

	addAnimalToTemp(animal) {
		this.tempAnimals.push(animal.value);
		animal.setRank(this);
	}

	useTemp() {
		this.animals = this.tempAnimals;
		this.tempAnimals = [];
	}

	deleteAnimal(animal) {
		const index = this.animals.indexOf(animal.value);
		if (index > -1) this.animals.splice(index, 1);
	}
}

module.exports = new AnimalJson();
