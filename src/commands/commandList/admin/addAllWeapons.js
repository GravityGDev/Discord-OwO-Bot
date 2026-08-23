/*
 * OwO Bot for Discord
 * Copyright (C) 2023 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');
const WeaponInterface = require('../battle/WeaponInterface.js');

module.exports = new CommandInterface({
	alias: ['addallweapons', 'aaw'],

	owner: true,

	execute: async function (p) {
		const id = p.args[0];
		let stat = p.args[1];
		const uid = await p.global.getUid(id);

		if (!p.global.isInt(stat)) {
			return p.errorMsg(', stat not an integer');
		}
		stat = parseInt(stat);

		if (stat < 0 || stat > 100) {
			return p.errorMsg(', stat is invalid');
		}

		if (!uid) {
			return p.errorMsg(', invalid user id');
		}

		const weaponsCollection = await p.mongo.collection('user_weapon');
		const weaponRows = await weaponsCollection.find({ uid, avg: stat }).toArray();
		const uwids = weaponRows.map((weapon) => weapon.uwid);
		const passiveCollection = await p.mongo.collection('user_weapon_passive');
		const passiveRows = uwids.length
			? await passiveCollection
					.find({ uwid: { $in: uwids } })
					.sort({ uwid: 1, pcount: 1 })
					.toArray()
			: [];
		const passivesByWeapon = new Map();
		for (const passive of passiveRows) {
			if (!passivesByWeapon.has(passive.uwid)) passivesByWeapon.set(passive.uwid, []);
			passivesByWeapon.get(passive.uwid).push(passive.wpid);
		}

		let formattedWeapons = {};
		for (const weapon of weaponRows) {
			if (!formattedWeapons[weapon.wid]) formattedWeapons[weapon.wid] = [];
			formattedWeapons[weapon.wid].push((passivesByWeapon.get(weapon.uwid) || []).join(','));
		}

		const allWeapons = getAllWeapons();
		await addMissingWeapons.bind(this)(formattedWeapons, allWeapons, stat, id);
	},
});

function getAllWeapons() {
	const weapons = {};
	for (let wid in WeaponInterface.weapons) {
		const weapon = new WeaponInterface.weapons[wid](null, null, true);
		if (weapon.passiveCount && weapon.availablePassives.length) {
			weapons[wid] = getAllPassives(weapon.passiveCount, weapon.availablePassives);
		} else {
			weapons[wid] = [];
		}
	}
	return weapons;
}

function getAllPassives(count, passives) {
	let result = [];
	if (count <= 0) return result;
	const prev = getAllPassives(count - 1, passives);
	passives.forEach((passive) => {
		if (prev.length) {
			prev.forEach((prevPassive) => {
				result.push(prevPassive + ',' + passive);
			});
		} else {
			result.push(passive);
		}
	});
	return result;
}

async function addMissingWeapons(existingWeapons, allWeapons, stat, id) {
	for (let allWid in allWeapons) {
		let allPassives = allWeapons[allWid];
		if (allPassives.length === 0) {
			if (!existingWeapons[allWid]) {
				await addWeapon.bind(this)(allWid, [], stat, id);
			}
		} else {
			let existingPassives =
				existingWeapons[allWid]?.map((passives) => {
					return passives
						.split(',')
						.filter(Boolean)
						.sort((a, b) => parseInt(a) - parseInt(b))
						.join(',');
				}) || [];
			for (let i in allPassives) {
				let allPassive = allPassives[i]
					.split(',')
					.sort((a, b) => parseInt(a) - parseInt(b))
					.join(',');
				if (!existingPassives.includes(allPassive)) {
					let passives = allPassive.split(',').map((passive) => parseInt(passive));
					await addWeapon.bind(this)(allWid, passives, stat, id);
				}
			}
		}
	}
}

async function addWeapon(wid, passives, stat, id) {
	console.log(`Adding weapon ${wid}: ${passives}`);
	const weapon = new WeaponInterface.weapons[wid](null, null, null, {
		passives,
		statOverride: stat,
	});
	await weapon.save(id);
	await delay(500);
}

function delay(ms) {
	return new Promise((res) => {
		setTimeout(res, ms);
	});
}
