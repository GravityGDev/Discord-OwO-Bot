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
	alias: ['my', 'me', 'guild'],
	args: 'points|guild|zoo|money|cookie|pet|huntbot|luck|curse|battle|daily|level|shard|weapon|w{wid} [global]',
	desc: 'Displays your ranking of each category!\nYou can choose you rank within the server or globally!\nYou can also shorten the command like in the example!',
	example: ['owo my zoo', 'owo my cowoncy global', 'owo my p g'],
	related: ['owo top'],
	permissions: ['sendMessages'],
	group: ['rankings'],
	cooldown: 60000,
	half: 20,
	six: 200,
	bot: true,
	execute: async function (p) {
		if (p.command == 'guild') await display(p, p.msg, ['guild']);
		else await display(p, p.msg, p.args);
	},
});

async function display(p, msg, args) {
	let globalRank = false;
	let type;
	let invalid = false;

	for (const raw of args) {
		const arg = raw.toLowerCase();
		if (!type) {
			if (['points', 'point', 'p'].includes(arg)) type = 'points';
			else if (['guild', 'server', 's', 'g'].includes(arg)) type = 'guild';
			else if (['zoo', 'z'].includes(arg)) type = 'zoo';
			else if (['cowoncy', 'money', 'c', 'm', 'cash'].includes(arg)) type = 'money';
			else if (['cookies', 'cookie', 'rep', 'r'].includes(arg)) type = 'rep';
			else if (['pets', 'pet'].includes(arg)) type = 'pet';
			else if (['huntbot', 'hb', 'autohunt', 'ah'].includes(arg)) type = 'huntbot';
			else if (['luck', 'pray'].includes(arg)) type = 'luck';
			else if (arg === 'curse') type = 'curse';
			else if (['battle', 'streak'].includes(arg)) type = 'battle';
			else if (['level', 'lvl', 'xp'].includes(arg)) type = 'level';
			else if (arg === 'daily') type = 'daily';
			else if (['shards', 'shard', 'ws', 'weaponshard'].includes(arg)) type = 'shard';
			else if (['tt', 'takedown', 'takdowntracker', 'tracker', 'weapon', 'w'].includes(arg) || weaponArgs.includes(arg)) type = arg;
			else if (['global'].includes(arg)) globalRank = true;
			else invalid = true;
		} else if (['global', 'g'].includes(arg)) globalRank = true;
		else invalid = true;
	}

	if (invalid) return p.errorMsg(', Invalid ranking type!', 3000);
	type = type || 'points';
	if (type === 'guild') return getGuildRanking(msg, p);
	if (type === 'level') return getLevelRanking(globalRank, p);
	if (weaponArgs.includes(type) || ['tt', 'takedown', 'takdowntracker', 'tracker', 'weapon', 'w'].includes(type)) {
		return getTTRanking(globalRank, msg, p, type);
	}
	if (type === 'battle') return getBattleRanking(globalRank, msg, p);
	if (type === 'shard') return getShardRanking(globalRank, msg, p);

	const configs = {
		points: {
			collection: 'user', scoreField: 'count', title: 'OwO Ranking',
			text: (q) => `\t\tsaid owo ${global.toFancyNum(q.count)} times!`,
		},
		zoo: {
			collection: 'animal_count', scoreField: 'total', title: 'Zoo Ranking',
			text: (q) => `\t\t${global.toFancyNum(q.total || 0)} zoo points: ${animalUtil2.zooScore(q)}`,
		},
		money: {
			collection: 'cowoncy', scoreField: 'money', title: 'Money Ranking',
			text: (q) => `\t\tCowoncy: ${global.toFancyNum(q.money)}`,
		},
		rep: {
			collection: 'rep', scoreField: 'count', title: 'Cookie Ranking',
			text: (q) => `\t\tCookies: ${global.toFancyNum(q.count)}`,
		},
		pet: {
			collection: 'animal', scoreField: 'xp', title: 'Pet Ranking', meSort: { xp: -1 },
			text: (q) => {
				let value = '\t\t';
				if (q.nickname) value += q.nickname + ' ';
				const lvl = animalUtil.toLvl(q.xp);
				return value + `Lvl. ${lvl.lvl} ${lvl.currentXp}xp`;
			},
		},
		huntbot: {
			collection: 'autohunt', scoreField: 'total', title: 'HuntBot Ranking',
			text: (q) => `\t\tEssence: ${global.toFancyNum(q.total)}`,
		},
		luck: {
			collection: 'luck', scoreField: 'lcount', title: 'Luck Ranking',
			text: (q) => `\t\tLuck: ${global.toFancyNum(q.lcount)}`,
		},
		curse: {
			collection: 'luck', scoreField: 'lcount', title: 'Curse Ranking', higherBetter: false,
			text: (q) => `\t\tLuck: ${global.toFancyNum(q.lcount)}`,
		},
		daily: {
			collection: 'cowoncy', scoreField: 'daily_streak', title: 'Daily Streak Ranking',
			text: (q) => `\t\tStreak: ${global.toFancyNum(q.daily_streak || 0)}`,
		},
	};
	return getDirectRanking(globalRank, msg, p, configs[type]);
}

async function getDirectRanking(globalRank, msg, p, config) {
	const memberIds = globalRank ? undefined : ranking.memberIds(msg);
	const rows = await ranking.aroundDirect({
		collection: config.collection,
		scoreField: config.scoreField,
		authorId: p.msg.author.id,
		memberIds,
		higherBetter: config.higherBetter !== false,
		meSort: config.meSort,
	});
	await displayRanking(rows, `${globalRank ? 'Global ' : ''}${config.title}`, config.text, p);
}

async function displayRanking(rows, title, subText, p) {
	const { above, below, me } = rows;
	if (!me) {
		p.send("You're at the very bottom c:");
		return;
	}
	const userRank = parseInt(me.rank);
	let rank = userRank - above.length;
	let body = '';

	for (const ele of [...above].reverse()) {
		const id = String(ele.id);
		if (id !== '' && id !== null && !isNaN(id)) {
			const user = await p.fetch.getUser(id, true);
			let name = user?.username ? p.getUniqueName(user) : 'User Left Discord';
			name = name.replace('discord.gg', 'discord,gg').replace(/(```)/g, '`\u200b``');
			body += `#${p.global.toFancyNum(rank)}\t${name}\n${subText(ele)}\n`;
			rank++;
		} else if (rank == 0) rank = 1;
	}

	let uname;
	const current = await p.fetch.getUser(me.id, true);
	uname = current ? p.getUniqueName(current) : 'you';
	uname = uname.replace('discord.gg', 'discord,gg').replace(/(```)/g, '`\u200b``');
	body += `< ${p.global.toFancyNum(rank)}   ${uname} >\n${subText(me)}\n`;
	rank++;

	for (const ele of below) {
		const id = String(ele.id);
		if (id !== '' && id !== null && !isNaN(id)) {
			const user = await p.fetch.getUser(id, true);
			let name = user?.username ? p.getUniqueName(user) : 'User Left Discord';
			name = name.replace('discord.gg', 'discord,gg');
			body += `#${p.global.toFancyNum(rank)}\t${name}\n${subText(ele)}\n`;
			rank++;
		}
	}

	let embed = `\`\`\`md\n< ${uname}'s ${title} >\n> Your rank is: ${p.global.toFancyNum(userRank)}\n>${subText(me)}\n\n${userRank > 3 ? '>...\n' : ''}${body}`;
	if (rank - userRank == 3) embed += '>...\n';
	const date = new Date();
	embed += `\n${date.toLocaleString('en-US', {
		month: '2-digit', day: '2-digit', year: 'numeric', hour12: false, hour: '2-digit', minute: '2-digit',
	})}\`\`\``;
	p.send(embed);
}

async function getGuildRanking(msg, p) {
	const rows = await ranking.aroundDirect({
		collection: 'guild', scoreField: 'count', authorId: msg.channel.guild.id,
	});
	if (!rows.me) return p.send("You haven't said 'owo' yet!");
	const { above, below, me } = rows;
	const guildRank = parseInt(me.rank);
	let rank = guildRank - above.length;
	let body = '';
	for (const ele of [...above].reverse()) {
		let guild = await p.fetch.getGuild(String(ele.id), true);
		let name = guild ? guild.name : 'Guild Left Bot';
		name = name.replace('discord.gg', 'discord,gg');
		body += `#${rank}\t${name}\n\t\tcollectively said owo ${global.toFancyNum(ele.count)} times!\n`;
		rank++;
	}
	let currentGuild = await p.fetch.getGuild(String(me.id), true);
	let uname = currentGuild ? currentGuild.name : 'Guild Left Bot';
	uname = uname.replace('discord.gg', 'discord,gg');
	body += `< ${rank}   ${uname} >\n\t\tcollectively said owo ${global.toFancyNum(me.count)} times!\n`;
	rank++;
	for (const ele of below) {
		let guild = await p.fetch.getGuild(String(ele.id), true);
		let name = guild ? guild.name : 'Guild Left Bot';
		name = name.replace('discord.gg', 'discord,gg');
		body += `#${rank}\t${name}\n\t\tcollectively said owo ${global.toFancyNum(ele.count)} times!\n`;
		rank++;
	}
	let embed = `\`\`\`md\n< ${uname}'s Global Ranking >\n> Your guild rank is: ${guildRank}\n>\t\tcollectively said owo ${global.toFancyNum(me.count)} times!\n\n${guildRank > 3 ? '>...\n' : ''}${body}`;
	if (rank - guildRank == 3) embed += '>...\n';
	const date = new Date();
	embed += `\n*owo counting has a 10s cooldown* | ${date.toLocaleString('en-US', {
		month: '2-digit', day: '2-digit', year: 'numeric', hour12: false, hour: '2-digit', minute: '2-digit',
	})}\`\`\``;
	p.send(embed, null, null, { split: { prepend: '```md\n', append: '```' } });
}

async function getBattleRanking(globalRank, msg, p) {
	const memberIds = globalRank ? undefined : ranking.memberIds(msg);
	const activePgid = await ranking.getActiveTeamPgid(p.msg.author.id);
	const rows = await ranking.aroundUidScores({
		collection: 'pet_team', scoreField: 'streak', authorId: p.msg.author.id, memberIds,
		meExtraMatch: activePgid ? { pgid: activePgid } : {},
	});
	return displayRanking(rows, `${globalRank ? 'Global ' : ''}Battle Streak Ranking`, (q) => `\t\t${q.tname ? q.tname + ' - ' : ''}Streak: ${global.toFancyNum(q.streak || 0)}`, p);
}

async function getShardRanking(globalRank, msg, p) {
	const memberIds = globalRank ? undefined : ranking.memberIds(msg);
	const rows = await ranking.aroundUidScores({
		collection: 'shards', scoreField: 'count', authorId: p.msg.author.id, memberIds,
	});
	return displayRanking(rows, `${globalRank ? 'Global ' : ''}Weapon Shard Ranking`, (q) => `\t\tShards: ${global.toFancyNum(q.count)}`, p);
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

async function getTTRanking(globalRank, msg, p, tt) {
	let wid;
	if (/^w\d{3}$/gi.test(tt)) wid = parseInt(tt.substring(1)) - 100;
	const memberIds = globalRank ? undefined : ranking.memberIds(msg);
	const collection = await p.mongo.collection('user_weapon_kills');
	const mePipeline = takedownPipeline(undefined, wid);
	mePipeline.push({ $match: { 'owner.id': String(p.msg.author.id) } }, { $sort: { __rankScore: -1 } }, { $limit: 1 });
	const meRows = await collection.aggregate(mePipeline).toArray();
	const me = meRows[0];
	if (!me) return displayRanking({ above: [], below: [], me: null }, '', () => '', p);

	const target = me.__rankScore;
	const abovePipeline = takedownPipeline(memberIds, wid);
	abovePipeline.push({ $match: { $expr: { $gt: ['$__rankScore', target] } } }, { $sort: { __rankScore: 1 } }, { $limit: 2 });
	const belowPipeline = takedownPipeline(memberIds, wid);
	belowPipeline.push({ $match: { $expr: { $lt: ['$__rankScore', target] } } }, { $sort: { __rankScore: -1 } }, { $limit: 2 });
	const rankPipeline = takedownPipeline(memberIds, wid);
	rankPipeline.push({ $match: { $expr: { $gt: ['$__rankScore', target] } } }, { $count: 'count' });
	const above = await collection.aggregate(abovePipeline).toArray();
	const below = await collection.aggregate(belowPipeline).toArray();
	const rankRows = await collection.aggregate(rankPipeline).toArray();
	me.rank = Number(rankRows[0]?.count || 0) + 1;
	return displayRanking({ above, below, me }, `${globalRank ? 'Global ' : ''}Weapon Takedown Ranking`, (q) => {
		const weaponName = WeaponInterface.weapons[`${q.wid}`].getName;
		const uwid = weaponUtil.shortenUWID(q.uwid);
		const wear = q.wear > 1 ? WeaponInterface.getWear(q.wear).name + ' ' : '';
		return `\t\t[${global.toFancyNum(q.kills)}][${uwid}] ${q.avg}% ${wear}${weaponName}`;
	}, p);
}

async function getLevelRanking(globalRank, p) {
	let userRank, userLevel, data, text;
	if (globalRank) {
		userRank = await levels.getUserRank(p.msg.author.id);
		userLevel = await levels.getUserLevel(p.msg.author.id);
		data = await levels.getNearbyXP(userRank);
		text = `\`\`\`md\n< ${p.getUniqueName()}'s Global Level Ranking >\n> Your Rank: ${p.global.toFancyNum(userRank)}\n>\t\tLvl ${userLevel.level} ${userLevel.currentxp}xp\n\n`;
	} else {
		userRank = await levels.getUserServerRank(p.msg.author.id, p.msg.channel.guild.id);
		userLevel = await levels.getUserServerLevel(p.msg.author.id, p.msg.channel.guild.id);
		data = await levels.getNearbyServerXP(userRank, p.msg.channel.guild.id);
		text = `\`\`\`md\n< ${p.getUniqueName()}'s Level Ranking for ${p.msg.channel.guild.name} >\n> Your Rank: ${p.global.toFancyNum(userRank)}\n>\t\tLvl ${userLevel.level} ${userLevel.currentxp}xp\n\n`;
	}
	let counter = userRank - 2;
	if (counter <= 1) counter = 1;
	else text += '>...\n';
	for (let i in data) {
		if (i % 2) {
			const tempLevel = await levels.getLevel(data[i]);
			text += `\t\tLvl ${tempLevel.level} ${tempLevel.currentxp}xp\n`;
		} else {
			if (data[i] == p.msg.author.id) text += `< ${counter}\t${p.getUniqueName()} >\n`;
			else {
				let user = await p.fetch.getUser(data[i]);
				user = user ? p.getUniqueName(user) : 'User Left Discord';
				text += `#${counter}\t${user}\n`;
			}
			counter++;
		}
	}
	const date = new Date();
	text += `>...\n\n${date.toLocaleString('en-US', {
		month: '2-digit', day: '2-digit', year: 'numeric', hour12: false, hour: '2-digit', minute: '2-digit',
	})}\`\`\``;
	p.send(text, null, null, { split: { prepend: '```md\n', append: '```' } });
}
