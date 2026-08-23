/*
 * OwO Bot for Discord
 * Copyright (C) 2023 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const WeaponInterface = require('../WeaponInterface.js');

const maxAnimals = 6;
const attack = '👊🏼';
exports.attack = attack;
const weapon = '🗡';
exports.weapon = weapon;
const stopStreak = {
	start: 1684652400000,
	end: 1696143600000,
};

exports.getRandomPgid = async function () {
	const teamAnimals = await this.mongo.collection('pet_team_animal');
	const first = await teamAnimals.findOne({}, { sort: { pgid: 1 }, projection: { pgid: 1 } });
	const last = await teamAnimals.findOne({}, { sort: { pgid: -1 }, projection: { pgid: 1 } });
	if (!first?.pgid || !last?.pgid) return 0;

	const rand = first.pgid + Math.floor(Math.random() * Math.max(1, last.pgid - first.pgid));
	let result = await teamAnimals.findOne(
		{ pgid: { $gte: rand } },
		{ sort: { pgid: 1 }, projection: { pgid: 1 } }
	);
	if (!result) result = first;
	return result?.pgid || 0;
};

/* Do stuff before the turn starts (usually for buffs) */
exports.preTurn = function (team, enemy) {
	const action = [weapon, weapon, weapon];
	let logs = [];

	for (let i in team) {
		let animal = team[i];
		let check = WeaponInterface.canAttack(animal, team, enemy, action);
		animal.disabled = check;
		for (let j in animal.buffs) {
			let log = animal.buffs[j].preTurn(animal, team, enemy, action[i]);
			if (log) logs = logs.concat(log.logs);
		}
		for (let j in animal.debuffs) {
			let log = animal.debuffs[j].preTurn(animal, team, enemy, action[i]);
			if (log) logs = logs.concat(log.logs);
		}
		if (animal.weapon) {
			let log = animal.weapon.preTurn(animal, team, enemy, action[i]);
			if (log) logs = logs.concat(log.logs);
			for (let j in animal.weapon.passives) {
				let log2 = animal.weapon.passives[j].preTurn(animal, team, enemy, action[i]);
				if (log2) logs = logs.concat(log2.logs);
			}
		}
	}

	return logs;
};

/* Calculates a turn for a team */
exports.executeTurn = function (team, enemy) {
	const action = {
		ally: [weapon, weapon, weapon],
		enemy: [weapon, weapon, weapon],
	};
	let logs = [];
	let teamPos = 0;
	let enemyPos = 0;
	for (let i = 0; i < maxAnimals; i++) {
		let animal;
		let tempEnemy;
		let tempAlly;
		let tempAction;

		if (teamPos <= enemyPos) {
			animal = team[teamPos];
			tempEnemy = enemy;
			tempAlly = team;
			tempAction = action.ally[teamPos];
			teamPos++;
		} else {
			animal = enemy[enemyPos];
			tempEnemy = team;
			tempAlly = enemy;
			tempAction = action.enemy[enemyPos];
			enemyPos++;
		}

		let log;

		if (animal) {
			if (animal.disabled && !animal.disabled.canAttack) {
				if (animal.disabled.logs && animal.disabled.logs.logs.length > 0)
					logs = logs.concat(animal.disabled.logs.logs);
			} else if (animal.weapon) {
				if (tempAction == weapon) log = animal.weapon.attackWeapon(animal, tempAlly, tempEnemy);
				else log = animal.weapon.attackPhysical(animal, tempAlly, tempEnemy);
			} else {
				log = WeaponInterface.basicAttack(animal, tempAlly, tempEnemy);
			}
		}

		if (log) logs = logs.concat(log.logs);
	}

	return logs;
};

/* Do stuff after the turn ends (usually for buffs) */
exports.postTurn = function (team, enemy) {
	const action = [weapon, weapon, weapon];
	let logs = [];
	for (let i in team) {
		let animal = team[i];
		let j = animal.buffs.length;
		while (j--) {
			let log = animal.buffs[j].postTurn(animal, team, enemy, action[i]);
			if (log) logs = logs.concat(log.logs);
		}
		j = animal.debuffs.length;
		while (j--) {
			let log = animal.debuffs[j].postTurn(animal, team, enemy, action[i]);
			if (log) logs = logs.concat(log.logs);
		}
		if (animal.weapon) {
			let log = animal.weapon.postTurn(animal, team, enemy, action[i]);
			if (log) logs = logs.concat(log.logs);
			for (let j in animal.weapon.passives) {
				let log2 = animal.weapon.passives[j].postTurn(animal, team, enemy, action[i]);
				if (log2) logs = logs.concat(log2.logs);
			}
		}
	}

	return logs;
};

/* strip buffs after turn fully processed */
exports.removeBuffs = function (team, enemy) {
	for (let i in team) {
		let animal = team[i];
		let j = animal.buffs.length;
		while (j--) {
			if (animal.buffs[j].markedForDeath) {
				animal.buffs.splice(j, 1);
			}
		}
		j = animal.debuffs.length;
		while (j--) {
			if (animal.debuffs[j].markedForDeath) {
				animal.debuffs.splice(j, 1);
			}
		}
	}
	for (let i in enemy) {
		let animal = enemy[i];
		let j = animal.buffs.length;
		while (j--) {
			if (animal.buffs[j].markedForDeath) {
				animal.buffs.splice(j, 1);
			}
		}
		j = animal.debuffs.length;
		while (j--) {
			if (animal.debuffs[j].markedForDeath) {
				animal.debuffs.splice(j, 1);
			}
		}
	}
};

/* Calculate xp depending on win/loss/tie */
exports.calculateXP = function (team, enemy, currentStreak = 0) {
	let playeravg = 0;
	for (let i in team.team.team) playeravg += team.team.team[i].stats.lvl;
	playeravg /= team.team.team.length;

	let enemyavg = 0;
	for (let i in enemy.team.team) enemyavg += enemy.team.team[i].stats.lvl;
	enemyavg /= enemy.team.team.length;

	let lvlDiff = enemyavg - playeravg;
	if (lvlDiff < 0) lvlDiff = 0;

	let xp = 50;
	let resetStreak = true;
	let addStreak = false;
	let bonus = 0;
	if (team.win && enemy.win) {
		resetStreak = false;
		addStreak = false;
		xp = 100;
	} else if (team.win) {
		resetStreak = false;
		addStreak = true;
		xp = 200;
		bonus = Math.round(600 * lvlDiff);
		currentStreak++;
		bonus += bonusXP(currentStreak);
	}

	if (shouldStopStreak()) {
		addStreak = false;
		resetStreak = false;
	}

	const total = xp + bonus;

	let highestLvl = 1;
	let xpOverrides = {};
	for (let i in team.team.team) {
		let lvl = team.team.team[i].stats.lvl;
		if (lvl > highestLvl) highestLvl = lvl;
	}

	for (let i in team.team.team) {
		let mult = 1;
		let lvl = team.team.team[i].stats.lvl;
		if (lvl < highestLvl) mult = 2 + (highestLvl - lvl) / 10;
		if (mult > 10) mult = 10;
		mult += team.team.team[i].weapon?.getBonusXPPassive() || 0;
		xpOverrides[team.team.team[i].pid] = Math.round(total * mult);
	}

	return {
		total,
		bonus,
		xp,
		resetStreak,
		addStreak,
		xpOverrides,
	};
};

function bonusXP(streak) {
	if (shouldStopStreak()) {
		return 100;
	}
	let bonus = 0;
	if (streak % 1000 === 0) bonus = 25 * (Math.sqrt(streak / 100) * 100 + 500);
	else if (streak % 500 === 0) bonus = 10 * (Math.sqrt(streak / 100) * 100 + 500);
	else if (streak % 100 === 0) bonus = 5 * (Math.sqrt(streak / 100) * 100 + 500);
	else if (streak % 50 === 0) bonus = 3 * (Math.sqrt(streak / 100) * 100 + 500);
	else if (streak % 10 === 0) bonus = Math.sqrt(streak / 100) * 100 + 500;
	else bonus = 0;
	bonus = Math.round(bonus);
	if (bonus > 100000) bonus = 100000;
	return bonus;
}

/*
let totalxp = 0;
let pxp = 0;
for(let i = 35000;i<=40000;i+=10){
	pxp += 10*200;
	let currentxp = bonusXP(i);
	totalxp += currentxp;
	console.log(`[${i}] ${currentxp} | ${totalxp} | ${pxp}`);
}
*/

exports.saveStates = function (battle) {
	let player = [];
	for (let i in battle.player.team) {
		let info = parseAnimalInfo(battle.player.team[i]);
		let result = {
			info,
			hp: battle.player.team[i].stats.hp.slice(),
			wp: battle.player.team[i].stats.wp.slice(),
			buffs: [],
		};
		for (let j in battle.player.team[i].buffs) {
			result.buffs.push({ emoji: battle.player.team[i].buffs[j].emoji });
		}
		player.push(result);
	}
	let enemy = [];
	for (let i in battle.enemy.team) {
		let info = parseAnimalInfo(battle.enemy.team[i]);
		let result = {
			info,
			hp: battle.enemy.team[i].stats.hp.slice(),
			wp: battle.enemy.team[i].stats.wp.slice(),
			buffs: [],
		};
		for (let j in battle.enemy.team[i].buffs) {
			result.buffs.push({ emoji: battle.enemy.team[i].buffs[j].emoji });
		}
		enemy.push(result);
	}
	return { player, enemy };
};

function parseAnimalInfo(animal) {
	let info = animal;
	return info;
}

exports.updatePreviousStats = function (battle) {
	for (let i in battle.player.team) {
		battle.player.team[i].stats.hp[2] = battle.player.team[i].stats.hp[0];
		battle.player.team[i].stats.wp[2] = battle.player.team[i].stats.wp[0];
	}
	for (let i in battle.enemy.team) {
		battle.enemy.team[i].stats.hp[2] = battle.enemy.team[i].stats.hp[0];
		battle.enemy.team[i].stats.wp[2] = battle.enemy.team[i].stats.wp[0];
	}
};

const shouldStopStreak = (exports.shouldStopStreak = function () {
	const now = Date.now();
	if (!stopStreak || !stopStreak.start || !stopStreak.end) {
		return;
	}
	return stopStreak.start < now && now < stopStreak.end;
});

exports.getStopStreak = function () {
	return stopStreak;
};

exports.getBattleSetting = async function (id) {
	id = id || this.msg.author.id;

	let bs = {
		auto: true,
		display: 'image',
		speed: 'short',
		showLogs: false,
	};

	const users = await this.mongo.collection('user');
	const user = await users.findOne({ id: String(id) }, { projection: { uid: 1 } });
	if (!user?.uid) return bs;

	const settings = await this.mongo.collection('battle_settings');
	const result = await settings.findOne({ uid: user.uid });
	if (!result) return bs;

	if (result.speed == 0) {
		bs.speed = 'instant';
	} else if (result.speed == 2) {
		bs.speed = 'lengthy';
	}

	if (result.display == 'text') {
		bs.display = 'text';
	} else if (result.display == 'compact') {
		bs.display = 'compact';
	}

	if (result.logs == 1) {
		bs.showLogs = true;
		bs.auto = true;
		bs.speed = 'instant';
	} else if (result.logs == 2) {
		bs.showLogs = 'link';
		bs.auto = true;
	}

	return bs;
};

exports.updateTT = function (battleTeam) {
	const promises = [];
	for (let key in battleTeam.team) {
		const animal = battleTeam.team[key];
		if (animal?.weapon?.hasTakedownTracker) {
			promises.push(animal.weapon.saveTT());
		}
	}
	return Promise.all(promises);
};
