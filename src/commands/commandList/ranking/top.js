/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');
const global = require('../../../utils/global.js');
const animalUtil = require('../battle/util/animalUtil.js');
const animalUtil2 = require('../zoo/animalUtil.js');
const levels = require('../../../utils/levels.js');
const WeaponInterface = require('../battle/WeaponInterface.js');
const weaponUtil = require('../battle/util/weaponUtil.js');
const ranking = require('./rankingMongoUtil.js');

const weaponArgs = Object.keys(WeaponInterface.weapons).map((id) => 'w' + (100 + parseInt(id)));

module.exports = new CommandInterface({
	alias: ['top', 'rank', 'ranking'],
	args: 'points|guild|zoo|money|cookie|pet|huntbot|luck|curse|battle|daily|level|shard|w|w{wid} [global] {count}',
	desc: 'Displays the top ranking of each category!',
	example: ['owo top zoo', 'owo top cowoncy global', 'owo top p g'],
	related: ['owo my'],
	permissions: ['sendMessages'],
	group: ['rankings'],
	cooldown: 60000,
	half: 20,
	six: 200,
	bot: true,
	execute: async function (p) {
		await display(p, p.msg, p.args);
	},
});

async function display(p, msg, args) {
	let globalRank = false;
	let type;
	let invalid = false;
	let count = 5;

	for (const raw of args) {
		const arg = raw.toLowerCase();
		if (!type) {
			if (['points', 'point', 'p'].includes(arg)) type = 'points';
			else if (['guild', 'server', 's'].includes(arg)) type = 'guild';
			else if (['zoo', 'z'].includes(arg)) type = 'zoo';
			else if (['cowoncy', 'money', 'm', 'c', 'cash'].includes(arg)) type = 'money';
			else if (['cookies', 'cookie', 'rep', 'r'].includes(arg)) type = 'rep';
			else if (['pets', 'pet'].includes(arg)) type = 'pet';
			else if (['huntbot', 'hb', 'autohunt', 'ah'].includes(arg)) type = 'huntbot';
			else if (['luck', 'pray'].includes(arg)) type = 'luck';
			else if (arg === 'curse') type = 'curse';
			else if (['battle', 'streak'].includes(arg)) type = 'battle';
			else if (arg === 'daily') type = 'daily';
			else if (['level', 'lvl', 'xp'].includes(arg)) type = 'level';
			else if (['shards', 'shard', 'ws', 'weaponshard'].includes(arg)) type = 'shard';
			else if (['tt', 'takedown', 'takdowntracker', 'tracker', 'weapon', 'w'].includes(arg) || weaponArgs.includes(arg)) type = arg;
			else if (['global', 'g'].includes(arg)) globalRank = true;
			else if (global.isInt(arg)) count = parseInt(arg);
			else invalid = true;
		} else if (['global', 'g'].includes(arg)) globalRank = true;
		else if (global.isInt(arg)) count = parseInt(arg);
		else invalid = true;
	}

	if (count > 25) count = 25;
	else if (count < 1) count = 5;
	if (invalid) return p.errorMsg(', Invalid ranking type!', 3000);
	type = type || 'points';

	if (type === 'guild') return getGuildRanking(msg, count, p);
	if (type === 'level') return getLevelRanking(globalRank, p, count);
	if (weaponArgs.includes(type) || ['tt', 'takedown', 'takdowntracker', 'tracker', 'weapon', 'w'].includes(type)) {
		return getTTRanking(globalRank, msg, count, p, type);
	}

	const configs = {
		points: {
			collection: 'user', scoreField: 'count', title: 'OwO Rankings',
			text: (q, r) => (r === 0 ? `>\t\tyou said owo ${global.toFancyNum(q.count)} times!\n\n` : `\n\t\tsaid owo ${global.toFancyNum(q.count)} times!\n`),
		},
		zoo: {
			collection: 'animal_count', scoreField: 'total', title: 'Zoo Rankings',
			text: (q, r) => `${r === 0 ? '>' : '\n'}\t\t${global.toFancyNum(q.total || 0)} zoo points: ${animalUtil2.zooScore(q)}${r === 0 ? '\n\n' : '\n'}`,
		},
		money: {
			collection: 'cowoncy', scoreField: 'money', title: 'Cowoncy Rankings',
			text: (q, r) => `${r === 0 ? '>' : '\n'}\t\tCowoncy: ${global.toFancyNum(q.money)}${r === 0 ? '\n\n' : '\n'}`,
		},
		rep: {
			collection: 'rep', scoreField: 'count', title: 'Cookie Rankings',
			text: (q, r) => `${r === 0 ? '>' : '\n'}\t\tCookies: ${global.toFancyNum(q.count)}${r === 0 ? '\n\n' : '\n'}`,
		},
		pet: {
			collection: 'animal', scoreField: 'xp', title: 'Pet Rankings', meSort: { xp: -1 },
			text: (q, r) => {
				let value = '\t\t ';
				if (q.nickname) value += q.nickname + ' ';
				const lvl = animalUtil.toLvl(q.xp);
				value += `Lvl. ${lvl.lvl} ${lvl.currentXp}xp\n`;
				return r === 0 ? '>' + value + '\n' : '\n' + value;
			},
		},
		huntbot: {
			collection: 'autohunt', scoreField: 'total', title: 'HuntBot Rankings',
			text: (q, r) => `${r === 0 ? '>' : '\n'}\t\tEssence: ${global.toFancyNum(q.total)}${r === 0 ? '\n\n' : '\n'}`,
		},
		luck: {
			collection: 'luck', scoreField: 'lcount', title: 'Luck Rankings',
			text: (q, r) => `${r === 0 ? '>' : '\n'}\t\tLuck: ${global.toFancyNum(q.lcount)}${r === 0 ? '\n\n' : '\n'}`,
		},
		curse: {
			collection: 'luck', scoreField: 'lcount', title: 'Curse Rankings', higherBetter: false,
			text: (q, r) => `${r === 0 ? '>' : '\n'}\t\tLuck: ${global.toFancyNum(q.lcount)}${r === 0 ? '\n\n' : '\n'}`,
		},
		daily: {
			collection: 'cowoncy', scoreField: 'daily_streak', title: 'Daily Streak Rankings',
			text: (q, r) => `${r === 0 ? '>' : '\n'}\t\tStreak: ${global.toFancyNum(q.daily_streak || 0)}${r === 0 ? '\n\n' : '\n'}`,
		},
	};

	if (type === 'battle') return getBattleRanking(globalRank, msg, count, p);
	if (type === 'shard') return getShardRanking(globalRank, msg, count, p);
	return getDirectRanking(globalRank, msg, count, p, configs[type]);
}

async function getDirectRanking(globalRank, msg, count, p, config) {
	const memberIds = globalRank ? undefined : ranking.memberIds(msg);
	const top = await ranking.topDirect({
		collection: config.collection,
		scoreField: config.scoreField,
		count,
		memberIds,
		higherBetter: config.higherBetter !== false,
	});
	const around = await ranking.aroundDirect({
		collection: config.collection,
		scoreField: config.scoreField,
		authorId: p.msg.author.id,
		memberIds,
		higherBetter: config.higherBetter !== false,
		meSort: config.meSort,
	});
	const title = `Top ${count} ${globalRank ? 'Global ' : ''}${config.title}${globalRank ? '' : ' for ' + msg.channel.guild.name}`;
	await displayRanking(top, around.me, title, config.text, p);
}

async function displayRanking(rows, me, title, subText, p) {
	let rank = 1;
	let embed = `\`\`\`md\n< ${title} >\n`;
	if (me) {
		embed += `> Your Rank: ${global.toFancyNum(me.rank)}\n`;
		embed += subText(me, 0);
	}
	for (const ele of rows) {
		const id = String(ele.id);
		let user = await p.fetch.getUser(id, true);
		let name = user ? p.getUniqueName(user) : 'User Left Bot';
		name = name.replace('discord.gg', 'discord,gg').replace(/(```)/g, '`\u200b``');
		embed += `#${rank}\t${name}${subText(ele, rank)}`;
		rank++;
	}
	const date = new Date();
	embed += date.toLocaleString('en-US', {
		month: '2-digit', day: '2-digit', year: 'numeric', hour12: false, hour: '2-digit', minute: '2-digit',
	}) + '```';
	p.send(embed, null, null, { split: { prepend: '```md\n', append: '```' } });
}

async function getGuildRanking(msg, count, p) {
	const top = await ranking.topDirect({ collection: 'guild', scoreField: 'count', count });
	const around = await ranking.aroundDirect({
		collection: 'guild', scoreField: 'count', authorId: msg.channel.guild.id,
	});
	let rank = 1;
	let embed = `\`\`\`md\n< Top ${count} Guild OwO Rankings >\n`;
	if (around.me) {
		embed += `> Your Guild Rank: ${global.toFancyNum(around.me.rank)}\n`;
		embed += `>\t\tcollectively said owo ${global.toFancyNum(around.me.count)} times!\n\n`;
	}
	for (const ele of top) {
		let guild = await p.fetch.getGuild(String(ele.id), true);
		let name = guild ? guild.name : 'Guild Left Bot';
		name = name.replace('discord.gg', 'discord,gg');
		embed += `#${rank}\t${name}\n\t\tcollectively said owo ${global.toFancyNum(ele.count)} times!\n`;
		rank++;
	}
	const date = new Date();
	embed += `\n*Spamming owo will not count!!!* | ${date.toLocaleString('en-US', {
		month: '2-digit', day: '2-digit', year: 'numeric', hour12: false, hour: '2-digit', minute: '2-digit',
	})}\`\`\``;
	p.send(embed);
}

async function getBattleRanking(globalRank, msg, count, p) {
	const memberIds = globalRank ? undefined : ranking.memberIds(msg);
	const activePgid = await ranking.getActiveTeamPgid(p.msg.author.id);
	const top = await ranking.topUidScores({ collection: 'pet_team', scoreField: 'streak', count, memberIds });
	const around = await ranking.aroundUidScores({
		collection: 'pet_team', scoreField: 'streak', authorId: p.msg.author.id, memberIds,
		meExtraMatch: activePgid ? { pgid: activePgid } : {},
	});
	const title = `Top ${count} ${globalRank ? 'Global Battle Streak Rankings' : 'Battle Streak Rankings for ' + msg.channel.guild.name}`;
	await displayRanking(top, around.me, title, (q, r) => {
		const value = `${q.tname ? q.tname + ' - ' : ''}Streak: ${global.toFancyNum(q.streak || 0)}`;
		return `${r === 0 ? '>\t\t' : '\n\t\t'}${value}${r === 0 ? '\n\n' : '\n'}`;
	}, p);
}

async function getShardRanking(globalRank, msg, count, p) {
	const memberIds = globalRank ? undefined : ranking.memberIds(msg);
	const top = await ranking.topUidScores({ collection: 'shards', scoreField: 'count', count, memberIds });
	const around = await ranking.aroundUidScores({
		collection: 'shards', scoreField: 'count', authorId: p.msg.author.id, memberIds,
	});
	const title = `Top ${count} ${globalRank ? 'Global Weapon Shard Rankings' : 'Weapon Shard Rankings for ' + msg.channel.guild.name}`;
	await displayRanking(top, around.me, title, (q, r) => `${r === 0 ? '>\t\t' : '\n\t\t'}Shards: ${global.toFancyNum(q.count)}${r === 0 ? '\n\n' : '\n'}`, p);
}

function takedownPipeline(memberIds, wid) {
	const pipeline = [
		{ $lookup: { from: 'user_weapon', localField: 'uwid', foreignField: 'uwid', as: 'tracked' } },
		{ $unwind: '$tracked' },
	];
	if (wid !== undefined) pipeline.push({ $match: { 'tracked.wid': wid } });
	pipeline.push(
		{ $lookup: { from: 'user', localField: 'tracked.uid', foreignField: 'uid', as: 'owner' } },
		{ $unwind: '$owner' }
	);
	if (memberIds) pipeline.push({ $match: { 'owner.id': { $in: memberIds } } });
	pipeline.push({
		$addFields: {
			id: '$owner.id', wid: '$tracked.wid', avg: '$tracked.avg', wear: '$tracked.wear',
			__rankScore: { $convert: { input: '$kills', to: 'decimal', onError: 0, onNull: 0 } },
		},
	});
	return pipeline;
}

async function getTTRanking(globalRank, msg, count, p, tt) {
	let wid;
	if (/^w\d{3}$/gi.test(tt)) wid = parseInt(tt.substring(1)) - 100;
	const memberIds = globalRank ? undefined : ranking.memberIds(msg);
	const collection = await p.mongo.collection('user_weapon_kills');
	const topPipeline = takedownPipeline(memberIds, wid);
	topPipeline.push({ $sort: { __rankScore: -1 } }, { $limit: count });
	const top = await collection.aggregate(topPipeline).toArray();

	const mePipeline = takedownPipeline(undefined, wid);
	mePipeline.push({ $match: { 'owner.id': String(p.msg.author.id) } }, { $sort: { __rankScore: -1 } }, { $limit: 1 });
	const meRows = await collection.aggregate(mePipeline).toArray();
	const me = meRows[0];
	if (me) {
		const rankPipeline = takedownPipeline(memberIds, wid);
		rankPipeline.push(
			{ $match: { $expr: { $gt: ['$__rankScore', me.__rankScore] } } },
			{ $count: 'count' }
		);
		const rankRows = await collection.aggregate(rankPipeline).toArray();
		me.rank = Number(rankRows[0]?.count || 0) + 1;
	}
	const title = `Top ${count} ${globalRank ? 'Global Weapon Takedown Rankings' : 'Weapon Takedown Rankings for ' + msg.channel.guild.name}`;
	await displayRanking(top, me, title, (q, r) => {
		const weaponName = WeaponInterface.weapons[`${q.wid}`].getName;
		const uwid = weaponUtil.shortenUWID(q.uwid);
		const wear = q.wear > 1 ? WeaponInterface.getWear(q.wear).name + ' ' : '';
		const value = `[${global.toFancyNum(q.kills)}][${uwid}] ${q.avg}% ${wear}${weaponName}`;
		return `${r === 0 ? '>\t\t' : '\n\t\t'}${value}${r === 0 ? '\n\n' : '\n'}`;
	}, p);
}

async function getLevelRanking(globalRank, p, count) {
	let data, userRank, userLevel, text;
	if (globalRank) {
		data = await levels.getGlobalRanking(count);
		userRank = await levels.getUserRank(p.msg.author.id);
		userLevel = await levels.getUserLevel(p.msg.author.id);
		text = `\`\`\`md\n< Top ${count} Global Level Rankings >\n> Your Rank: ${p.global.toFancyNum(userRank)}\n>\t\tLvl ${userLevel.level} ${userLevel.currentxp}xp\n\n`;
	} else {
		data = await levels.getServerRanking(p.msg.channel.guild.id, count);
		userRank = await levels.getUserServerRank(p.msg.author.id, p.msg.channel.guild.id);
		userLevel = await levels.getUserServerLevel(p.msg.author.id, p.msg.channel.guild.id);
		text = `\`\`\`md\n< Top ${count} Level Rankings for ${p.msg.channel.guild.name} >\n> Your Rank: ${p.global.toFancyNum(userRank)}\n>\t\tLvl ${userLevel.level} ${userLevel.currentxp}xp\n\n`;
	}
	let counter = 0;
	for (let i in data) {
		if (i % 2) {
			const tempLevel = await levels.getLevel(data[i]);
			text += `\t\tLvl ${tempLevel.level} ${tempLevel.currentxp}xp\n`;
		} else {
			counter++;
			let user = await p.fetch.getUser(data[i]);
			user = user ? p.getUniqueName(user) : 'User Left Discord';
			text += `#${counter}\t${user}\n`;
		}
	}
	const date = new Date();
	text += `\n${date.toLocaleString('en-US', {
		month: '2-digit', day: '2-digit', year: 'numeric', hour12: false, hour: '2-digit', minute: '2-digit',
	})}\`\`\``;
	p.send(text, null, null, { split: { prepend: '```md\n', append: '```' } });
}
