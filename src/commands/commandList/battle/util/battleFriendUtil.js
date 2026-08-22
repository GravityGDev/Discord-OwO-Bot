/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const teamUtil = require('./teamUtil.js');
const ab = require('../ab.js');
const db = require('../db.js');

exports.challenge = async function (p, opponent) {
	const bet = 0;
	let user1 = p.msg.author.id;
	let user2 = opponent.id;
	if (p.msg.author.id > opponent.id) {
		user1 = opponent.id;
		user2 = p.msg.author.id;
	}
	const uid1 = await p.global.getUid(user1);
	const uid2 = await p.global.getUid(user2);
	const uid = await p.global.getUid(p.msg.author.id);

	const battles = await p.mongo.collection('user_battle');
	const cutoff = new Date(Date.now() - 10 * 60 * 1000);
	const pending = await battles.findOne({
		time: { $gt: cutoff },
		$or: [{ user1: { $in: [uid1, uid2] } }, { user2: { $in: [uid1, uid2] } }],
	});
	const previous = await battles.findOne({ user1: uid1, user2: uid2 });

	if (pending) {
		p.errorMsg(', There is already a pending battle!', 3000);
		return;
	}

	const player = await teamUtil.getBattleTeam.bind(p)({ id: p.msg.author.id });
	if (!player) {
		p.errorMsg(", You don't have a team!", 3000);
		return;
	}
	player.username = p.getName();
	player.id = p.msg.author.id;

	const enemy = await teamUtil.getBattleTeam.bind(p)(
		{ id: opponent.id },
		null,
		opponent.id === p.msg.author.id
	);
	if (!enemy) {
		p.errorMsg(", The opponent doesn't have a team!", 3000);
		return;
	}
	enemy.username = p.getName(opponent);
	enemy.id = opponent.id;

	let stats = {};
	stats.tie = previous ? previous.tie || 0 : 0;
	stats[user1] = previous ? previous.win1 || 0 : 0;
	stats[user2] = previous ? previous.win2 || 0 : 0;

	let flags = p.args.slice(1);
	if (p.global.isInt(flags[0])) flags = flags.slice(1);
	flags = parseFlags(p, flags);

	await battles.updateOne(
		{ user1: uid1, user2: uid2 },
		{
			$set: {
				time: new Date(),
				sender: uid,
				bet: 0,
				flags,
				channel: String(p.msg.channel.id),
			},
			$setOnInsert: {
				user1: uid1,
				user2: uid2,
				win1: 0,
				win2: 0,
				tie: 0,
			},
		},
		{ upsert: true }
	);

	let content = toEmbedRequest(p, stats, bet, player, enemy, flags);
	content.components = [
		{
			type: 1,
			components: [
				{
					type: 2,
					label: 'Accept',
					style: 3,
					custom_id: 'battle_accept',
				},
				{
					type: 2,
					label: 'Decline',
					style: 4,
					custom_id: 'battle_decline',
				},
			],
		},
	];
	const msg = await p.send(content);

	let filter = (componentName, user) =>
		['battle_accept', 'battle_decline'].includes(componentName) &&
		[p.msg.author.id, opponent.id].includes(user.id);
	let collector = p.interactionCollector.create(msg, filter, { time: 900000 });

	collector.on('collect', async (component, user, ack, err) => {
		content.components[0].components[0].disabled = true;
		content.components[0].components[1].disabled = true;
		if (component === 'battle_accept') {
			content.embed.color = p.config.success_color;
			content.embed.footer.text = 'The battle was accepted!';
			if (user.id === opponent.id) {
				collector.stop('done');
				p.command = 'ab';
				p.opt = {
					author: opponent,
				};
				ab.execute(p);
			} else {
				p.opt = {
					author: p.msg.author,
				};
				err(`${p.config.emoji.error} **|** The opponent must accept the battle.`);
				return;
			}
		} else {
			collector.stop('done');
			content.embed.color = p.config.fail_color;
			content.embed.footer.text = 'The battle was declined.';
			p.command = 'db';
			if (user.id === opponent.id) {
				p.opt = {
					author: opponent,
				};
			} else {
				p.opt = {
					author: p.msg.author,
				};
			}
			db.execute(p);
		}
		ack(content);
	});

	collector.on('end', async (reason) => {
		if (reason === 'done') return;
		content.embed.color = p.config.timeout_color;
		content.components[0].components[0].disabled = true;
		content.components[0].components[1].disabled = true;
		content.content = `${p.config.emoji.warning} This message is now inactive.`;
		try {
			await msg.edit(content);
		} catch (err) {
			console.error(err);
			console.error(`[${msg.id}] Could not edit message`);
		}
	});
};

function toEmbedRequest(p, stats, bet, sender, receiver, flags) {
	let text = [];
	for (let i in sender.team) {
		let animal = sender.team[i];
		let tempText = 'L.' + animal.stats.lvl + ' ' + animal.animal.value + ' ';
		tempText += animal.nickname ? animal.nickname : animal.animal.name;
		if (animal.weapon) {
			tempText += ' | ' + animal.weapon.rank.emoji + animal.weapon.emoji;
			let passives = animal.weapon.passives;
			for (let j in passives) {
				tempText += passives[j].emoji;
			}
			tempText += ' ' + animal.weapon.avgQuality + '%';
		}
		text.push(tempText);
	}

	let text2 = [];
	for (let i in receiver.team) {
		let animal = receiver.team[i];
		let tempText = 'L.' + animal.stats.lvl + ' ' + animal.animal.value + ' ';
		tempText += animal.nickname ? animal.nickname : animal.animal.name;
		if (animal.weapon) {
			tempText += ' | ' + animal.weapon.rank.emoji + animal.weapon.emoji;
			let passives = animal.weapon.passives;
			for (let j in passives) {
				tempText += passives[j].emoji;
			}
			tempText += ' ' + animal.weapon.avgQuality + '%';
		}
		text2.push(tempText);
	}

	let flagText = '';
	flags = flags.split(',');
	for (let i in flags) {
		let flag = flags[i];
		if (flag == 'log' || flag == 'link') {
			flagText += '`LOGS` ';
		} else if (flag == 'compact' || flag == 'image' || flag == 'text') {
			flagText += '`' + flag.toUpperCase() + '` ';
		} else if (/^l[0-9]+$/.test(flag)) {
			flagText += '`LVL' + flag.substring(1) + '` ';
		}
	}
	if (flagText != '') flagText = '\nFlags: ' + flagText;

	let acceptText = '\n`owo ab` to accept the battle!';
	if (bet > 0) {
		acceptText =
			'\n`owo ab ' +
			bet +
			'` to accept the battle with the bet!\n`owo ab` to accept the battle without the bet!';
	}

	let embed = {
		author: {
			name: `${receiver.username}, ${sender.username} challenges you to a duel!`,
			icon_url: p.msg.author.avatarURL,
		},
		description: flagText + acceptText + '\n`owo db` to decline the battle!',
		color: p.config.embed_color,
		footer: {
			text: 'This challenge will expire in 10 minutes',
		},
		timestamp: new Date(),
	};

	if (text.join('\n').length > 1024 || text2.join('\n').length > 1024) {
		embed.fields = [];
		for (let i in text) {
			embed.fields.push({
				name:
					(sender.name ? sender.name : sender.username + "'s Team") +
					(sender.id == receiver.id
						? ''
						: ' | ' + (stats[sender.id] ? stats[sender.id] : 0) + ' wins'),
				value: text[i],
				inline: true,
			});
		}
		for (let i in text2) {
			embed.fields.push({
				name:
					(receiver.name ? receiver.name : receiver.username + "'s Team") +
					(sender.id == receiver.id
						? ''
						: ' | ' + (stats[receiver.id] ? stats[receiver.id] : 0) + ' wins'),
				value: text2[i],
				inline: true,
			});
		}
	} else {
		embed.fields = [
			{
				name:
					(sender.name ? sender.name : sender.username + "'s Team") +
					(sender.id == receiver.id
						? ''
						: ' | ' + (stats[sender.id] ? stats[sender.id] : 0) + ' wins'),
				value: text.join('\n'),
				inline: true,
			},
			{
				name:
					(receiver.name ? receiver.name : receiver.username + "'s Team") +
					(sender.id == receiver.id
						? ''
						: ' | ' + (stats[receiver.id] ? stats[receiver.id] : 0) + ' wins'),
				value: text2.join('\n'),
				inline: true,
			},
		];
	}

	let content = `<@${receiver.id}>`;

	return { content, embed };
}

exports.inBattle = async function (p) {
	const uid = await p.global.getUid(p.msg.author.id);
	const battles = await p.mongo.collection('user_battle');
	const cutoff = new Date(Date.now() - 10 * 60 * 1000);
	return battles.findOne({
		time: { $gt: cutoff },
		$or: [{ user1: uid }, { user2: uid }],
	});
};

function parseFlags(p, flags) {
	let result = [];
	let usedFlags = [];

	flags = flags.join('').replace(/[=:]/gi, '').replace(/[,]/gi, '-').toLowerCase().split('-');

	for (let i in flags) {
		let flag = parseFlag(p, flags[i]);
		if (flag && !usedFlags.includes(flag.flag)) {
			result.push(flag.res);
			usedFlags.push(flag.flag);
		}
	}

	return result.join(',');
}

function parseFlag(p, flag) {
	if (flag.startsWith('display')) {
		flag = flag.replace('display', '');
		switch (flag) {
			case 'text':
				return { flag: 'display', res: 'text' };
			case 'compact':
				return { flag: 'display', res: 'compact' };
			case 'image':
				return { flag: 'display', res: 'image' };
			default:
				return undefined;
		}
	} else if (flag.startsWith('log')) {
		flag = flag.replace('logs', '').replace('log', '');
		switch (flag) {
			case 'link':
				return { flag: 'log', res: 'link' };
			default:
				return { flag: 'log', res: 'log' };
		}
	} else if (flag.startsWith('lvl') || flag.startsWith('level')) {
		flag = flag.replace('level', '').replace('lvl', '');
		if (p.global.isInt(flag)) {
			flag = parseInt(flag);
			if (flag < 1) flag = 1;
			if (flag > 100) flag = 100;
			return { flag: 'lvl', res: 'l' + flag };
		} else {
			return undefined;
		}
	}
	return undefined;
}
