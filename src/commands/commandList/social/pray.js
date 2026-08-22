/*
 * OwO Bot for Discord
 * Copyright (C) 2020 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');

const prayLines = [
	'May luck be in your favor.',
	'You feel lucky!',
	'You feel very lucky!',
	'You can feel the luck within you!',
	'Fortune favors you!',
	'Luck is on your side!',
];
const curseLines = [
	'You feel unlucky...',
	'You feel very unlucky.',
	'Oh no.',
	'You should be careful...',
	"I've got a bad feeling about this...",
	'oh boy.',
	'rip',
];
const alterPray = require('../patreon/alterPray.js');

module.exports = new CommandInterface({
	alias: ['pray', 'curse'],

	args: '{@user}',

	desc: 'Pray or curse yourself or other users!!',

	example: ['owo pray', 'owo pray @scuttler'],

	related: [],

	permissions: ['sendMessages'],

	group: ['social'],

	cooldown: 300000,
	half: 22,
	six: 200,
	bot: true,

	execute: async function (p) {
		let user;
		if (p.args.length > 0) {
			user = p.getMention(p.args[0]);
			if (!user) {
				user = await p.fetch.getMember(p.msg.channel.guild, p.args[0]);
				if (!user) {
					p.errorMsg(', I could not find that user!', 3000);
					p.setCooldown(5);
					return;
				}
			}
		}
		if (user && user.id == p.msg.author.id) user = undefined;
		let quest;

		let text = '';
		let authorPoints = 0,
			opponentPoints = 0;
		if (p.command == 'pray') {
			let prayLine = prayLines[Math.floor(Math.random() * prayLines.length)];
			if (user) {
				text = '**🙏 | ' + p.getTag() + '** prays for **' + p.getTag(user) + '**! ' + prayLine;
				authorPoints = -1;
				opponentPoints = 1;
				quest = 'prayBy';
			} else {
				text = '**🙏 | ' + p.getTag() + '** prays... ' + prayLine;
				authorPoints = 1;
			}
		} else {
			let curseLine = curseLines[Math.floor(Math.random() * curseLines.length)];
			if (user) {
				text =
					'**👻 | ' + p.getTag() + '** puts a curse on **' + p.getTag(user) + '**! ' + curseLine;
				authorPoints = 1;
				opponentPoints = -1;
				quest = 'curseBy';
			} else {
				text = '**👻 | ' + p.getTag() + '** is now cursed. ' + curseLine;
				authorPoints = -1;
			}
		}

		await p.global.getUid(p.msg.author.id);
		if (user) await p.global.getUid(user.id);
		const luck = await p.mongo.collection('luck');
		const prayHistory = await p.mongo.collection('user_pray');
		const session = await p.mongo.startSession();
		let authorLuck;
		try {
			session.startTransaction();
			const authorId = String(p.msg.author.id);
			await luck.updateOne(
				{ id: authorId },
				{ $inc: { lcount: authorPoints }, $setOnInsert: { id: authorId } },
				{ upsert: true, session }
			);
			if (opponentPoints && user) {
				const receiverId = String(user.id);
				await luck.updateOne(
					{ id: receiverId },
					{ $inc: { lcount: opponentPoints }, $setOnInsert: { id: receiverId } },
					{ upsert: true, session }
				);
				await prayHistory.updateOne(
					{ sender: authorId, receiver: receiverId },
					{
						$inc: { count: 1 },
						$set: { latest: new Date() },
						$setOnInsert: { sender: authorId, receiver: receiverId },
					},
					{ upsert: true, session }
				);
			}
			authorLuck = await luck.findOne({ id: authorId }, { projection: { lcount: 1 }, session });
			await session.commitTransaction();
		} catch (err) {
			if (session.inTransaction()) await session.abortTransaction();
			console.error(err);
			p.errorMsg(', failed to update luck. Please try again later.', 3000);
			return;
		} finally {
			await session.endSession();
		}

		text +=
			'\n**<:blank:427371936482328596> |** You have **' +
			(authorLuck?.lcount || 0) +
			'** luck point(s)!';
		const alterText = await alterPray.alter(p, text, {
			command: p.command,
			author: p.msg.author,
			user,
			luck: authorLuck?.lcount || 0,
		});
		p.send(alterText || text);
		if (user && quest) p.quest(quest, 1, user);
		if (opponentPoints && user) {
			p.logger.incr('pray', 1, { from: p.msg.author.id, to: user.id });
			p.macro.checkToCommands(p, user.id);
		} else p.logger.incr('pray', 1, { from: p.msg.author.id, to: 'self' });
	},
});
