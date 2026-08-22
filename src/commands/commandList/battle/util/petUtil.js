/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const teamUtil = require('./teamUtil.js');
const animalUtil = require('./animalUtil.js');
const WeaponInterface = require('../WeaponInterface.js');

/* get and parse animals from the database */
exports.getAnimals = async function (p) {
	const animalCollection = await p.mongo.collection('animal');
	const animalRows = await animalCollection
		.find({ id: String(p.msg.author.id), xp: { $gt: 0 } })
		.sort({ xp: -1 })
		.limit(25)
		.toArray();
	if (!animalRows.length) return [];

	const pids = animalRows.map((animal) => animal.pid);
	const weaponCollection = await p.mongo.collection('user_weapon');
	const weaponRows = await weaponCollection.find({ pid: { $in: pids } }).toArray();
	const uwids = weaponRows.map((weapon) => weapon.uwid).filter((uwid) => uwid != null);

	const passiveMap = new Map();
	const trackerMap = new Map();
	if (uwids.length) {
		const passives = await p.mongo.collection('user_weapon_passive');
		const passiveRows = await passives
			.find({ uwid: { $in: uwids } })
			.sort({ uwid: 1, pcount: 1 })
			.toArray();
		for (const passive of passiveRows) {
			if (!passiveMap.has(passive.uwid)) passiveMap.set(passive.uwid, []);
			passiveMap.get(passive.uwid).push(passive);
		}

		const trackers = await p.mongo.collection('user_weapon_kills');
		const trackerRows = await trackers.find({ uwid: { $in: uwids } }).toArray();
		for (const tracker of trackerRows) trackerMap.set(tracker.uwid, tracker);
	}

	const weaponsByPid = new Map();
	for (const weapon of weaponRows) {
		if (!weaponsByPid.has(weapon.pid)) weaponsByPid.set(weapon.pid, []);
		weaponsByPid.get(weapon.pid).push(weapon);
	}

	const joined = [];
	for (const animal of animalRows) {
		const base = {
			id: animal.id,
			name: animal.name,
			nickname: animal.nickname,
			acensor: animal.offensive || 0,
			pid: animal.pid,
			xp: animal.xp || 0,
		};
		const equipped = weaponsByPid.get(animal.pid) || [];
		if (!equipped.length) {
			joined.push(base);
			continue;
		}

		for (const weapon of equipped) {
			const tracker = trackerMap.get(weapon.uwid);
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
			const passives = passiveMap.get(weapon.uwid) || [];
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

	let animals = teamUtil.parseTeam(joined, joined);
	for (let i in animals) animalUtil.stats(animals[i]);
	return animals;
};

/* Construct embed message */
exports.getDisplay = function (p, animals) {
	let embed = {
		author: {
			name: p.getName() + "'s pets",
			icon_url: p.msg.author.avatarURL,
		},
		color: p.config.embed_color,
		fields: [],
	};

	let letterCount = embed.author.name.length;

	for (let i in animals) {
		let animal = animals[i];

		let digits = 1;
		let tempDigit = Math.log10(animal.stats.hp[1] + animal.stats.hp[3]) + 1;
		if (tempDigit > digits) digits = tempDigit;
		tempDigit = Math.log10(animal.stats.wp[1] + animal.stats.wp[3]) + 1;
		if (tempDigit > digits) digits = tempDigit;
		tempDigit = Math.log10(animal.stats.att[0] + animal.stats.att[1]) + 1;
		if (tempDigit > digits) digits = tempDigit;
		tempDigit = Math.log10(animal.stats.mag[0] + animal.stats.mag[1]) + 1;
		if (tempDigit > digits) digits = tempDigit;
		tempDigit = Math.log10(animal.stats.pr[0] + animal.stats.pr[1]) + 1;
		if (tempDigit > digits) digits = tempDigit;
		tempDigit = Math.log10(animal.stats.mr[0] + animal.stats.mr[1]) + 1;
		if (tempDigit > digits) digits = tempDigit;
		digits = Math.trunc(digits);

		let hp = ('' + Math.ceil(animal.stats.hp[1] + animal.stats.hp[3])).padStart(digits, '0');
		let wp = ('' + Math.ceil(animal.stats.wp[1] + animal.stats.wp[3])).padStart(digits, '0');
		let att = ('' + Math.ceil(animal.stats.att[0] + animal.stats.att[1])).padStart(digits, '0');
		let mag = ('' + Math.ceil(animal.stats.mag[0] + animal.stats.mag[1])).padStart(digits, '0');
		let pr = WeaponInterface.resToPrettyPercent(animal.stats.pr);
		let mr = WeaponInterface.resToPrettyPercent(animal.stats.mr);
		let stats = `<:hp:531620120410456064> \`${hp}\` <:wp:531620120976687114> \`${wp}\`\n<:att:531616155450998794> \`${att}\` <:mag:531616156231139338> \`${mag}\`\n<:pr:531616156222488606> \`${pr}\` <:mr:531616156226945024> \`${mr}\``;
		let weapon = animal.weapon;
		let weaponText = '';
		if (weapon) {
			weaponText += `\`${weapon.uwid}\` ${weapon.rank.emoji} ${weapon.emoji} `;
			for (var j = 0; j < weapon.passives.length; j++) {
				weaponText += `${weapon.passives[j].emoji} `;
			}
			weaponText += `${weapon.avgQuality}%`;
		}

		let field = {
			name:
				(animal.animal.uni ? animal.animal.uni : animal.animal.value) +
				' ' +
				p.replaceMentions(animal.nickname ? animal.nickname : animal.animal.name),
			value: `Lvl.${animal.stats.lvl} \`[${p.global.toFancyNum(
				animal.stats.xp[0]
			)}/${p.global.toFancyNum(animal.stats.xp[1])}]\`\n${stats}\n${weaponText}`,
			inline: true,
		};

		letterCount += field.name.length + field.value.length;
		if (letterCount > 6000) return { embed };

		embed.fields.push(field);
	}

	return { embed };
};
