/*
 * OwO Bot for Discord
 * Copyright (C) 2021 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const teamUtil = require('../../battle/util/teamUtil.js');
const sku = '1164099862984400926';

async function insertDefaults(collection, rows, filterKeys) {
	if (!rows.length) return;
	await collection.bulkWrite(
		rows.map((row) => {
			const filter = {};
			for (const key of filterKeys) filter[key] = row[key];
			return {
				updateOne: {
					filter,
					update: { $setOnInsert: row },
					upsert: true,
				},
			};
		})
	);
}

exports.giveCustomBattle = async function (p, id) {
	const uid = await p.global.getUid(id);
	const collection = await p.mongo.collection('alterbattle');
	await insertDefaults(
		collection,
		[
			{
				uid,
				type: 'win',
				color: 65280,
				footer: 'You won in {turns} turns! Your team gained {xp} xp! Streak: {streak}',
				author: '{username} goes into battle',
			},
			{
				uid,
				type: 'lose',
				color: 16711680,
				footer:
					'You lost in {turns} turns! Your team gained {xp} xp! You lost your streak of {streak} wins...',
				author: '{username} goes into battle',
			},
			{
				uid,
				type: 'tie',
				color: 6381923,
				footer: "It's a tie in {turns} turns! Your team gained {xp} xp! Streak: {streak}",
				author: '{username} goes into battle',
			},
		],
		['uid', 'type']
	);
};

exports.giveCustomHunt = async function (p, id) {
	const uid = await p.global.getUid(id);
	const collection = await p.mongo.collection('alterhunt');
	await insertDefaults(
		collection,
		[
			{ uid, type: 'gems' },
			{ uid, type: 'nogems' },
		],
		['uid', 'type']
	);
};

async function giveAlterRows(p, id, rows) {
	const uid = await p.global.getUid(id);
	const collection = await p.mongo.collection('alter');
	await insertDefaults(
		collection,
		rows.map((row) => ({ uid, ...row })),
		['uid', 'command', 'type']
	);
}

exports.giveCustomCowoncy = async function (p, id) {
	await giveAlterRows(p, id, [{ command: 'cowoncy', type: 'display' }]);
};

exports.giveCustomGive = async function (p, id) {
	await giveAlterRows(p, id, [
		{ command: 'give', type: 'give' },
		{ command: 'give', type: 'none' },
		{ command: 'give', type: 'senderlimit' },
		{ command: 'give', type: 'senderoverlimit' },
		{ command: 'give', type: 'receivelimit' },
		{ command: 'give', type: 'receiveoverlimit' },
		{ command: 'give', type: 'receive' },
	]);
};

exports.giveCustomPray = async function (p, id) {
	await giveAlterRows(p, id, [
		{ command: 'pray', type: 'pray' },
		{ command: 'pray', type: 'prayself' },
		{ command: 'pray', type: 'receivepray' },
		{ command: 'pray', type: 'curse' },
		{ command: 'pray', type: 'curseself' },
		{ command: 'pray', type: 'receivecurse' },
	]);
};

exports.giveCustomInventory = async function (p, id) {
	await giveAlterRows(p, id, [{ command: 'inventory', type: 'display' }]);
};

exports.giveCustomDaily = async function (p, id) {
	await giveAlterRows(p, id, [
		{ command: 'daily', type: 'display' },
		{ command: 'daily', type: 'cooldown' },
		{ command: 'daily', type: 'marriage' },
	]);
};

exports.giveCustomWeapon = async function (p, id) {
	await giveAlterRows(p, id, [{ command: 'weapon', type: 'display' }]);
};

exports.giveCustomCookie = async function (p, id) {
	await giveAlterRows(p, id, [
		{ command: 'cookie', type: 'ready' },
		{ command: 'cookie', type: 'give' },
		{ command: 'cookie', type: 'cooldown' },
		{ command: 'cookie', type: 'receive' },
	]);
};

exports.giveCustomZoo = async function (p, id) {
	await giveAlterRows(p, id, [
		{ command: 'zoo', type: 'paged' },
		{ command: 'zoo', type: 'message' },
	]);
};

exports.getSupporterRank = async function (p, user) {
	if (user.supporterRank) {
		const now = new Date();
		const updateDiff = new Date() - user.supporterRank.updatedOn;
		if (updateDiff >= 1000 * 60 * 60 * 24) {
			delete user.supporterRank;
		} else if (user.supporterRank.endTime > now) {
			return user.supporterRank;
		} else {
			user.supporterRank.endTime = null;
			user.supporterRank.benefitRank = 0;
			if (updateDiff <= 20 * 1000) return user.supporterRank;
		}
	}

	const uid = await p.global.getUid(user.id);
	const patreons = await p.mongo.collection('patreons');
	const whitelist = await p.mongo.collection('patreon_wh');
	const discord = await p.mongo.collection('patreon_discord');
	const [patreonRow, whitelistRows, discordRow] = await Promise.all([
		patreons.findOne({ uid }),
		whitelist.find({ uid }).toArray(),
		discord.findOne({ uid }),
	]);

	const supporter = {
		endTime: null,
		benefitRank: 0,
		updatedOn: new Date(),
	};
	if (patreonRow?.patreonTimer) {
		const benefitRank = patreonRow.patreonType;
		const startTime = new Date(patreonRow.patreonTimer);
		const endTime = new Date(startTime.setMonth(startTime.getMonth() + patreonRow.patreonMonths));
		getBetterSupporterRank(supporter, benefitRank, endTime);
	}
	for (const row of whitelistRows) {
		getBetterSupporterRank(supporter, row.patreonType, new Date(row.endDate));
	}
	if (discordRow) {
		const benefitRank = discordRow.patreonType;
		let endTime = new Date(discordRow.endDate);
		if (discordRow.active) {
			endTime = new Date();
			endTime = new Date(endTime.setMonth(endTime.getMonth() + 1));
		}
		getBetterSupporterRank(supporter, benefitRank, endTime);
	}

	const teams = await p.mongo.collection('pet_team');
	const activeTeams = await p.mongo.collection('pet_team_active');
	if (supporter.benefitRank >= 3) {
		await teams.updateMany({ uid, disabled: 1 }, { $set: { disabled: 0 } });
	} else {
		const teamRows = await teams.find({ uid }).sort({ pgid: 1 }).toArray();
		const maxTeams = await teamUtil.getMaxTeams.bind(p)(user, supporter);
		if (teamRows.length > maxTeams) {
			const pgid = teamRows[teamRows.length - 1].pgid;
			await teams.updateOne({ pgid }, { $set: { disabled: 1 } });
			await activeTeams.deleteOne({ pgid });
		}
	}

	user.supporterRank = supporter;
	return supporter;
};

function getBetterSupporterRank(supporter, benefitRank, endTime) {
	const now = new Date();
	if (endTime < now) return;
	if (benefitRank > supporter.benefitRank) {
		supporter.endTime = endTime;
		supporter.benefitRank = benefitRank;
	} else if (benefitRank == supporter.benefitRank && endTime > supporter.endTime) {
		supporter.endTime = endTime;
	}
}

exports.handleDiscordUpdate = async function (entitlement) {
	let { userId, endDate, active, error } = parseEntitlement(entitlement);
	if (error) {
		console.error(error + ': ' + JSON.stringify(entitlement, null, 2));
		return;
	}

	const uid = await this.global.getUid(userId);
	const collection = await this.mongo.collection('patreon_discord');
	const existing = await collection.findOne({ uid });
	let renewal = false;
	if (existing) {
		const end = new Date(existing.endDate);
		const now = new Date();
		if (end >= now || existing.active) renewal = true;
	}

	active = active ? 1 : 0;
	const set = { patreonType: 3, active };
	if (endDate) set.endDate = endDate;
	await collection.updateOne({ uid }, { $set: set, $setOnInsert: { uid } }, { upsert: true });

	if (!renewal) {
		let txt = `${this.config.emoji.owo.woah} **|** Thank you for supporting OwO Bot! Your account should have access to supporter benefits.`;
		txt += `\n${this.config.emoji.blank} **|** If you have any questions, please stop by our support server: ${this.config.guildlink}`;
		this.sender.msgUser(userId, txt);
	}
};

exports.handleDiscordDelete = async function (entitlement) {
	const userId = entitlement.user_id;
	const uid = await this.global.getUid(userId);
	const collection = await this.mongo.collection('patreon_discord');
	const result = await collection.deleteOne({ uid });
	if (result.deletedCount > 0) {
		let txt = `${this.config.emoji.owo.cry} **|** It looks like your Discord payment failed.`;
		txt += `\n${this.config.emoji.blank} **|** You will no longer receive OwO Bot supporter benefits.`;
		txt += `\n${this.config.emoji.blank} **|** If you have any questions, please stop by our support server: ${this.config.guildlink}`;
		this.sender.msgUser(userId, txt);
	}
};

function parseEntitlement(entitlement) {
	if (entitlement.sku_id !== sku) return { error: 'Invalid SKU' };
	const userId = entitlement.user_id;
	if (!userId) return { error: 'Invalid User' };
	let endDate;
	let active = false;
	if (!entitlement.ends_at) active = true;
	else endDate = new Date(entitlement.ends_at);
	return { userId, endDate, active };
}
