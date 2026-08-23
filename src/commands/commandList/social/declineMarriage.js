/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');

const declineEmoji = '💔';

module.exports = new CommandInterface({
	alias: ['declinemarriage', 'dm'],

	args: '',

	desc: 'Decline a marriage proposal.',

	example: [],

	related: ['owo marry', 'owo am'],

	permissions: ['sendMessages', 'embedLinks', 'addReactions'],

	group: ['social'],

	cooldown: 3000,

	execute: async function (p) {
		const id = String(p.msg.author.id);
		const proposals = await p.mongo.collection('propose');
		const proposal = await proposals.findOne({
			$or: [{ sender: id }, { receiver: id }],
		});
		if (!proposal) {
			p.errorMsg(', you do not have any pending marriage proposals!', 3000);
			return;
		}

		const senderUid = await p.global.getUid(proposal.sender);
		const session = await p.mongo.startSession();
		try {
			session.startTransaction();
			const removed = await proposals.deleteOne(
				{ sender: proposal.sender, receiver: proposal.receiver, rid: proposal.rid },
				{ session }
			);
			if (!removed.deletedCount) {
				await session.abortTransaction();
				p.errorMsg(', you do not have any pending marriage proposals!', 3000);
				return;
			}

			const userRings = await p.mongo.collection('user_ring');
			await userRings.updateOne(
				{ uid: senderUid, rid: proposal.rid },
				{ $inc: { rcount: 1 }, $setOnInsert: { uid: senderUid, rid: proposal.rid } },
				{ upsert: true, session }
			);
			await session.commitTransaction();
		} catch (err) {
			if (session.inTransaction()) await session.abortTransaction();
			console.error(err);
			p.errorMsg(', failed to decline that proposal. Please try again later.', 3000);
			return;
		} finally {
			await session.endSession();
		}

		let user = proposal.sender;
		let preposition = 'from';
		if (user == id) {
			user = proposal.receiver;
			preposition = 'to';
		}
		user = await p.fetch.getUser(String(user));
		if (!user) {
			p.replyMsg(declineEmoji, ', you have declined a marriage request!');
		} else {
			p.replyMsg(
				declineEmoji,
				', you have declined a marriage request ' + preposition + ' ' + user.username + '!'
			);
		}
	},
});
