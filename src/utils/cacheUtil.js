/*
 * OwO Bot for Discord
 * Copyright (C) 2024 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */
const mongo = require('./mongo.js');
const counters = require('./mongoCounters.js');

class CacheUtil {
	constructor() {
		this.getUid = this.getUid.bind(this);
		this.getAnimalNames = this.getAnimalNames.bind(this);
		this.get = this.get.bind(this);
		this.set = this.set.bind(this);
		this.cache = {};
	}

	get(type, key) {
		if (this.cache[type]) {
			return this.cache[type][key];
		}
		return undefined;
	}

	set(type, key, value, ttl) {
		if (!this.cache[type]) {
			this.cache[type] = {};
		}
		this.cache[type][key] = value;
		if (ttl) {
			setTimeout(() => {
				delete this.cache[type][key];
			}, ttl);
		}
	}

	clear(type, key) {
		if (!this.cache[type]) {
			return;
		}
		delete this.cache[type][key];
	}

	async getAnimalCount(animalName) {
		let result = this.get('animalcount', animalName);
		if (result !== undefined) {
			return result;
		}

		const animals = await mongo.collection('animal');
		const rows = await animals
			.aggregate([
				{ $match: { name: animalName } },
				{ $group: { _id: null, total: { $sum: '$totalcount' } } },
			])
			.toArray();
		const total = rows[0]?.total || 0;

		// Only cache if we have over 1000 animals
		if (total > 1000) {
			this.set('animalcount', animalName, total, 1 * 60 * 60 * 1000);
		}
		return total;
	}

	async getUid(id) {
		id = String(id);
		let result = this.get('uid', id);
		if (result !== undefined) {
			return result;
		}

		const users = await mongo.collection('user');
		let user = await users.findOne({ id }, { projection: { uid: 1 } });
		if (user?.uid !== undefined) {
			this.set('uid', id, user.uid);
			return user.uid;
		}

		const uid = await counters.next('user_uid');
		try {
			await users.insertOne({
				_id: `user:${id}`,
				id,
				uid,
				count: 0,
				patreonAnimal: 0,
				patreonDaily: 0,
				started: new Date(),
			});
			this.set('uid', id, uid);
			return uid;
		} catch (err) {
			// Another shard may have created the user between our read and insert.
			if (err?.code !== 11000) throw err;
			user = await users.findOne({ id }, { projection: { uid: 1 } });
			if (!user?.uid) throw err;
			this.set('uid', id, user.uid);
			return user.uid;
		}
	}

	async getQuests(id) {
		id = String(id);
		let result = this.get('quest', id);
		if (result) {
			return result;
		}

		const uid = await this.getUid(id);
		const quests = await mongo.collection('quest');
		result = await quests.find({ uid }).toArray();

		this.set('quest', id, result, 1 * 60 * 60 * 1000);
		return result;
	}

	clearQuests(id) {
		this.clear('quest', String(id));
	}

	async getQuestByName(questName, id, showLocked = false) {
		const quests = await this.getQuests(id);
		return quests.filter((quest) => {
			return quest.qname === questName && (showLocked || quest.locked === 0);
		});
	}

	async getAnimalNames(id) {
		id = String(id);
		let result = this.get('animalNames', id);
		if (result) {
			return result;
		}

		const collection = await mongo.collection('animal');
		const rows = await collection.find({ id }, { projection: { name: 1 } }).toArray();
		const animals = {};
		rows.forEach((row) => {
			animals[row.name] = true;
		});
		this.set('animalNames', id, animals);
		return animals;
	}

	async insertAnimal(id, animalName) {
		id = String(id);
		const animals = await this.getAnimalNames(id);
		if (animals[animalName]) {
			return;
		}

		const collection = await mongo.collection('animal');
		const pid = await counters.next('animal_pid');
		try {
			await collection.insertOne({
				_id: `animal:${encodeURIComponent(id)}:${encodeURIComponent(animalName)}`,
				id,
				name: animalName,
				pid,
				count: 0,
				xp: 0,
				ispet: 0,
				nickname: null,
				totalcount: 0,
				offensive: 0,
				sellcount: 0,
				saccount: 0,
			});
		} catch (err) {
			if (err?.code !== 11000) throw err;
		}

		animals[animalName] = true;
	}
}

module.exports = new CacheUtil();
