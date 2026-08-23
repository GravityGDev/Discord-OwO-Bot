/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const battleEmoji = '🛋';
const animalUtil = require('./animalUtil.js');
const WeaponInterface = require('../WeaponInterface.js');
const global = require('../../../../utils/global.js');
const counters = require('../../../../utils/mongoCounters.js');
const defaultMaxTeams = 2;
let weaponUtil;
let teamCounterSeeded = false;

async function getUser(p, id) {
	const users = await p.mongo.collection('user');
	return users.findOne({ id: String(id) }, { projection: { uid: 1, id: 1 } });
}

async function getActivePgid(p, uid) {
	const active = await p.mongo.collection('pet_team_active');
	const row = await active.findOne({ uid }, { projection: { pgid: 1 } });
	return row?.pgid;
}

async function getTeamPgid(p, uid, { notActive = false, includeDisabled = true } = {}) {
	const teams = await p.mongo.collection('pet_team');
	const filter = { uid };
	if (!includeDisabled) filter.disabled = { $ne: 1 };
	const rows = await teams.find(filter).sort({ pgid: 1 }).toArray();
	if (!rows.length) return null;

	const activePgid = await getActivePgid(p, uid);
	if (notActive) {
		return rows.find((row) => row.pgid !== activePgid)?.pgid || null;
	}
	if (activePgid && rows.some((row) => row.pgid === activePgid)) return activePgid;
	return rows[0].pgid;
}

async function nextPgid(p) {
	if (!teamCounterSeeded) {
		const teams = await p.mongo.collection('pet_team');
		const latest = await teams.findOne({}, { sort: { pgid: -1 }, projection: { pgid: 1 } });
		await counters.seedAtLeast('pet_team_pgid', Number(latest?.pgid || 0));
		teamCounterSeeded = true;
	}
	return counters.next('pet_team_pgid');
}

async function createTeam(p, uid) {
	const teams = await p.mongo.collection('pet_team');
	const pgid = await nextPgid(p);
	await teams.insertOne({
		pgid,
		uid,
		tname: null,
		censor: 0,
		streak: 0,
		highest_streak: 0,
		disabled: 0,
	});
	return pgid;
}

async function getSimpleTeamRows(p, pgid) {
	if (!pgid) return [];
	const memberships = await p.mongo.collection('pet_team_animal');
	const rows = await memberships.find({ pgid }).sort({ pos: 1 }).toArray();
	if (!rows.length) return [];

	const pids = rows.map((row) => row.pid);
	const animals = await p.mongo.collection('animal');
	const animalRows = await animals.find({ pid: { $in: pids } }).toArray();
	const animalMap = new Map(animalRows.map((row) => [row.pid, row]));
	return rows
		.map((row) => {
			const animal = animalMap.get(row.pid);
			if (!animal) return null;
			return {
				pgid,
				pos: row.pos,
				pid: row.pid,
				name: animal.name,
				nickname: animal.nickname,
				xp: animal.xp || 0,
				acensor: animal.offensive || 0,
			};
		})
		.filter(Boolean);
}

async function buildJoinedRows(p, pgid) {
	if (!pgid) return [];
	const teams = await p.mongo.collection('pet_team');
	const team = await teams.findOne({ pgid });
	if (!team) return [];

	const memberships = await p.mongo.collection('pet_team_animal');
	const memberRows = await memberships.find({ pgid }).sort({ pos: 1 }).toArray();
	if (!memberRows.length) return [];

	const pids = memberRows.map((row) => row.pid);
	const animalsCollection = await p.mongo.collection('animal');
	const animalRows = await animalsCollection.find({ pid: { $in: pids } }).toArray();
	const animalMap = new Map(animalRows.map((row) => [row.pid, row]));

	const weaponCollection = await p.mongo.collection('user_weapon');
	const weaponRows = await weaponCollection.find({ pid: { $in: pids } }).toArray();
	const uwids = weaponRows.map((row) => row.uwid).filter((uwid) => uwid != null);

	const passiveMap = new Map();
	const trackerMap = new Map();
	if (uwids.length) {
		const passiveCollection = await p.mongo.collection('user_weapon_passive');
		const passives = await passiveCollection
			.find({ uwid: { $in: uwids } })
			.sort({ uwid: 1, pcount: 1 })
			.toArray();
		for (const passive of passives) {
			if (!passiveMap.has(passive.uwid)) passiveMap.set(passive.uwid, []);
			passiveMap.get(passive.uwid).push(passive);
		}

		const trackerCollection = await p.mongo.collection('user_weapon_kills');
		const trackers = await trackerCollection.find({ uwid: { $in: uwids } }).toArray();
		for (const tracker of trackers) trackerMap.set(tracker.uwid, tracker);
	}

	const weaponsByPid = new Map();
	for (const weapon of weaponRows) {
		if (!weaponsByPid.has(weapon.pid)) weaponsByPid.set(weapon.pid, []);
		weaponsByPid.get(weapon.pid).push(weapon);
	}

	const joined = [];
	for (const membership of memberRows) {
		const animal = animalMap.get(membership.pid);
		if (!animal) continue;
		const base = {
			ptcensor: team.censor || 0,
			streak: team.streak || 0,
			highest_streak: team.highest_streak || 0,
			pgid: team.pgid,
			tname: team.tname,
			pos: membership.pos,
			name: animal.name,
			nickname: animal.nickname,
			acensor: animal.offensive || 0,
			pid: animal.pid,
			xp: animal.xp || 0,
			id: animal.id,
		};

		const equipped = weaponsByPid.get(membership.pid) || [];
		if (!equipped.length) {
			joined.push(base);
			continue;
		}

		for (const weapon of equipped) {
			const tracker = trackerMap.get(weapon.uwid);
			const passives = passiveMap.get(weapon.uwid) || [];
			const weaponBase = {
				...base,
				uwid: weapon.uwid,
				wid: weapon.wid,
				stat: weapon.stat,
				wear: weapon.wear || 0,
				rrcount: weapon.rrcount || 0,
				rrattempt: weapon.rrattempt || 0,
				favorite: weapon.favorite || 0,
				tt: tracker ? weapon.uwid : null,
				kills: tracker?.kills || 0,
			};
			if (!passives.length) {
				joined.push(weaponBase);
			} else {
				for (const passive of passives) {
					joined.push({
						...weaponBase,
						pcount: passive.pcount,
						wpid: passive.wpid,
						pstat: passive.stat,
					});
				}
			}
		}
	}

	joined.streak = team.streak || 0;
	joined.highest_streak = team.highest_streak || 0;
	return joined;
}

exports.getJoinedTeamRows = buildJoinedRows;

exports.addMember = async function (p, animal, pos) {
	const uid = await p.global.getUid(p.msg.author.id);
	const animals = await p.mongo.collection('animal');
	const ownedAnimal = await animals.findOne({ id: String(p.msg.author.id), name: animal.value });
	if (!ownedAnimal) {
		p.errorMsg(', you do not own this animal!', 3000);
		return;
	}

	let pgid = await getTeamPgid(p, uid);
	let rows = pgid ? await getSimpleTeamRows(p, pgid) : [];
	if (rows.some((row) => row.name === animal.value)) {
		p.errorMsg(', This animal is already in your team!', 3000);
		return;
	}

	const usedPos = rows.map((row) => row.pos);
	if (!pos) {
		for (let i = 1; i < 4; i++) {
			if (!usedPos.includes(i)) {
				pos = i;
				break;
			}
		}
	}
	if (!pos) {
		p.errorMsg(
			', Your team is full! Please specify a position with `owo team add {animal} {position}`!',
			5000
		);
		return;
	}

	if (!pgid) {
		pgid = await createTeam(p, uid);
		pos = 1;
	}

	const memberships = await p.mongo.collection('pet_team_animal');
	await memberships.updateOne(
		{ pgid, pos },
		{ $set: { pgid, pos, pid: ownedAnimal.pid } },
		{ upsert: true }
	);

	rows = await getSimpleTeamRows(p, pgid);
	let team = parseTeam(rows);
	let text = '';
	for (let i = 0; i < team.length; i++) {
		text +=
			'[' +
			team[i].pos +
			']' +
			(team[i].animal.uni ? team[i].animal.uni : team[i].animal.value) +
			' ';
	}
	p.replyMsg(
		battleEmoji,
		`, Your team has been updated!\n**${p.config.emoji.blank} |** Your team: ${text}`
	);
};

exports.removeMember = async function (p, remove) {
	const uid = await p.global.getUid(p.msg.author.id);
	const pgid = await getTeamPgid(p, uid);
	if (!pgid) {
		p.errorMsg(', your team is already empty!', 3000);
		return;
	}

	const memberships = await p.mongo.collection('pet_team_animal');
	const current = await memberships.find({ pgid }).sort({ pos: 1 }).toArray();
	if (!current.length) {
		p.errorMsg(", your team doesn't have an animal!");
		return;
	}

	let target;
	if (p.global.isInt(remove)) {
		target = current.find((row) => row.pos === Number(remove));
	} else {
		const animals = await p.mongo.collection('animal');
		const animal = await animals.findOne({ id: String(p.msg.author.id), name: remove });
		if (animal) target = current.find((row) => row.pid === animal.pid);
	}

	let removed = false;
	if (target && current.length > 1) {
		const result = await memberships.deleteOne({ pgid, pos: target.pos, pid: target.pid });
		removed = result.deletedCount > 0;
	}

	const rows = await getSimpleTeamRows(p, pgid);
	let team = parseTeam(rows);
	let text = '';
	for (let i = 0; i < team.length; i++) {
		text +=
			'[' +
			team[i].pos +
			']' +
			(team[i].animal.uni ? team[i].animal.uni : team[i].animal.value) +
			' ';
	}
	if (removed) {
		p.replyMsg(
			battleEmoji,
			`, Successfully changed the team!\n**${p.config.emoji.blank} |** Your team: ${text}`
		);
	} else if (current.length == 1) {
		p.errorMsg(', You need to keep at least one animal in the team!', 3000);
	} else {
		p.errorMsg(
			`, I failed to remove that animal\n**${p.config.emoji.blank} |** Your team: ${text}`,
			5000
		);
	}
};

exports.renameTeam = async function (p, teamName) {
	const { name, offensive } = p.global.filteredName(teamName);

	if (name.length > 35) {
		p.errorMsg(', The team name is too long!', 3000);
		return;
	} else if (name.length <= 0) {
		p.errorMsg(', The name has invalid characters!', 3000);
		return;
	}

	const uid = await p.global.getUid(p.msg.author.id);
	const pgid = await getTeamPgid(p, uid);
	if (!pgid) {
		p.errorMsg(", You don't have a team! Please set one with `owo team add {animal}`", 5000);
		return;
	}

	const teams = await p.mongo.collection('pet_team');
	const result = await teams.updateOne({ pgid, uid }, { $set: { tname: name, censor: offensive } });
	if (result.matchedCount > 0) {
		p.replyMsg(
			battleEmoji,
			p.replaceMentions(`, You successfully changed your team name to: **${name}**`)
		);
	} else {
		p.errorMsg(", You don't have a team! Please set one with `owo team add {animal}`", 5000);
	}
};

exports.getBattleTeam = async function ({ id, pgid }, level, notActive) {
	if (!pgid && id) {
		const user = await getUser(this, id);
		if (!user?.uid) return null;
		pgid = await getTeamPgid(this, user.uid, { notActive: !!notActive });
	}
	if (!pgid) return null;

	const result = await buildJoinedRows(this, pgid);
	if (!result[0]) return null;

	let team = parseTeam(result, result);
	team.forEach((animal) => animalUtil.stats(animal, level));
	return {
		pgid,
		name: result[0].tname,
		streak: result[0].streak,
		highestStreak: result[0].highest_streak,
		team,
	};
};

exports.getBattleAnimal = async function ({ uwid, pid }, id) {
	if (pid) {
		throw 'pid not implemented yet';
	}

	const weapons = await global.main?.mongo?.collection?.('user_weapon');
	let weaponCollection = weapons;
	if (!weaponCollection) {
		throw new Error('MongoDB weapon collection is unavailable');
	}
	const filter = { uwid: Number(uwid) };
	if (id) filter.uid = await global.getUid(id);
	const weapon = await weaponCollection.findOne(filter);
	if (!weapon?.pid) {
		return {
			error: {
				animal: weapon?.pid,
				weapon: weapon?.uwid,
			},
		};
	}

	const animalCollection = await global.main.mongo.collection('animal');
	const animal = await animalCollection.findOne({ pid: weapon.pid });
	if (!animal) {
		return { error: { animal: null, weapon: weapon.uwid } };
	}

	const passiveCollection = await global.main.mongo.collection('user_weapon_passive');
	const trackerCollection = await global.main.mongo.collection('user_weapon_kills');
	const passives = await passiveCollection.find({ uwid: weapon.uwid }).sort({ pcount: 1 }).toArray();
	const tracker = await trackerCollection.findOne({ uwid: weapon.uwid });
	const base = {
		name: animal.name,
		nickname: animal.nickname,
		acensor: animal.offensive || 0,
		pid: animal.pid,
		xp: animal.xp || 0,
		id: animal.id,
		uwid: weapon.uwid,
		wid: weapon.wid,
		stat: weapon.stat,
		wear: weapon.wear || 0,
		rrcount: weapon.rrcount || 0,
		rrattempt: weapon.rrattempt || 0,
		favorite: weapon.favorite || 0,
		tt: tracker ? weapon.uwid : null,
		kills: tracker?.kills || 0,
	};
	const result = passives.length
		? passives.map((passive) => ({
				...base,
				pcount: passive.pcount,
				wpid: passive.wpid,
				pstat: passive.stat,
		  }))
		: [base];

	let team = parseTeam(result, result);
	team.forEach((battleAnimal) => animalUtil.stats(battleAnimal));
	return team[0];
};

/* eslint-disable-next-line */
const createTeamEmbed = (exports.createTeamEmbed = function (p, team, other = {}) {
	let digits = 1;
	for (let i in team) {
		animalUtil.stats(team[i]);
		let tempDigit = Math.log10(team[i].stats.hp[1] + team[i].stats.hp[3]) + 1;
		if (tempDigit > digits) digits = tempDigit;
		tempDigit = Math.log10(team[i].stats.wp[1] + team[i].stats.wp[3]) + 1;
		if (tempDigit > digits) digits = tempDigit;
		tempDigit = Math.log10(team[i].stats.att[0] + team[i].stats.att[1]) + 1;
		if (tempDigit > digits) digits = tempDigit;
		tempDigit = Math.log10(team[i].stats.mag[0] + team[i].stats.mag[1]) + 1;
		if (tempDigit > digits) digits = tempDigit;
		tempDigit = Math.log10(team[i].stats.pr[0] + team[i].stats.pr[1]) + 1;
		if (tempDigit > digits) digits = tempDigit;
		tempDigit = Math.log10(team[i].stats.mr[0] + team[i].stats.mr[1]) + 1;
		if (tempDigit > digits) digits = tempDigit;
	}
	digits = Math.trunc(digits);
	let streak = other.streak || 0;
	let highestStreak = other.highest_streak || 0;

	let fields = [];
	for (let i = 1; i <= 3; i++) {
		let title = `[${i}] `;
		let body = '';
		let animal;
		for (let j = 0; j < team.length; j++) if (team[j].pos == i) animal = team[j];
		if (!animal) {
			title += 'none';
			body = '*`owo team add {animal} ' + i + '`*';
		} else {
			let hp = ('' + Math.ceil(animal.stats.hp[1] + animal.stats.hp[3])).padStart(digits, '0');
			let wp = ('' + Math.ceil(animal.stats.wp[1] + animal.stats.wp[3])).padStart(digits, '0');
			let att = ('' + Math.ceil(animal.stats.att[0] + animal.stats.att[1])).padStart(digits, '0');
			let mag = ('' + Math.ceil(animal.stats.mag[0] + animal.stats.mag[1])).padStart(digits, '0');
			let pr = WeaponInterface.resToPrettyPercent(animal.stats.pr);
			let mr = WeaponInterface.resToPrettyPercent(animal.stats.mr);
			title += p.replaceMentions(
				`${animal.animal.uni ? animal.animal.uni : animal.animal.value} **${
					animal.nickname ? animal.nickname : animal.animal.name
				}** `
			);
			body = `Lvl ${animal.stats.lvl} \`[${p.global.toFancyNum(
				animal.stats.xp[0]
			)}/${p.global.toFancyNum(
				animal.stats.xp[1]
			)}]\`\n<:hp:531620120410456064> \`${hp}\` <:wp:531620120976687114> \`${wp}\`\n<:att:531616155450998794> \`${att}\` <:mag:531616156231139338> \`${mag}\`\n<:pr:531616156222488606> \`${pr}\` <:mr:531616156226945024> \`${mr}\`\n`;
			let weapon = animal.weapon;
			if (weapon) {
				body += `\`${weapon.uwid}\` ${weapon.rank.emoji} ${weapon.emoji} `;
				for (let j = 0; j < weapon.passives.length; j++) {
					body += `${weapon.passives[j].emoji} `;
				}
				body += `${weapon.avgQuality}%`;
			}
		}
		fields.push({ name: title, value: body, inline: true });
	}

	return {
		author: {
			name: p.getName() + "'s " + p.replaceMentions(other.tname),
			icon_url: p.msg.author.avatarURL,
		},
		description:
			'`owo team add {animal} {pos}` Add an animal to your team\n`owo team remove {pos}` Removes an animal from your team\n`owo team rename {name}` Renames your team\n`owo rename {animal} {name}` Rename an animal\n`owo setteam {teamNum}` to set multiple teams',
		color: p.config.embed_color,
		footer: {
			text: `Current Streak: ${streak} | Highest Streak: ${highestStreak}`,
		},
		fields,
	};
});

exports.parseTeam = parseTeam;
function parseTeam(animals, weapons, censor = false) {
	let result = [];

	let used = [];
	for (let i = 0; i < animals.length; i++) {
		let animal = animals[i];
		if (!used.includes(animal.pid)) {
			used.push(animal.pid);
			let animalObj = global.validAnimal(animal.name);
			if (!animalObj) continue;
			let nickname = censor && animal.acensor == 1 ? 'Censored' : animal.nickname;
			if (!nickname) nickname = animalObj.name;
			result.push({
				pid: animal.pid,
				animal: animalObj,
				nickname,
				streak: animals.streak,
				highestStreak: animals.highest_streak,
				pos: animal.pos,
				xp: animal.xp,
				buffs: [],
				debuffs: [],
			});
		}
	}

	if (weapons) {
		let weps = weaponUtil.parseWeaponQuery(weapons);
		for (let key in weps) {
			let pid = weps[key].pid;
			for (let i = 0; i < result.length; i++)
				if (result[i].pid == pid) result[i].weapon = weaponUtil.parseWeapon(weps[key]);
		}
	}

	return result;
}

exports.isDead = function (team) {
	let totalhp = 0;
	for (let i in team) {
		let hp = team[i].stats.hp[0];
		totalhp += hp < 0 ? 0 : hp;
	}
	return totalhp <= 0;
};

exports.giveXPToUserTeams = async function (
	p,
	user,
	xp,
	{ xpOverrides, activePgid, activePids, secondaryPgid, ignoreSecondary } = {}
) {
	const pgid = activePgid || (await getPrimaryPgid(p, user));
	if (!pgid) return;

	if (!activePids) activePids = await getPrimaryPids(p, pgid);
	await giveXpToPgid(p, pgid, xp, xpOverrides, activePids);

	if (ignoreSecondary) return;

	const secondaryXpOverrides = {};
	for (let i in activePids) secondaryXpOverrides[activePids[i]] = 0;
	const pgid2 = secondaryPgid || (await getSecondaryPgid(p, user));
	const secondaryActivePids = await getPrimaryPids(p, pgid2);
	if (secondaryActivePids.length) {
		await giveXpToPgid(p, pgid2, xp / 2, secondaryXpOverrides, secondaryActivePids);
	}
};

exports.updateTeamStreak = async function (pgid, { addStreak, resetStreak }) {
	if (!pgid) return;
	const teams = await global.main.mongo.collection('pet_team');
	if (addStreak) {
		await teams.updateOne(
			{ pgid },
			[
				{ $set: { streak: { $add: [{ $ifNull: ['$streak', 0] }, 1] } } },
				{
					$set: {
						highest_streak: {
							$cond: [
								{ $gt: ['$streak', { $ifNull: ['$highest_streak', 0] }] },
								'$streak',
								{ $ifNull: ['$highest_streak', 0] },
							],
						},
					},
				},
			]
		);
	}
	if (resetStreak) await teams.updateOne({ pgid }, { $set: { streak: 0 } });
};

async function getSecondaryPgid(p, user) {
	if (!user) return null;
	const uid = await p.global.getUid(user.id);
	const teams = await p.mongo.collection('pet_team');
	const result = await teams.find({ uid, disabled: { $ne: 1 } }).sort({ pgid: 1 }).toArray();
	if (!result.length) return null;
	const activePgid = await getActivePgid(p, uid);
	let activeLoc = result.findIndex((row) => row.pgid === activePgid);
	if (activeLoc < 0) activeLoc = 0;
	const nextLoc = (activeLoc + 1) % result.length;
	return result[nextLoc]?.pgid;
}

async function getPrimaryPgid(p, user) {
	if (!user) return null;
	const uid = await p.global.getUid(user.id);
	return getTeamPgid(p, uid);
}

async function getPrimaryPids(p, pgid) {
	if (!pgid) return [];
	const memberships = await p.mongo.collection('pet_team_animal');
	const result = await memberships.find({ pgid }, { projection: { pid: 1 } }).toArray();
	return result.map((row) => row.pid);
}

exports.getPidFromTeam = function (team) {
	const pids = [];
	for (let i in team.team) pids.push(team.team[i].pid);
	return pids;
};

async function giveXpToPgid(p, pgid, xp, xpOverrides, pids) {
	if (!pgid || !pids?.length) return;
	xp = Math.ceil(xp);
	const animals = await p.mongo.collection('animal');
	await animals.bulkWrite(
		pids.map((pid) => ({
			updateOne: {
				filter: { pid },
				update: {
					$inc: {
						xp:
							xpOverrides && Object.prototype.hasOwnProperty.call(xpOverrides, pid)
								? Number(xpOverrides[pid])
								: xp,
					},
				},
			},
		})),
		{ ordered: false }
	);
}

exports.setWeaponUtil = function (util) {
	weaponUtil = util;
};

exports.getMaxTeams = async function (user, patreonRank) {
	let maxTeams = defaultMaxTeams;
	let patreon = patreonRank || (await this.patreonUtil.getSupporterRank(this, user));
	if (patreon?.benefitRank >= 3) maxTeams++;
	return maxTeams;
};

exports.getUserTeamPgids = async function (p, id, includeDisabled = false) {
	const user = await getUser(p, id);
	if (!user?.uid) return { uid: null, pgids: [], activePgid: null };
	const teams = await p.mongo.collection('pet_team');
	const filter = { uid: user.uid };
	if (!includeDisabled) filter.disabled = { $ne: 1 };
	const rows = await teams.find(filter).sort({ pgid: 1 }).toArray();
	return {
		uid: user.uid,
		pgids: rows.map((row) => row.pgid),
		activePgid: await getActivePgid(p, user.uid),
	};
};

exports.createEmptyTeam = async function (p, uid) {
	return createTeam(p, uid);
};
