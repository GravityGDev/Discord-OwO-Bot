/*
 * OwO Bot for Discord
 * Copyright (C) 2021 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');

const alterUpgrade = require('../patreon/alterUpgrade.js');
const autohuntUtil = require('./autohuntutil.js');
const essence = '<a:essence:451638978299428875>';
const traits = {};
const efficiency = ['efficiency', 'timer', 'cd', 'cooldown'];
for (const key of efficiency) traits[key] = 'efficiency';
const cost = ['cost', 'price', 'cowoncy'];
for (const key of cost) traits[key] = 'cost';
const duration = ['duration', 'totaltime', 'time'];
for (const key of duration) traits[key] = 'duration';
const gain = ['gain', 'essence', 'ess'];
for (const key of gain) traits[key] = 'gain';
const exp = ['exp', 'experience', 'pet', 'xp'];
for (const key of exp) traits[key] = 'exp';
const radar = ['radar'];
for (const key of radar) traits[key] = 'radar';

module.exports = new CommandInterface({
	alias: ['upgrade', 'upg'],

	args: '{trait} {count}',

	desc: 'Use animal essence to upgrade autohunt!\nYou can specify an amount, upgrade to the next level, or use all your essence.',

	example: ['owo upgrade efficiency 200', 'owo upgrade cost level', 'owo upgrade duration all'],

	related: ['owo autohunt', 'owo sacrifice'],

	permissions: ['sendMessages'],

	group: ['animals'],

	cooldown: 1000,
	half: 120,
	six: 500,
	bot: true,

	execute: async function (p) {
		const args = p.args;
		let count;
		let trait;
		let all = false;
		let lvl = false;

		if (p.global.isInt(args[0])) {
			if (args[1]) trait = traits[args[1].toLowerCase()];
			count = parseInt(args[0]);
		} else if (p.global.isInt(args[1])) {
			if (args[0]) trait = traits[args[0].toLowerCase()];
			count = parseInt(args[1]);
		} else if (args[1] && args[1].toLowerCase() == 'all') {
			if (args[0]) trait = traits[args[0].toLowerCase()];
			all = true;
		} else if (['lvl', 'level'].includes(args[1]?.toLowerCase())) {
			if (args[0]) trait = traits[args[0].toLowerCase()];
			lvl = true;
		} else {
			p.errorMsg(', Please include how many animal essence to use!', 3000);
			return;
		}

		if (!trait) {
			p.errorMsg(
				', I could not find that autohunt trait!\n**<:blank:427371936482328596> |** You can choose from: `efficiency`, `duration`, `cost`, `gain`,`exp`, or `radar`'
			);
			return;
		}
		if (!(all || lvl) && (!count || count <= 0)) {
			p.errorMsg(', You need to use more than 1 animal essence silly~', 3000);
			return;
		}

		const result = await applyUpgrade(p, trait, { count, all, lvl });
		if (result.error) {
			if (result.reason === 'max') {
				p.errorMsg(', this trait is already maxed out!', 3000);
			} else if (result.reason === 'essence') {
				p.errorMsg(', You do not have enough animal essence!', 3000);
			} else {
				p.errorMsg(', there was an error upgrading! Please try again later.', 3000);
			}
			return;
		}

		const stat = autohuntUtil.getLvl(result.previousTrait, result.used, trait);
		let text = `**🛠 | ${p.getName()}**, You successfully upgraded \`${trait}\` with  **${p.global.toFancyNum(
			result.used
		)} Animal Essence** ${essence}!`;
		text += `\n**<:blank:427371936482328596> |** \`${trait}: ${stat.stat + stat.prefix} -  Lvl ${
			stat.lvl
		} ${stat.max ? '[MAX]' : `[${stat.currentxp}/${stat.maxxp}]`}\``;
		if (stat.max) {
			text += '\n**<:blank:427371936482328596> |** HuntBot is at max level!';
		} else if (stat.lvlup) {
			text += '\n**<:blank:427371936482328596> |** HuntBot Leveled Up!! 🎉';
		}
		text = alterUpgrade.alter(p.msg.author.id, text);
		p.send(text);
	},
});

async function applyUpgrade(p, trait, request) {
	const collection = await p.mongo.collection('autohunt');
	const session = await p.mongo.startSession();
	let outcome = { error: true };

	try {
		await session.withTransaction(async () => {
			outcome = { error: true };
			const row = await collection.findOne({ id: String(p.msg.author.id) }, { session });
			if (!row) {
				outcome = { error: true, reason: 'essence' };
				return;
			}

			const previousTrait = Number(row[trait] || 0);
			const available = Number(row.essence || 0);
			const currentStat = autohuntUtil.getLvl(previousTrait, 0, trait);
			if (currentStat.max) {
				outcome = { error: true, reason: 'max' };
				return;
			}

			let requested = request.count;
			if (request.lvl) requested = currentStat.maxxp - currentStat.currentxp;
			if (request.all) requested = available;
			if (!requested || requested <= 0 || available < requested) {
				outcome = { error: true, reason: 'essence' };
				return;
			}

			const prospective = autohuntUtil.getLvl(previousTrait, requested, trait);
			let used = requested;
			if (prospective.max && prospective.currentxp > 0) {
				used = Math.max(0, requested - prospective.currentxp);
			}
			if (!used) {
				outcome = { error: true, reason: 'max' };
				return;
			}

			const changed = await collection.updateOne(
				{ _id: row._id, essence: { $gte: used }, [trait]: row[trait] },
				{ $inc: { essence: -used, [trait]: used } },
				{ session }
			);
			if (!changed.modifiedCount) {
				outcome = { error: true, reason: 'essence' };
				return;
			}
			outcome = { error: false, used, previousTrait };
		});
	} catch (err) {
		console.error(err);
		return { error: true, reason: 'error' };
	} finally {
		await session.endSession();
	}
	return outcome;
}
