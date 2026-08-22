/*
 * MongoDB persistence helpers for battle weapons.
 *
 * WeaponInterface delegates its database-facing methods here so combat logic
 * stays separate from persistence while the bot finishes the MongoDB cutover.
 */

const mongo = require('./mongo.js');
const counters = require('./mongoCounters.js');
const global = require('./global.js');

let installed = false;
let counterSeeded = false;

async function nextUwid() {
	if (!counterSeeded) {
		const weapons = await mongo.collection('user_weapon');
		const latest = await weapons.findOne({}, { sort: { uwid: -1 }, projection: { uwid: 1 } });
		await counters.seedAtLeast('user_weapon_uwid', Number(latest?.uwid || 0));
		counterSeeded = true;
	}
	return counters.next('user_weapon_uwid');
}

async function saveWeapon(id) {
	const uid = await global.getUid(id);
	const uwid = await nextUwid();
	const wear = this.wear?.id || 0;
	const session = await mongo.startSession();

	try {
		session.startTransaction();
		const weapons = await mongo.collection('user_weapon');
		await weapons.insertOne(
			{
				uwid,
				uid,
				wid: this.id,
				stat: this.sqlStat,
				avg: this.avgQuality,
				rrcount: 0,
				rrattempt: 0,
				wear,
				pid: null,
				favorite: 0,
			},
			{ session }
		);

		if (this.passives.length) {
			const passives = await mongo.collection('user_weapon_passive');
			await passives.insertMany(
				this.passives.map((passive, pcount) => ({
					uwid,
					pcount,
					wpid: passive.id,
					stat: passive.sqlStat,
				})),
				{ session }
			);
		}

		if (this.hasTT) {
			const kills = await mongo.collection('user_weapon_kills');
			await kills.insertOne({ uwid, kills: 0 }, { session });
		}

		await session.commitTransaction();
		this.uwid = uwid;
		this.ruwid = uwid;
		return uwid;
	} catch (err) {
		if (session.inTransaction()) await session.abortTransaction();
		throw err;
	} finally {
		await session.endSession();
	}
}

async function updateWeapon() {
	const uwid = this.ruwid || this.uwid;
	if (!uwid) return false;

	const session = await mongo.startSession();
	try {
		session.startTransaction();
		const weapons = await mongo.collection('user_weapon');
		const result = await weapons.updateOne(
			{ uwid },
			{
				$set: {
					stat: this.sqlStat,
					avg: this.avgQuality,
					wear: this.wear.id,
					rrattempt: this.rrAttempt,
					rrcount: this.rrCount,
				},
			},
			{ session }
		);
		if (!result.matchedCount) {
			await session.abortTransaction();
			return false;
		}

		const passives = await mongo.collection('user_weapon_passive');
		await passives.deleteMany({ uwid }, { session });
		if (this.passives.length) {
			await passives.insertMany(
				this.passives.map((passive, pcount) => ({
					uwid,
					pcount,
					wpid: passive.id,
					stat: passive.sqlStat,
				})),
				{ session }
			);
		}

		await session.commitTransaction();
		return true;
	} catch (err) {
		if (session.inTransaction()) await session.abortTransaction();
		throw err;
	} finally {
		await session.endSession();
	}
}

async function saveTakedownTracker() {
	const currKills = Object.keys(this.currKills || {}).length;
	if (!currKills) return;
	const uwid = this.ruwid || this.uwid;
	if (!uwid) return;

	const kills = await mongo.collection('user_weapon_kills');
	await kills.updateOne({ uwid }, { $inc: { kills: currKills } }, { upsert: true });
	this.kills = Number(this.kills || 0) + currKills;
	this.currKills = {};
}

exports.saveWeapon = saveWeapon;
exports.updateWeapon = updateWeapon;
exports.saveTakedownTracker = saveTakedownTracker;

// Compatibility for already-loaded weapon classes during the migration.
exports.install = function () {
	if (installed) return;
	const WeaponInterface = require('../commands/commandList/battle/WeaponInterface.js');
	WeaponInterface.prototype.save = saveWeapon;
	WeaponInterface.prototype.update = updateWeapon;
	WeaponInterface.prototype.saveTT = saveTakedownTracker;
	installed = true;
};
