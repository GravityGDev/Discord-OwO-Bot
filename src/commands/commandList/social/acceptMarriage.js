/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');

const rings = require('../../../data/rings.json');
const hearts = [
	'❤',
	'💛',
	'💚',
	'💙',
	'💜',
	'❣',
	'💕',
	'💞',
	'💓',
	'💗',
	'💖',
	'💘',
	'💝',
	'💟',
	'🎊',
	'🎉',
	'🎀',
	'🎁',
];

module.exports = new CommandInterface({
	alias: ['acceptmarriage', 'am'],

	args: '',

	desc: 'Accept a marriage proposal.',

	example: [],

	related: ['owo marry', 'owo dm'],

	permissions: ['sendMessages', 'embedLinks', 'addReactions'],

	group: ['social'],

	cooldown: 3000,

	execute: async function (p) {
		const receiverId = String(p.msg.author.id);
		const proposals = await p.mongo.collection('propose');
		const proposal = await proposals.findOne({ receiver: receiverId });
		if (!proposal) {
			p.errorMsg(', you do not have any pending marriage proposals!', 3000);
			return;
		}

		const senderUid = await p.global.getUid(proposal.sender);
		const receiverUid = await p.global.getUid(receiverId);
		let uid1 = senderUid;
		let uid2 = receiverUid;
		if (uid1 > uid2) [uid1, uid2] = [uid2, uid1];
		const ring = rings[proposal.rid];
		if (!ring) {
			p.errorMsg(', it seems like that proposal has an invalid ring...');
			return;
		}

		const session = await p.mongo.startSession();
		try {
			session.startTransaction();
			const removed = await proposals.deleteOne(
				{ sender: proposal.sender, receiver: receiverId, rid: proposal.rid },
				{ session }
			);
			if (!removed.deletedCount) {
				await session.abortTransaction();
				p.errorMsg(', you do not have any pending marriage proposals!', 3000);
				return;
			}

			const marriages = await p.mongo.collection('marriage');
			const conflict = await marriages.findOne(
				{
					$or: [
						{ uid1: { $in: [uid1, uid2] } },
						{ uid2: { $in: [uid1, uid2] } },
					],
				},
				{ session }
			);
			if (conflict) {
				await session.abortTransaction();
				p.errorMsg(', you or your friend is already married!');
				return;
			}

			await marriages.insertOne(
				{
					uid1,
					uid2,
					rid: ring.id,
					marriedDate: new Date(),
					dailies: 0,
					claimDate: null,
				},
				{ session }
			);
			await session.commitTransaction();
		} catch (err) {
			if (session.inTransaction()) await session.abortTransaction();
			console.error(err);
			p.errorMsg(', it seems like something went wrong...');
			return;
		} finally {
			await session.endSession();
		}

		let sender = await p.fetch.getUser(String(proposal.sender));
		if (!sender) {
			p.replyMsg(ring.emoji, ', congratulations!! You are now married!');
		} else {
			let heart = [
				hearts[Math.trunc(Math.random() * hearts.length)],
				hearts[Math.trunc(Math.random() * hearts.length)],
				hearts[Math.trunc(Math.random() * hearts.length)],
			];
			p.replyMsg(
				ring.emoji,
				' and **' + sender.username + '** are now married! Congratulations!! ' + heart.join(' ')
			);
		}
	},
});
