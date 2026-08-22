/*
 * OwO Bot for Discord
 * Copyright (C) 2021 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');
const alterDaily = require('../patreon/alterDaily.js');
const patreonUtil = require('../patreon/utils/patreonUtil.js');
const levels = require('../../../utils/levels.js');
const mongoNumeric = require('../../../utils/mongoNumeric.js');
const rings = require('../../../data/rings.json');

const moneyEmoji = '💰';
const surveyEmoji = '📝';
const valEmoji = '💌';
const legacyClaimDate = new Date('2017-01-01T00:00:00.000Z');

module.exports = new CommandInterface({
	alias: ['daily'],

	args: '',

	desc: 'Grab your daily cowoncy every day after 12am PST! Daily streaks will give you extra cowoncy!',

	example: [],

	related: ['owo money'],

	permissions: ['sendMessages', 'embedLinks', 'attachFiles'],

	group: ['economy'],

	cooldown: 5000,
	half: 100,
	six: 500,
	bot: true,

	execute: async function (p) {
		const id = String(p.msg.author.id);
		const uid = await p.global.getUid(id);
		const supporter = await patreonUtil.getSupporterRank(p, p.msg.author);
		const isValentines = p.event.isValentines();
		const boxType = Math.random() < 0.5 ? 'lootbox' : 'crate';
		const marriagePlan = {
			baseType: Math.random() < 0.5 ? 'lootbox' : 'crate',
			valentineType: Math.random() < 0.5 ? 'lootbox' : 'crate',
		};

		const claim = await claimDaily(p, id, uid, supporter, boxType);
		if (claim.error) {
			p.errorMsg(', there was an error claiming your daily. Please try again later.', 3000);
			return;
		}

		const marriageReward = await settleMarriage(p, uid, isValentines, marriagePlan);

		if (!claim.claimed) {
			if (marriageReward) {
				await p.send(marriageReward.text.replace(/^\n/, ''));
				return;
			}
			await sendCooldown(p, claim.cowoncy, claim.afterMid, claim.marriage);
			return;
		}

		const { gain, extra, streak } = claim.rewards;
		let text = `${moneyEmoji} **| ${p.getName()}**, Here is your daily **<:cowoncy:416043450337853441> ${gain} Cowoncy**!`;
		const alterInfo = {
			user: p.msg.author,
			amount: gain,
			streak: 0,
		};

		if (streak - 1 > 0) {
			text += `\n${p.config.emoji.blank} **|** You're on a **${streak - 1} daily streak**!`;
			alterInfo.streak = streak - 1;
		}
		if (extra > 0) {
			text += `\n${p.config.emoji.blank} **|** You got an extra **${extra} Cowoncy** for being a <:patreon:449705754522419222> Patreon!`;
			alterInfo.amount += extra;
		}

		if (boxType === 'lootbox') {
			text += `\n**${p.config.emoji.lootbox} |** You received a **lootbox**!`;
			alterInfo.box_emoji = p.config.emoji.lootbox;
			alterInfo.box_name = 'lootbox';
		} else {
			text += `\n**${p.config.emoji.crate} |** You received a **weapon crate**!`;
			alterInfo.box_emoji = p.config.emoji.crate;
			alterInfo.box_name = 'weapon crate';
		}

		if (marriageReward) {
			text += marriageReward.text;
			alterInfo.marriage = true;
			Object.assign(alterInfo, marriageReward.alterInfo);
		}

		let components;
		if (claim.showSurvey) {
			const surveyText = `${surveyEmoji} **|** You have a survey available! Answer some questions for some cool rewards!`;
			text += '\n' + surveyText;
			alterInfo.surveyText = surveyText;
			components = surveyComponents();
		}

		const time = formatCooldown(claim.afterMid);
		alterInfo.cooldown = time;
		text += `\n**⏱️ |** Your next daily is in: ${time}`;
		if (claim.showAnnouncement) alterInfo.announcement = true;

		const embed = announcementEmbed(p, claim.announcement);
		let alterText = await alterDaily.alter(p, alterInfo);
		if (alterText) {
			if (typeof alterText === 'string') alterText = { content: alterText };
			if (components) alterText.components = components;
			await p.send(alterText);
			if (claim.showAnnouncement && embed) await p.send({ embed });
		} else {
			await p.send({ content: text, embed, components });
		}

		p.logger.incr('cowoncy', gain + extra, { type: 'daily' }, p.msg);
		await levels.giveUserXP(id, 100);
	},
});

async function claimDaily(p, id, uid, supporter, boxType) {
	const cowoncyCollection = await p.mongo.collection('cowoncy');
	const lootbox = await p.mongo.collection('lootbox');
	const crate = await p.mongo.collection('crate');
	const announcements = await p.mongo.collection('announcement');
	const userAnnouncements = await p.mongo.collection('user_announcement');
	const surveys = await p.mongo.collection('survey');
	const userSurveys = await p.mongo.collection('user_survey');
	const session = await p.mongo.startSession();
	let outcome;

	try {
		await session.withTransaction(async () => {
			outcome = undefined;
			const cowoncy = await cowoncyCollection.findOne({ id }, { session });
			const afterMid = p.dateUtil.afterMidnight(cowoncy?.daily);
			const marriage = await getMarriageInfo(p, uid, session);

			if (!afterMid.after) {
				outcome = { claimed: false, cowoncy, afterMid, marriage };
				return;
			}

			const rewards = getRewards(cowoncy, afterMid, supporter);
			await mongoNumeric.add(
				cowoncyCollection,
				{ id },
				'money',
				rewards.gain + rewards.extra,
				{ upsert: true, session },
				{
					id,
					daily_streak: rewards.streak,
					daily: afterMid.now,
				}
			);

			await grantBox(lootbox, crate, id, uid, boxType, 1, session);

			const announcement = await announcements.findOne({}, { sort: { aid: -1 }, session });
			let showAnnouncement = false;
			if (announcement) {
				const state = await userAnnouncements.findOne({ uid }, { session });
				showAnnouncement = !state?.disabled && state?.aid !== announcement.aid;
				if (showAnnouncement) {
					await userAnnouncements.updateOne(
						{ uid },
						{ $set: { uid, aid: announcement.aid } },
						{ upsert: true, session }
					);
				}
			}

			const survey = await surveys.findOne(
				{ endDate: { $gt: new Date() } },
				{ sort: { sid: -1 }, session }
			);
			let showSurvey = false;
			if (survey) {
				const state = await userSurveys.findOne({ uid }, { session });
				showSurvey = !state?.in_progress && !(state?.sid === survey.sid && state?.is_done);
				if (showSurvey) {
					await userSurveys.updateOne(
						{ uid },
						{
							$set: {
								uid,
								sid: survey.sid,
								question_number: 1,
								in_progress: 0,
								is_done: 0,
							},
						},
						{ upsert: true, session }
					);
				}
			}

			outcome = {
				claimed: true,
				cowoncy,
				afterMid: p.dateUtil.afterMidnight(afterMid.now),
				rewards,
				showAnnouncement,
				announcement: showAnnouncement ? announcement : null,
				showSurvey,
				marriage,
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

function getRewards(cowoncy, afterMid, supporter) {
	let streak = Number(cowoncy?.daily_streak || 0);
	if (afterMid?.withinDay) streak++;
	else streak = 1;

	let gain = 500 + Math.floor(Math.random() * 200);
	gain += streak * 25;
	if (gain > 5000) gain = 5000;

	const extra = supporter?.benefitRank >= 3 ? gain : 0;
	return { gain, extra, streak };
}

async function settleMarriage(p, uid, isValentines, plan) {
	const marriages = await p.mongo.collection('marriage');
	const cowoncy = await p.mongo.collection('cowoncy');
	const lootbox = await p.mongo.collection('lootbox');
	const crate = await p.mongo.collection('crate');
	const session = await p.mongo.startSession();
	let reward;

	try {
		await session.withTransaction(async () => {
			reward = undefined;
			const marriage = await getMarriageInfo(p, uid, session);
			if (!marriage?.daily1 || !marriage?.daily2) return;
			if (!p.dateUtil.afterMidnight(marriage.marriedDate).after) return;
			if (p.dateUtil.afterMidnight(marriage.daily1).after) return;
			if (p.dateUtil.afterMidnight(marriage.daily2).after) return;
			if (!p.dateUtil.afterMidnight(marriage.claimDate).after) return;

			const previousDailies = Number(marriage.dailies || 0);
			const changed = await marriages.updateOne(
				{ _id: marriage._id, dailies: marriage.dailies },
				{ $set: { claimDate: new Date() }, $inc: { dailies: 1 } },
				{ session }
			);
			if (!changed.modifiedCount) return;

			const totalGain = calculateMarriageBonus(marriage, isValentines);
			await mongoNumeric.add(cowoncy, { id: marriage.id1 }, 'money', totalGain, { session });
			await mongoNumeric.add(cowoncy, { id: marriage.id2 }, 'money', totalGain, { session });

			let count = 1;
			if (isValentines) {
				await grantPairBox(
					lootbox,
					crate,
					marriage,
					plan.valentineType,
					1,
					session
				);
				count++;
			}
			await grantPairBox(lootbox, crate, marriage, plan.baseType, count, session);

			reward = {
				...marriage,
				totalGain,
				previousDailies,
				count,
				baseType: plan.baseType,
				valentineType: isValentines ? plan.valentineType : null,
			};
		});
	} catch (err) {
		console.error(err);
		return;
	} finally {
		await session.endSession();
	}

	if (!reward) return;
	return buildMarriageReward(p, uid, reward);
}

async function getMarriageInfo(p, uid, session) {
	const marriages = await p.mongo.collection('marriage');
	const users = await p.mongo.collection('user');
	const cowoncy = await p.mongo.collection('cowoncy');
	const options = session ? { session } : {};
	const marriage = await marriages.findOne(
		{ $or: [{ uid1: uid }, { uid2: uid }] },
		options
	);
	if (!marriage) return;

	const userRows = await users
		.find({ uid: { $in: [marriage.uid1, marriage.uid2] } }, options)
		.toArray();
	const ids = new Map(userRows.map((row) => [row.uid, String(row.id)]));
	const id1 = ids.get(marriage.uid1);
	const id2 = ids.get(marriage.uid2);
	if (!id1 || !id2) return { ...marriage };

	const moneyRows = await cowoncy.find({ id: { $in: [id1, id2] } }, options).toArray();
	const money = new Map(moneyRows.map((row) => [String(row.id), row]));
	return {
		...marriage,
		id1,
		id2,
		daily1: money.get(id1)?.daily,
		daily2: money.get(id2)?.daily,
		streak1: Number(money.get(id1)?.daily_streak || 0),
		streak2: Number(money.get(id2)?.daily_streak || 0),
	};
}

function calculateMarriageBonus(marriage, isValentines) {
	const totalStreak = Number(marriage.streak1 || 0) + Number(marriage.streak2 || 0);
	let totalGain = Math.round(100 + Math.floor(Math.random() * 100) + totalStreak * 12.5);
	if (totalGain > 1000) totalGain = 1000;
	if (isValentines) totalGain *= 2;
	return totalGain;
}

async function grantBox(lootbox, crate, id, uid, type, count, session) {
	if (type === 'lootbox') {
		await lootbox.updateOne(
			{ id },
			{
				$inc: { boxcount: count },
				$setOnInsert: { id, claimcount: 0, claim: legacyClaimDate, fbox: 0 },
			},
			{ upsert: true, session }
		);
		return;
	}

	await crate.updateOne(
		{ uid, cratetype: 0 },
		{
			$inc: { boxcount: count },
			$setOnInsert: { uid, cratetype: 0, claimcount: 0, claim: legacyClaimDate },
		},
		{ upsert: true, session }
	);
}

async function grantPairBox(lootbox, crate, marriage, type, count, session) {
	if (type === 'lootbox') {
		await grantBox(lootbox, crate, marriage.id1, marriage.uid1, type, count, session);
		await grantBox(lootbox, crate, marriage.id2, marriage.uid2, type, count, session);
		return;
	}
	await grantBox(lootbox, crate, marriage.id1, marriage.uid1, type, count, session);
	await grantBox(lootbox, crate, marriage.id2, marriage.uid2, type, count, session);
}

async function buildMarriageReward(p, uid, reward) {
	const partnerId = uid === reward.uid1 ? reward.id2 : reward.id1;
	let partner = await p.fetch.getUser(partnerId);
	if (!partner) partner = { id: partnerId, username: 'your partner' };
	const ring = rings[reward.rid] || { emoji: '💍', name: 'ring' };
	const baseEmoji = reward.baseType === 'lootbox' ? p.config.emoji.lootbox : p.config.emoji.crate;
	const baseName = reward.baseType === 'lootbox' ? 'lootbox' : 'weapon crate';

	let text = '';
	if (reward.valentineType) {
		const valEmojiValue =
			reward.valentineType === 'lootbox' ? p.config.emoji.lootbox : p.config.emoji.crate;
		const valName = reward.valentineType === 'lootbox' ? 'Lootbox' : 'Weapon Crate';
		text += `\n${valEmoji} **|** Happy Valentines! You got a ${valEmojiValue} **${valName}** for being so cute together! <3`;
	}
	text += `\n${ring.emoji}** |** You and ${partner.username} received ${
		p.config.emoji.cowoncy
	} **${reward.totalGain} Cowoncy** and `;
	if (reward.count > 1) {
		text += `${baseEmoji} **${reward.count} ${baseName === 'lootbox' ? 'lootboxes' : 'weapon crates'}**!`;
	} else {
		text += `a ${baseEmoji} **${baseName}**!`;
	}

	return {
		text,
		alterInfo: {
			partner,
			ring_emoji: ring.emoji,
			ring_name: ring.name,
			marriage_amount: reward.totalGain,
			marriage_streak: reward.previousDailies,
			marriage_box_emoji: baseEmoji,
			marriage_box_name: baseName,
		},
	};
}

async function sendCooldown(p, cowoncy, afterMid, marriage) {
	const time = formatCooldown(afterMid);
	const text = `**⏱ |** Nu! **${p.getName()}**! You need to wait **${time}**`;
	const alterText = await alterDaily.alter(p, {
		cooldown: time,
		isCooldown: true,
		user: p.msg.author,
		cowoncyInfo: cowoncy || { daily_streak: 0 },
		marriageInfo: marriage,
	});
	await p.send(alterText || text);
}

function formatCooldown(afterMid) {
	return `${afterMid.hours}H ${afterMid.minutes}M ${afterMid.seconds}S`;
}

function surveyComponents() {
	return [
		{
			type: 1,
			components: [
				{
					type: 2,
					label: 'Answer Survey',
					style: 1,
					custom_id: 'survey',
					emoji: { id: null, name: surveyEmoji },
				},
			],
		},
	];
}

function announcementEmbed(p, announcement) {
	if (!announcement?.url) return undefined;
	return {
		image: { url: announcement.url },
		color: p.config.embed_color,
		timestamp: new Date(announcement.adate),
	};
}
