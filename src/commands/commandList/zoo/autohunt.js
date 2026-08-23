/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');

const alterhb = require('../patreon/alterHuntbot.js').alter;
const autohuntutil = require('./autohuntutil.js');
const animalUtil = require('./animalUtil.js');
const global = require('../../../utils/global.js');
const mongoNumeric = require('../../../utils/mongoNumeric.js');
const letters = 'abcdefghijklmnopqrstuvwxyz';
const logger = require('../../../utils/logger.js');
const parse = require('parse-duration');
const patreonUtil = require('../patreon/utils/patreonUtil.js');
const teamUtil = require('../battle/util/teamUtil.js');

module.exports = new CommandInterface({
	alias: ['autohunt', 'huntbot', 'hb', 'ah'],

	args: '{cowoncy}',

	desc: 'Use autohunt to hunt for animals automatically! Upgrade huntbot for more efficient hunts!',

	example: ['owo autohunt', 'owo autohunt 1000', 'owo autohunt 10h'],

	related: ['owo sacrifice', 'owo upgrade'],

	permissions: ['sendMessages', 'embedLinks'],

	group: ['animals'],

	cooldown: 1000,
	half: 100,
	six: 500,

	execute: async function (p) {
		if (p.args.length == 0) await display(p, p.msg);
		else await autohunt(p, p.msg, p.args, p.global, p.send);
	},
});

function minutesSince(date) {
	if (!date) return Number.POSITIVE_INFINITY;
	return Math.floor((Date.now() - new Date(date).getTime()) / 60000);
}

async function getBotRank(p, row) {
	if (!row) return autohuntutil.getTotalBots();
	const collection = await p.mongo.collection('autohunt');
	return collection.countDocuments({ total: { $gte: Number(row.total || 0) } });
}

async function claim(p, msg, query, bot) {
	const timer = minutesSince(query.start);
	if (timer < Number(query.huntmin || 0)) {
		const time = Number(query.huntmin || 0) - timer;
		const min = time % 60;
		const hour = Math.trunc(time / 60);
		const percent = generatePercent(timer, query.huntmin, 25);
		return {
			time: (hour > 0 ? hour + 'H ' : '') + min + 'M',
			bar: percent.bar,
			percent: percent.percent,
			count: Math.trunc(query.huntcount * (timer / query.huntmin)),
		};
	}

	const duration = Number(query.huntmin || 0) / 60;
	const totalGain = Math.floor(autohuntutil.getLvl(query.gain || 0, 0, 'gain').stat * duration);
	const totalExp = Math.floor(autohuntutil.getLvl(query.exp || 0, 0, 'exp').stat * duration);
	const radar = autohuntutil.getLvl(query.radar || 0, 0, 'radar');
	const supporter = await patreonUtil.getSupporterRank(p, p.msg.author);
	const generated = await animalUtil.getMultipleAnimalsMongo(query.huntcount, p.msg.author, {
		patreon: supporter.benefitRank > 0,
		huntbot: radar.stat,
	});

	const collection = await p.mongo.collection('autohunt');
	const session = await p.mongo.startSession();
	let claimed = false;
	try {
		await session.withTransaction(async () => {
			claimed = false;
			const changed = await collection.updateOne(
				{
					_id: query._id,
					huntmin: query.huntmin,
					huntcount: query.huntcount,
					start: query.start,
				},
				{
					$set: { huntmin: 0, huntcount: 0 },
					$inc: { essence: totalGain, total: totalGain },
				},
				{ session }
			);
			if (!changed.modifiedCount) return;
			await animalUtil.applyAnimalBatch(msg.author.id, generated.ordered, generated.typeCount, {
				session,
			});
			claimed = true;
		});
	} catch (err) {
		console.error(err);
		return;
	} finally {
		await session.endSession();
	}
	if (!claimed) return;

	await teamUtil.giveXPToUserTeams(p, p.msg.author, totalExp);

	let biggest = 0;
	for (const key in generated.animals) {
		if (generated.animals[key].count > biggest) biggest = generated.animals[key].count;
	}
	const digits = Math.trunc(Math.log10(biggest || 1) + 1);
	let text =
		`**${bot} |** \`BEEP BOOP. I AM BACK WITH ${query.huntcount} ANIMALS,\`` +
		`\n**<:blank:427371936482328596> |** \`${totalGain} ESSENCE, AND ${totalExp} EXPERIENCE\``;
	const tempText = [];
	for (const animal in generated.animals) {
		const info = generated.animals[animal];
		const animalString = animal + p.global.toSmallNum(info.count, digits) + '  ';
		const order = p.animalUtil.getOrder();
		const animalLoc = order.indexOf(info.rank);
		if (animalLoc || animalLoc === 0) {
			if (!tempText[animalLoc]) {
				tempText[animalLoc] = ' \n' + p.animalUtil.getRank(order[animalLoc]).emoji + ' **|**';
			}
			tempText[animalLoc] += ' ' + animalString;
		}
	}
	for (const row of tempText) if (row) text += row;

	text = alterhb(msg.author.id, text, 'returned');
	p.send(text);
	for (const animal in generated.animals) {
		const tempAnimal = global.validAnimal(animal);
		logger.incr(
			'animal',
			generated.animals[animal].count,
			{ rank: tempAnimal.rank, name: tempAnimal.name },
			p.msg
		);
		logger.incr('zoo', tempAnimal.points * generated.animals[animal].count, {}, p.msg);
	}
	logger.incr('essence', totalGain, { type: 'huntbot' }, p.msg);
}

async function autohunt(p, msg, args, globalUtil, send) {
	let cowoncy;
	let password;
	let length;
	if (globalUtil.isInt(args[0]) || parse(args[0], 'h')) {
		cowoncy = parseInt(args[0]);
		password = args[1];
		length = parse(args[0], 'h');
	} else if (globalUtil.isInt(args[1]) || parse(args[1], 'h')) {
		cowoncy = parseInt(args[1]);
		password = args[0];
		length = parse(args[1], 'h');
	}
	if (password) password = password.toLowerCase();

	if (!cowoncy && !length) {
		send('**🚫 | ' + p.getName() + '**, Wrong syntax!', 3000);
		return;
	}
	if (cowoncy <= 0 && !length) {
		send('**🚫 | ' + p.getName() + '**, Invalid cowoncy amount!', 3000);
		return;
	}
	if (length != null && length <= 0) {
		send('**🚫 | ' + p.getName() + '**, Invalid duration!', 3000);
		return;
	}

	const collection = await p.mongo.collection('autohunt');
	let row = await collection.findOne({ id: String(msg.author.id) });
	let rank = await getBotRank(p, row);
	let bot = autohuntutil.getBot({ rank });

	if (row && Number(row.huntmin || 0) !== 0) {
		const hunting = await claim(p, msg, row, bot);
		if (hunting) {
			let text =
				`**${bot} |** \`BEEP BOOP. I AM STILL HUNTING. I WILL BE BACK IN ${hunting.time}\`` +
				`\n**<:blank:427371936482328596> |** \`${hunting.percent}% DONE | ${hunting.count} ANIMALS CAPTURED\`` +
				`\n**<:blank:427371936482328596> |** ${hunting.bar}`;
			text = alterhb(msg.author.id, text, 'progress');
			send(text);
		}
		return;
	}

	const defaults = getTraitStats(row);
	if (length) cowoncy = Math.floor(defaults.efficiency.stat * defaults.cost.stat * length);

	const cowoncyCollection = await p.mongo.collection('cowoncy');
	const moneyRow = await cowoncyCollection.findOne({ id: String(msg.author.id) });
	if (!moneyRow || mongoNumeric.toBigInt(moneyRow.money || 0) < BigInt(cowoncy)) {
		send('**🚫 | ' + p.getName() + "**, You don't have enough cowoncy!", 3000);
		return;
	}

	const pwtime = minutesSince(row?.passwordtime);
	if (!row || !row.password || pwtime >= 10) {
		let rand = '';
		for (let i = 0; i < 5; i++) rand += letters.charAt(Math.floor(Math.random() * letters.length));
		await collection.updateOne(
			{ id: String(msg.author.id) },
			{
				$set: { password: rand, passwordtime: new Date() },
				$setOnInsert: defaultHuntbot(msg.author.id),
			},
			{ upsert: true }
		);
		let text =
			`**${bot} | ${p.getName()}**, Here is your password!` +
			`\n**<:blank:427371936482328596> |** Use the command \`owo autohunt ${cowoncy} {password}\``;
		text = alterhb(msg.author.id, text, 'password');
		autohuntutil.captcha(p, rand, text);
		return;
	}

	if (row.password != password) {
		const remaining = Math.max(0, 10 - pwtime);
		if (!password) {
			send(
				`**🚫 | ${p.getName()}**, Please include your password! The command is \`owo autohunt ${cowoncy} {password}\`!` +
					`\n**<:blank:427371936482328596> |** Password will reset in ${remaining} minutes`
			);
		} else {
			send(
				`**🚫 | ${p.getName()}**, Wrong password! The command is \`owo autohunt ${cowoncy} {password}\`!` +
					`\n**<:blank:427371936482328596> |** Password will reset in ${remaining} minutes`
			);
		}
		return;
	}

	const stats = getTraitStats(row);
	const maxhunt = Math.floor(stats.duration.stat * stats.efficiency.stat);
	const maxgain = Math.floor(stats.gain.stat * stats.duration.stat);
	const maxexp = Math.floor(stats.exp.stat * stats.duration.stat);
	cowoncy -= cowoncy % stats.cost.stat;
	if (cowoncy > maxhunt * stats.cost.stat) cowoncy = maxhunt * stats.cost.stat;
	if (cowoncy <= 0) {
		send('**🚫 | ' + p.getName() + '**, Invalid cowoncy amount!', 3000);
		return;
	}

	const huntcount = Math.trunc(cowoncy / stats.cost.stat);
	const huntmin = Math.ceil((huntcount / stats.efficiency.stat) * 60);
	const tempPercent = huntmin / (stats.duration.stat * 60);
	const huntgain = Math.floor(tempPercent * maxgain);
	const huntexp = Math.floor(tempPercent * maxexp);
	const start = await startHunt(p, row, password, cowoncy, huntcount, huntmin);
	if (!start.ok) {
		if (start.reason === 'money') {
			send('**🚫 | ' + p.getName() + "**, You don't have enough cowoncy!", 3000);
		} else if (start.reason === 'active') {
			send('**🚫 | ' + p.getName() + '**, your HuntBot is already hunting!', 3000);
		} else {
			send('**🚫 | ' + p.getName() + '**, HuntBot state changed. Please try again!', 3000);
		}
		return;
	}

	logger.decr('cowoncy', -cowoncy, { type: 'huntbot' }, p.msg);
	const min = huntmin % 60;
	const hour = Math.trunc(huntmin / 60);
	const timer = hour > 0 ? hour + 'H' + min + 'M' : min + 'M';
	let text =
		`**${bot} |** \`BEEP BOOP. \`**\`${p.getName()}\`**\`, YOU SPENT ${globalUtil.toFancyNum(cowoncy)} cowoncy\`` +
		`\n**<:blank:427371936482328596> |** \`I WILL BE BACK IN ${timer} WITH ${huntcount} ANIMALS,\`` +
		`\n**<:blank:427371936482328596> |** \`${huntgain} ESSENCE, AND ${huntexp} EXPERIENCE\``;
	text = alterhb(msg.author.id, text, 'spent');
	send(text);
}

async function startHunt(p, row, password, cowoncy, huntcount, huntmin) {
	const bots = await p.mongo.collection('autohunt');
	const money = await p.mongo.collection('cowoncy');
	const session = await p.mongo.startSession();
	let outcome = { ok: false };
	try {
		await session.withTransaction(async () => {
			outcome = { ok: false };
			const current = await bots.findOne({ id: String(p.msg.author.id) }, { session });
			if (!current || current.password !== password) {
				outcome = { ok: false, reason: 'password' };
				return;
			}
			if (Number(current.huntmin || 0) !== 0) {
				outcome = { ok: false, reason: 'active' };
				return;
			}
			const debit = await mongoNumeric.subtractIfEnough(
				money,
				{ id: String(p.msg.author.id) },
				'money',
				cowoncy,
				{ session }
			);
			if (!debit.modifiedCount) {
				outcome = { ok: false, reason: 'money' };
				return;
			}
			const changed = await bots.updateOne(
				{ _id: current._id, huntmin: current.huntmin, password: current.password },
				{
					$set: {
						start: new Date(),
						huntcount,
						huntmin,
						password: '',
					},
				},
				{ session }
			);
			if (!changed.modifiedCount) throw new Error('HuntBot state changed while starting hunt');
			outcome = { ok: true };
		});
	} catch (err) {
		console.error(err);
		return { ok: false, reason: 'error' };
	} finally {
		await session.endSession();
	}
	return outcome;
}

async function display(p, msg) {
	const collection = await p.mongo.collection('autohunt');
	const row = await collection.findOne({ id: String(msg.author.id) });
	const rank = await getBotRank(p, row);
	const bot = autohuntutil.getBot({ rank });

	let hunting;
	if (row && Number(row.huntmin || 0) !== 0) {
		hunting = await claim(p, msg, row, bot);
		if (!hunting) return;
	}

	const stats = getTraitStats(row);
	const traits = [
		stats.duration,
		stats.efficiency,
		stats.cost,
		stats.gain,
		stats.exp,
		stats.radar,
	];
	for (const trait of traits) {
		trait.percent = generatePercent(trait.currentxp, trait.maxxp).bar;
		if (trait.max) trait.value = '`Lvl ' + trait.lvl + ' [MAX]`\n' + generatePercent(1, 1).bar;
		else trait.value = `\`Lvl ${trait.lvl} [${trait.currentxp}/${trait.maxxp}]\`\n${trait.percent}`;
	}

	const maxhunt = Math.floor(stats.duration.stat * stats.efficiency.stat);
	let embed = {
		color: p.config.embed_color,
		author: {
			name: p.getName() + "'s HuntBot",
			icon_url: msg.author.avatarURL,
		},
		thumbnail: { url: p.global.getEmojiURL(bot) },
		footer: {
			text: `Rank #${p.global.toFancyNum(rank)} • ${p.getUniqueName(msg.author)}`,
		},
		fields: [
			{
				name: '`BEEP. BOOP. I AM HUNTBOT. I WILL HUNT FOR YOU MASTER.`',
				value:
					'Use the command `owo autohunt {cowoncy}` to get started.\nYou can use `owo upgrade {trait} {count}` to upgrade the traits below.\nTo obtain more essence, use `owo sacrifice {animal} {count}`.\n\n',
				inline: false,
			},
			{
				name: `⏱ Efficiency - \`${stats.efficiency.stat + stats.efficiency.prefix}\``,
				value: stats.efficiency.value,
				inline: true,
			},
			{
				name: `⏳ Duration - \`${stats.duration.stat + stats.duration.prefix}\``,
				value: stats.duration.value,
				inline: true,
			},
			{
				name: `<:cowoncy:416043450337853441> Cost - \`${stats.cost.stat + stats.cost.prefix}\``,
				value: stats.cost.value,
				inline: true,
			},
			{
				name: `🔧 Gain - \`${stats.gain.stat + stats.gain.prefix}\``,
				value: stats.gain.value,
				inline: true,
			},
			{
				name: `⚔ Experience - \`${stats.exp.stat + stats.exp.prefix}\``,
				value: stats.exp.value,
				inline: true,
			},
			{
				name: `📡 Radar - \`${stats.radar.stat + stats.radar.prefix}\``,
				value: stats.radar.value,
				inline: true,
			},
			{
				name: `<a:essence:451638978299428875> Animal Essence - \`${global.toFancyNum(
					Number(row?.essence || 0)
				)}\``,
				value:
					`\`Current Max Autohunt: ${global.toFancyNum(maxhunt)} animals, ` +
					`${global.toFancyNum(Math.floor(stats.gain.stat * stats.duration.stat))} essence, and ` +
					`${global.toFancyNum(Math.floor(stats.exp.stat * stats.duration.stat))} xp for ` +
					`${global.toFancyNum(maxhunt * stats.cost.stat)} cowoncy\``,
				inline: false,
			},
		],
	};
	if (hunting) {
		embed.fields.push({
			name: bot + ' HUNTBOT is currently hunting!',
			value:
				`\`BEEP BOOP. I AM STILL HUNTING. I WILL BE BACK IN ${hunting.time}\`` +
				`\n\`${hunting.percent}% DONE | ${hunting.count} ANIMALS CAPTURED\`` +
				`\n${hunting.bar}`,
		});
	}
	embed = alterhb(msg.author.id, embed, 'hb');
	p.send({ embed });
}

function getTraitStats(row) {
	return {
		duration: autohuntutil.getLvl(Number(row?.duration || 0), 0, 'duration'),
		efficiency: autohuntutil.getLvl(Number(row?.efficiency || 0), 0, 'efficiency'),
		cost: autohuntutil.getLvl(Number(row?.cost || 0), 0, 'cost'),
		gain: autohuntutil.getLvl(Number(row?.gain || 0), 0, 'gain'),
		exp: autohuntutil.getLvl(Number(row?.exp || 0), 0, 'exp'),
		radar: autohuntutil.getLvl(Number(row?.radar || 0), 0, 'radar'),
	};
}

function defaultHuntbot(id) {
	return {
		id: String(id),
		start: new Date(0),
		huntcount: 0,
		huntmin: 0,
		essence: 0,
		total: 0,
		efficiency: 0,
		duration: 0,
		cost: 0,
		gain: 0,
		exp: 0,
		radar: 0,
	};
}

function generatePercent(current, max, length) {
	let percent = current / max;
	let result = '`[';
	if (!length) length = 16;
	for (let i = 0; i < length; i++) {
		if (i < percent * length) result += '■';
		else result += '□';
	}
	percent = Math.trunc(percent * 10000) / 100;
	result += ']`';
	return { bar: result, percent: percent };
}
