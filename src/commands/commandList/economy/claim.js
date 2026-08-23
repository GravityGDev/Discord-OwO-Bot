/*
 * OwO Bot for Discord
 * Copyright (C) 2020 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');
const mongoNumeric = require('../../../utils/mongoNumeric.js');

const giftEmoji = '🎁';

module.exports = new CommandInterface({
	alias: ['claim', 'reward', 'compensation'],

	args: '',

	desc: 'Claim rewards! (If there are any c:)',

	example: [],

	related: [],

	permissions: ['sendMessages', 'embedLinks'],

	group: ['economy'],

	cooldown: 15000,

	execute: async function (p) {
		const uid = await p.global.getUid(p.msg.author.id);
		if (!uid) {
			p.errorMsg(', Failed to claim rewards', 5000);
			return;
		}

		const compensation = await p.mongo.collection('compensation');
		const userCompensation = await p.mongo.collection('user_compensation');
		const cowoncy = await p.mongo.collection('cowoncy');
		const lootbox = await p.mongo.collection('lootbox');
		const crate = await p.mongo.collection('crate');
		const activeRewards = await compensation.find({ end_date: { $gt: new Date() } }).toArray();

		if (!activeRewards.length) {
			p.errorMsg(', there are no rewards available at this time!', 5000);
			return;
		}

		let totalRewards = 0;
		let totalCowoncy = 0;
		let totalLootbox = 0;
		let totalFabledLootbox = 0;
		let totalWeaponCrate = 0;
		const session = await p.mongo.startSession();

		try {
			session.startTransaction();

			for (const row of activeRewards) {
				const claim = await userCompensation.updateOne(
					{ uid, cid: row.id },
					{ $setOnInsert: { uid, cid: row.id, claimedAt: new Date() } },
					{ upsert: true, session }
				);
				if (!claim.upsertedCount) continue;

				totalRewards++;
				for (const reward of String(row.reward || '').split(',')) {
					if (!reward) continue;
					const type = reward.charAt(0);
					const count = parseInt(reward.substring(1));
					if (!Number.isInteger(count) || count <= 0) continue;

					switch (type) {
						case 'c':
							totalCowoncy += count;
							break;
						case 'l':
							totalLootbox += count;
							break;
						case 'w':
							totalWeaponCrate += count;
							break;
						case 'f':
							totalFabledLootbox += count;
							break;
					}
				}
			}

			if (!totalRewards) {
				await session.abortTransaction();
				p.errorMsg(', there are no rewards available at this time!', 5000);
				return;
			}

			if (totalCowoncy) {
				await mongoNumeric.add(
					cowoncy,
					{ id: String(p.msg.author.id) },
					'money',
					totalCowoncy,
					{ upsert: true, session },
					{ id: String(p.msg.author.id) }
				);
			}
			if (totalLootbox || totalFabledLootbox) {
				const inc = {};
				if (totalLootbox) inc.boxcount = totalLootbox;
				if (totalFabledLootbox) inc.fbox = totalFabledLootbox;
				await lootbox.updateOne(
					{ id: String(p.msg.author.id) },
					{
						$inc: inc,
						$setOnInsert: {
							id: String(p.msg.author.id),
							claimcount: 0,
							claim: new Date('2017-01-01T00:00:00.000Z'),
						},
					},
					{ upsert: true, session }
				);
			}
			if (totalWeaponCrate) {
				await crate.updateOne(
					{ uid, cratetype: 0 },
					{
						$inc: { boxcount: totalWeaponCrate },
						$setOnInsert: {
							uid,
							cratetype: 0,
							claimcount: 0,
							claim: new Date('2017-01-01T00:00:00.000Z'),
						},
					},
					{ upsert: true, session }
				);
			}

			await session.commitTransaction();
		} catch (err) {
			console.error(err);
			if (session.inTransaction()) await session.abortTransaction();
			p.errorMsg(', Failed to claim rewards', 5000);
			return;
		} finally {
			await session.endSession();
		}

		let txt = `, You claimed ${totalRewards} reward(s)! 🎉\n`;
		txt += `${p.config.emoji.blank} **|** `;
		const rewardTxt = [];
		if (totalCowoncy) rewardTxt.push(`+${totalCowoncy} ${p.config.emoji.cowoncy}`);
		if (totalWeaponCrate) rewardTxt.push(`+${totalWeaponCrate} ${p.config.emoji.crate}`);
		if (totalLootbox) rewardTxt.push(`+${totalLootbox} ${p.config.emoji.lootbox}`);
		if (totalFabledLootbox) rewardTxt.push(`+${totalFabledLootbox} ${p.config.emoji.fabledLootbox}`);
		txt += rewardTxt.join(',');
		await p.replyMsg(giftEmoji, txt);
	},
});
