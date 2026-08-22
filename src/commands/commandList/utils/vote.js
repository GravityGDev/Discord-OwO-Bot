/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');
const patreonUtil = require('../patreon/utils/patreonUtil.js');
const mongoNumeric = require('../../../utils/mongoNumeric.js');

const legacyClaimDate = new Date('2017-01-01T00:00:00.000Z');
const voteComponent = [
	{
		type: 1,
		components: [
			{
				type: 2,
				label: 'Vote Now!',
				style: 5,
				url: 'https://top.gg/bot/408785106942164992/vote',
			},
		],
	},
];

module.exports = new CommandInterface({
	alias: ['vote'],

	args: '',

	desc: 'Vote on Discord Bot List to gain daily cowoncy!',

	example: [],

	related: ['owo daily', 'owo money'],

	permissions: ['sendMessages', 'embedLinks', 'attachFiles'],

	group: ['utility'],

	cooldown: 5000,
	half: 100,
	six: 500,

	execute: async function (p) {
		const id = String(p.msg.author.id);
		const voted = await p.dbl.hasVoted(id);
		if (!voted) {
			let text = `**${p.config.emoji.check} | Your daily vote is available!**\n`;
			text += '**<:blank:427371936482328596> |** You can vote every 12 hours!';
			await p.send({ content: text, components: voteComponent });
			return;
		}

		const weekend = await p.dbl.isWeekend();
		const supporter = await patreonUtil.getSupporterRank(p, p.msg.author);
		const uid = await p.global.getUid(id);
		const boxType = Math.random() < 0.5 ? 'lootbox' : 'crate';
		const outcome = await claimVote(p, id, uid, supporter, weekend, boxType);

		if (outcome.error) {
			p.errorMsg(', there was an error claiming your vote reward. Please try again later.', 3000);
			return;
		}
		if (!outcome.claimed) {
			let text = `**${p.config.emoji.check} |** Click the link to vote and gain 100+ cowoncy!\n`;
			text += '**<:blank:427371936482328596> |** You can vote every 12 hours!\n';
			text += `**<:blank:427371936482328596> |** Your daily vote is available in **${outcome.hoursLeft} H**\n`;
			await p.send({ content: text, components: voteComponent });
			return;
		}

		let text = `**${p.config.emoji.check} |** You have received **${outcome.baseReward}** cowoncy for voting!${patreonMsg(
			outcome.patreonBonus
		)}\n`;
		if (weekend) {
			text += `**${p.config.emoji.beach} |** It's the weekend! You also earned a bonus of **${outcome.weekendBonus}** cowoncy!\n`;
		}
		text +=
			boxType === 'lootbox'
				? '**<:box:427352600476647425> |** You received a lootbox!\n'
				: '**<:crate:523771259302182922> |** You received a weapon crate!\n';
		await p.send({ content: text, components: voteComponent });

		p.logger.incr('votecount', 1, {}, p.msg);
		p.logger.incr('cowoncy', outcome.totalReward, { type: 'vote' }, p.msg);
	},
});

async function claimVote(p, id, uid, supporter, weekend, boxType) {
	const votes = await p.mongo.collection('vote');
	const cowoncy = await p.mongo.collection('cowoncy');
	const lootbox = await p.mongo.collection('lootbox');
	const crate = await p.mongo.collection('crate');
	const session = await p.mongo.startSession();
	let outcome;

	try {
		await session.withTransaction(async () => {
			outcome = undefined;
			const row = await votes.findOne({ id }, { session });
			const now = new Date();
			if (row?.date) {
				const elapsed = now.getTime() - new Date(row.date).getTime();
				if (elapsed < 12 * 60 * 60 * 1000) {
					outcome = {
						claimed: false,
						hoursLeft: Math.max(1, Math.ceil((12 * 60 * 60 * 1000 - elapsed) / 3600000)),
					};
					return;
				}
			}

			const previousCount = Number(row?.count || 0);
			const baseReward = row ? 100 + previousCount * 3 : 100;
			const patreonBonus = supporter?.benefitRank >= 3 ? baseReward : 0;
			const weekendBonus = weekend ? baseReward : 0;
			const totalReward = baseReward + patreonBonus + weekendBonus;

			await votes.updateOne(
				{ id },
				{
					$set: { id, date: now },
					$inc: { count: 1 },
				},
				{ upsert: true, session }
			);
			await mongoNumeric.add(
				cowoncy,
				{ id },
				'money',
				totalReward,
				{ upsert: true, session },
				{ id }
			);
			await grantVoteBox(lootbox, crate, id, uid, boxType, session);

			outcome = {
				claimed: true,
				baseReward,
				patreonBonus,
				weekendBonus,
				totalReward,
			};
		});
	} catch (err) {
		console.error(err);
		return { error: true };
	} finally {
		await session.endSession();
	}
	return outcome || { error: true };
}

async function grantVoteBox(lootbox, crate, id, uid, type, session) {
	if (type === 'lootbox') {
		await lootbox.updateOne(
			{ id },
			{
				$inc: { boxcount: 1 },
				$setOnInsert: { id, claimcount: 0, claim: legacyClaimDate, fbox: 0 },
			},
			{ upsert: true, session }
		);
		return;
	}
	await crate.updateOne(
		{ uid, cratetype: 0 },
		{
			$inc: { boxcount: 1 },
			$setOnInsert: { uid, cratetype: 0, claimcount: 0, claim: legacyClaimDate },
		},
		{ upsert: true, session }
	);
}

function patreonMsg(amount) {
	if (!amount) return '';
	return `\n**<:blank:427371936482328596> |** And **${amount}** cowoncy for being a <:patreon:449705754522419222> Patreon!`;
}
