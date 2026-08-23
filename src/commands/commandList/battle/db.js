/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');

module.exports = new CommandInterface({
	alias: ['db', 'declinebattle'],

	args: '',

	desc: 'Decline a battle request!',

	example: [''],

	related: ['owo battle'],

	permissions: ['sendMessages', 'embedLinks', 'addReactions'],

	group: ['animals'],

	cooldown: 5000,
	half: 80,
	six: 500,

	execute: async function (p) {
		const author = p.opt?.author || p.msg.author;
		const uid = await p.global.getUid(author.id);
		const battles = await p.mongo.collection('user_battle');
		const cutoff = new Date(Date.now() - 10 * 60 * 1000);
		const battle = await battles.findOne({
			time: { $gt: cutoff },
			$or: [{ user1: uid }, { user2: uid }],
		});

		if (!battle) {
			p.errorMsg(', You do not have any pending battles!', 3000);
			return;
		}

		const result = await battles.updateOne(
			{ _id: battle._id, time: { $gt: cutoff } },
			{ $set: { time: new Date('2018-01-01T00:00:00.000Z') } }
		);
		if (!result.modifiedCount) {
			p.errorMsg(', You do not have any pending battles!', 3000);
			return;
		}

		const opponentUid = battle.user1 == uid ? battle.user2 : battle.user1;
		const users = await p.mongo.collection('user');
		const opponentRecord = await users.findOne({ uid: opponentUid }, { projection: { id: 1 } });
		let opponent = opponentRecord?.id ? await p.fetch.getUser(String(opponentRecord.id)) : null;
		const opponentName = opponent ? opponent.username : 'an opponent';

		p.replyMsg('⚔️', `, You have declined your battle with **${opponentName}**`);
	},
});
