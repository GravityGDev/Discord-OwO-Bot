/*
 * OwO Bot for Discord
 * Copyright (C) 2023 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');

module.exports = new CommandInterface({
	alias: ['deleteuser'],

	owner: true,

	execute: async function (p) {
		const id = p.args[0];
		const user = id ? await p.fetch.getUser(id) : null;
		if (!user || !id) {
			p.errorMsg(', could not find user');
			return;
		}

		const users = await p.mongo.collection('user');
		const storedUser = await users.findOne({ id: String(id) }, { projection: { uid: 1 } });
		if (!storedUser?.uid) {
			p.errorMsg(', could not find user');
			return;
		}
		const uid = storedUser.uid;
		const discordId = String(id);

		const animals = await p.mongo.collection('animal');
		const teams = await p.mongo.collection('pet_team');
		const animalRows = await animals.find({ id: discordId }, { projection: { pid: 1 } }).toArray();
		const teamRows = await teams.find({ uid }, { projection: { pgid: 1 } }).toArray();
		const pids = animalRows.map((row) => row.pid).filter((pid) => pid != null);
		const pgids = teamRows.map((row) => row.pgid).filter((pgid) => pgid != null);

		const session = await p.mongo.startSession();
		try {
			session.startTransaction();

			const teamAnimals = await p.mongo.collection('pet_team_animal');
			const teamAnimalFilters = [];
			if (pids.length) teamAnimalFilters.push({ pid: { $in: pids } });
			if (pgids.length) teamAnimalFilters.push({ pgid: { $in: pgids } });
			if (teamAnimalFilters.length) {
				await teamAnimals.deleteMany({ $or: teamAnimalFilters }, { session });
			}

			const discordIdCollections = [
				'animal',
				'cowoncy',
				'animal_count',
				'autohunt',
				'blackjack',
				'lootbox',
				'lottery',
				'luck',
				'rep',
				'vote',
				'timeout',
				'user_ban',
			];
			for (const name of discordIdCollections) {
				const collection = await p.mongo.collection(name);
				await collection.deleteMany({ id: discordId }, { session });
			}

			const transactions = await p.mongo.collection('transaction');
			await transactions.deleteMany(
				{ $or: [{ sender: discordId }, { reciever: discordId }] },
				{ session }
			);

			const pray = await p.mongo.collection('user_pray');
			await pray.deleteMany(
				{ $or: [{ sender: discordId }, { receiver: discordId }] },
				{ session }
			);

			const proposals = await p.mongo.collection('propose');
			await proposals.deleteMany(
				{ $or: [{ sender: discordId }, { receiver: discordId }] },
				{ session }
			);

			const uidCollections = [
				'battle_settings',
				'crate',
				'emoji_steal',
				'pet_team_active',
				'pet_team',
				'quest',
				'rules',
				'shards',
				'user_announcement',
				'user_backgrounds',
				'user_gem',
				'user_level_rewards',
				'user_profile',
				'user_ring',
				'user_survey',
				'user_item',
				'user_weapon',
				'timers',
			];
			for (const name of uidCollections) {
				const collection = await p.mongo.collection(name);
				await collection.deleteMany({ uid }, { session });
			}

			const marriages = await p.mongo.collection('marriage');
			await marriages.deleteMany({ $or: [{ uid1: uid }, { uid2: uid }] }, { session });

			const userBattles = await p.mongo.collection('user_battle');
			await userBattles.deleteMany({ $or: [{ user1: uid }, { user2: uid }] }, { session });

			if (pids.length) {
				const weaponPassives = await p.mongo.collection('user_weapon_passive');
				const ownedWeapons = await p.mongo.collection('user_weapon');
				const weaponRows = await ownedWeapons
					.find({ uid }, { projection: { uwid: 1 }, session })
					.toArray();
				const uwids = weaponRows.map((row) => row.uwid).filter((uwid) => uwid != null);
				if (uwids.length) await weaponPassives.deleteMany({ uwid: { $in: uwids } }, { session });
			}

			await users.deleteOne({ id: discordId }, { session });
			await session.commitTransaction();
		} catch (err) {
			if (session.inTransaction()) await session.abortTransaction();
			console.error(err);
			p.errorMsg(', failed to delete user data');
			return;
		} finally {
			await session.endSession();
		}

		console.log(await p.redis.del(discordId));
		console.log(await p.redis.del('xplimit_' + discordId));
		console.log(await p.redis.del('data_' + discordId));
		console.log(await p.redis.zrem('user_xp', discordId));
		p.send(`Deleted persisted data for **${p.getUniqueName(user)}**.`);
	},
});
