/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');

const BattleEvent = require('./util/BattleEvent.js');

module.exports = new CommandInterface({
	alias: ['ab', 'acceptbattle'],

	args: '[bet]',

	desc: 'Accept a battle request! If a bet was added, you will have to add the amount to accept it in addition to the battle.',

	example: [''],

	related: ['owo battle'],

	permissions: ['sendMessages', 'embedLinks', 'addReactions'],

	group: ['animals'],

	cooldown: 5000,
	half: 80,
	six: 500,

	execute: async function (p) {
		const author = p.opt?.member || p.opt?.author || p.msg.member || p.msg.author;
		const uid = await p.global.getUid(author.id);
		const battles = await p.mongo.collection('user_battle');
		const cutoff = new Date(Date.now() - 10 * 60 * 1000);
		const battle = await battles.findOne({
			time: { $gt: cutoff },
			$and: [
				{ $or: [{ user1: uid }, { user2: uid }] },
				{ $or: [{ sender: { $ne: uid } }, { $expr: { $eq: ['$user1', '$user2'] } }] },
			],
		});

		if (!battle) {
			p.errorMsg(', You do not have any pending battles!', 3000);
			return;
		}

		if (String(battle.channel) != String(p.msg.channel.id)) {
			p.errorMsg(', You can only accept battle requests from the same channel!', 3000);
			return;
		}

		const claimed = await battles.updateOne(
			{ _id: battle._id, time: { $gt: cutoff } },
			{ $set: { time: new Date('2018-01-01T00:00:00.000Z') } }
		);
		if (!claimed.modifiedCount) {
			p.errorMsg(', You do not have any pending battles!', 3000);
			return;
		}

		let flags = String(battle.flags || '').split(',');
		flags = parseFlags(flags);

		const users = await p.mongo.collection('user');
		const senderRecord = await users.findOne({ uid: battle.sender }, { projection: { id: 1 } });
		if (!senderRecord?.id) {
			p.errorMsg(', I could not find your opponent!', 3000);
			return;
		}

		let sender;
		if (p.msg.channel.guild) {
			sender = await p.fetch.getMember(p.msg.channel.guild.id, String(senderRecord.id));
		} else {
			sender = await p.fetch.getUser(String(senderRecord.id));
		}
		if (!sender) {
			p.errorMsg(', I could not find your opponent!', 3000);
			return;
		}
		if (!p.msg.channel.guild) {
			flags.instant = true;
		}

		const settingOverride = {
			friendlyBattle: true,
			display: flags.display ? flags.display : 'image',
			speed: flags.instant || flags.log ? 'instant' : 'short',
			instant: flags.instant || flags.log ? true : false,
			title: this.getName(author) + ' vs ' + this.getName(sender),
			showLogs: flags.link ? 'link' : flags.log ? true : false,
		};

		const battleEvent = new BattleEvent(this, true);
		await battleEvent.init({
			setting: settingOverride,
			player: sender,
			enemy: author,
			levelOverride: flags.level,
		});
		battleEvent.simulateBattle();

		let user1 = author.id;
		let user2 = sender.id;
		if (author.id > sender.id) {
			user1 = sender.id;
			user2 = author.id;
		}
		let winColumn = 'tie';
		if (battleEvent.endResult.playerWin && !battleEvent.endResult.enemyWin) {
			if (user1 == author.id) winColumn = 'win1';
			else winColumn = 'win2';
		} else if (battleEvent.endResult.enemyWin && !battleEvent.endResult.playerWin) {
			if (user1 == sender.id) winColumn = 'win1';
			else winColumn = 'win2';
		}

		const uid1 = await p.global.getUid(user1);
		const uid2 = await p.global.getUid(user2);
		await battles.updateOne({ user1: uid1, user2: uid2 }, { $inc: { [winColumn]: 1 } });

		if (sender && sender.id != author.id) {
			p.quest('friendlyBattle', 1, author);
			p.quest('friendlyBattleBy', 1, sender);
		}

		await battleEvent.displayBattles();
	},
});

function parseFlags(flags) {
	let result = {};
	for (let i in flags) {
		let flag = flags[i];
		if (flag == 'link') {
			result.link = true;
			result.log = true;
		} else if (flag == 'log') {
			result.log = true;
		} else if (flag == 'compact' || flag == 'image' || flag == 'text') {
			result.display = flag;
		} else if (/^l[0-9]+$/.test(flag)) {
			result.level = parseInt(flag.substring(1));
		}
	}
	return result;
}
