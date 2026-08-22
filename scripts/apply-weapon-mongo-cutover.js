/*
 * One-way migration codemod for the large battle weapon files.
 *
 * GitHub's contents API only replaces complete files. Keeping the migration as
 * exact, checked transformations lets CI patch the original large files in the
 * repository workspace, syntax-check them, and commit the resulting source.
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
let changed = 0;

function read(relative) {
	return fs.readFileSync(path.join(root, relative), 'utf8');
}

function write(relative, content) {
	fs.writeFileSync(path.join(root, relative), content);
	changed++;
	console.log(`Updated ${relative}`);
}

function replaceExact(content, before, after, label) {
	if (content.includes(after)) return content;
	if (!content.includes(before)) {
		throw new Error(`Could not find migration block: ${label}`);
	}
	return content.replace(before, after);
}

function replaceRegex(content, regex, replacement, label, migratedMarker) {
	if (migratedMarker && content.includes(migratedMarker)) return content;
	if (!regex.test(content)) {
		throw new Error(`Could not find migration block: ${label}`);
	}
	return content.replace(regex, replacement);
}

function migrateWeaponInterface() {
	const relative = 'src/commands/commandList/battle/WeaponInterface.js';
	let content = read(relative);
	const original = content;

	content = replaceExact(
		content,
		"const mysql = require('../../../botHandlers/mysqlHandler.js');",
		"const weaponMongoPersistence = require('../../../utils/weaponMongoPersistence.js');",
		'WeaponInterface persistence import'
	);

	content = replaceRegex(
		content,
		/\tsaveTT\(\) \{[\s\S]*?\n\t\}\n\n\tgetEmoji\(quality\) \{/,
		"\tsaveTT() {\n\t\treturn weaponMongoPersistence.saveTakedownTracker.call(this);\n\t}\n\n\tgetEmoji(quality) {",
		'WeaponInterface.saveTT',
		'weaponMongoPersistence.saveTakedownTracker.call(this)'
	);

	content = replaceRegex(
		content,
		/\t\/\*\* Saves weapon to the db and return uwid \*\*\/\n\tasync save\(id\) \{[\s\S]*?\n\t\}\n\n\t\/\*\* Update weapon in db \*\*\//,
		"\t/** Saves weapon to MongoDB and returns uwid **/\n\tasync save(id) {\n\t\treturn weaponMongoPersistence.saveWeapon.call(this, id);\n\t}\n\n\t/** Update weapon in MongoDB **/",
		'WeaponInterface.save',
		'weaponMongoPersistence.saveWeapon.call(this, id)'
	);

	content = replaceRegex(
		content,
		/\t\/\*\* Update weapon in MongoDB \*\*\/\n\tasync update\(\) \{[\s\S]*?\n\t\}\n\n\tget shortenUWID\(\) \{/,
		"\t/** Update weapon in MongoDB **/\n\tasync update() {\n\t\treturn weaponMongoPersistence.updateWeapon.call(this);\n\t}\n\n\tget shortenUWID() {",
		'WeaponInterface.update',
		'weaponMongoPersistence.updateWeapon.call(this)'
	);

	if (content !== original) write(relative, content);
}

const weaponHelpers = `
async function getUserUid(id) {
	const users = await mongo.collection('user');
	const user = await users.findOne({ id: String(id) }, { projection: { uid: 1 } });
	return user?.uid;
}

function uniqueValues(values) {
	return [...new Set(values.filter((value) => value !== null && value !== undefined))];
}

async function hydrateWeaponRows(weaponDocs) {
	if (!weaponDocs?.length) return [];

	const uwids = uniqueValues(weaponDocs.map((weapon) => weapon.uwid));
	const uids = uniqueValues(weaponDocs.map((weapon) => weapon.uid));
	const pids = uniqueValues(weaponDocs.map((weapon) => weapon.pid));
	const passiveCollection = await mongo.collection('user_weapon_passive');
	const killCollection = await mongo.collection('user_weapon_kills');
	const animalCollection = await mongo.collection('animal');
	const userCollection = await mongo.collection('user');

	const [passives, kills, animals, users] = await Promise.all([
		uwids.length ? passiveCollection.find({ uwid: { $in: uwids } }).toArray() : [],
		uwids.length ? killCollection.find({ uwid: { $in: uwids } }).toArray() : [],
		pids.length ? animalCollection.find({ pid: { $in: pids } }).toArray() : [],
		uids.length
			? userCollection.find({ uid: { $in: uids } }, { projection: { uid: 1, id: 1 } }).toArray()
			: [],
	]);

	const passivesByWeapon = new Map();
	for (const passive of passives) {
		const key = String(passive.uwid);
		if (!passivesByWeapon.has(key)) passivesByWeapon.set(key, []);
		passivesByWeapon.get(key).push(passive);
	}
	for (const list of passivesByWeapon.values()) {
		list.sort((a, b) => Number(a.pcount || 0) - Number(b.pcount || 0));
	}

	const killsByWeapon = new Map(kills.map((kill) => [String(kill.uwid), kill]));
	const animalsByPid = new Map(animals.map((animal) => [String(animal.pid), animal]));
	const usersByUid = new Map(users.map((user) => [String(user.uid), String(user.id)]));
	const rows = [];

	for (const weapon of weaponDocs) {
		const key = String(weapon.uwid);
		const animal = weapon.pid === null || weapon.pid === undefined
			? null
			: animalsByPid.get(String(weapon.pid));
		const tracker = killsByWeapon.get(key);
		const base = {
			id: usersByUid.get(String(weapon.uid)),
			uwid: weapon.uwid,
			wid: weapon.wid,
			stat: String(weapon.stat || ''),
			rrcount: Number(weapon.rrcount || 0),
			rrattempt: Number(weapon.rrattempt || 0),
			wear: Number(weapon.wear || 0),
			favorite: Number(weapon.favorite || 0),
			pid: weapon.pid ?? null,
			tt: tracker ? weapon.uwid : null,
			kills: Number(tracker?.kills || 0),
			name: animal?.name,
			nickname: animal?.nickname,
		};
		const weaponPassives = passivesByWeapon.get(key) || [];
		if (!weaponPassives.length) {
			rows.push(base);
			continue;
		}
		for (const passive of weaponPassives) {
			rows.push({
				...base,
				pcount: Number(passive.pcount || 0),
				wpid: passive.wpid,
				pstat: String(passive.stat || ''),
			});
		}
	}
	return rows;
}

function buildWeaponFilter(uid, wid, widList) {
	const filter = { uid };
	const requested = wid !== undefined && wid !== null ? [wid] : widList;
	if (requested?.length) {
		const values = requested.map((value) => Number(value)).filter(Number.isFinite);
		if (values.length) filter.wid = { $in: values };
	}
	return filter;
}

function weaponSort(sort) {
	switch (sort) {
		case 'rarity':
			return { avg: -1, uwid: -1 };
		case 'type':
			return { wid: -1, avg: -1, uwid: -1 };
		case 'equipped':
			return { pid: -1, uwid: -1 };
		case 'favorite':
			return { favorite: -1, avg: -1, uwid: -1 };
		case 'wear':
			return { wear: -1, avg: -1, uwid: -1 };
		default:
			return { uwid: -1 };
	}
}

async function removeWeaponsAndCredit(p, uid, candidateUwids, priceEach) {
	candidateUwids = uniqueValues(candidateUwids.map(Number).filter(Number.isFinite));
	if (!candidateUwids.length) return { count: 0, total: 0, uwids: [] };

	const session = await mongo.startSession();
	try {
		session.startTransaction();
		const weaponsCollection = await mongo.collection('user_weapon');
		const passivesCollection = await mongo.collection('user_weapon_passive');
		const killsCollection = await mongo.collection('user_weapon_kills');
		const cowoncyCollection = await mongo.collection('cowoncy');
		const current = await weaponsCollection
			.find(
				{ uid, uwid: { $in: candidateUwids }, pid: null, favorite: { $ne: 1 } },
				{ session, projection: { uwid: 1 } }
			)
			.toArray();
		const currentSet = new Set(current.map((weapon) => Number(weapon.uwid)));
		const uwids = candidateUwids.filter((uwid) => currentSet.has(uwid));
		if (!uwids.length) {
			await session.abortTransaction();
			return { count: 0, total: 0, uwids: [] };
		}

		const deleted = await weaponsCollection.deleteMany(
			{ uid, uwid: { $in: uwids }, pid: null, favorite: { $ne: 1 } },
			{ session }
		);
		if (!deleted.deletedCount) {
			await session.abortTransaction();
			return { count: 0, total: 0, uwids: [] };
		}
		await passivesCollection.deleteMany({ uwid: { $in: uwids } }, { session });
		await killsCollection.deleteMany({ uwid: { $in: uwids } }, { session });

		const total = deleted.deletedCount * priceEach;
		await mongoNumeric.add(
			cowoncyCollection,
			{ id: String(p.msg.author.id) },
			'money',
			total,
			{ session, upsert: true }
		);
		await session.commitTransaction();
		return { count: deleted.deletedCount, total, uwids: uwids.slice(0, deleted.deletedCount) };
	} catch (err) {
		if (session.inTransaction()) await session.abortTransaction();
		throw err;
	} finally {
		await session.endSession();
	}
}
`;

function migrateWeaponUtil() {
	const relative = 'src/commands/commandList/battle/util/weaponUtil.js';
	let content = read(relative);
	const original = content;

	content = replaceExact(
		content,
		"const mysql = require('../../../../botHandlers/mysqlHandler.js');",
		"const mongo = require('../../../../utils/mongo.js');\nconst mongoNumeric = require('../../../../utils/mongoNumeric.js');",
		'weaponUtil persistence imports'
	);

	if (!content.includes('async function hydrateWeaponRows(weaponDocs)')) {
		const marker = "}, 0);\n\nconst getRandomWeapon";
		if (!content.includes(marker)) throw new Error('Could not insert weapon MongoDB helpers');
		content = content.replace(marker, `}, 0);\n${weaponHelpers}\nconst getRandomWeapon`);
	}

	content = replaceRegex(
		content,
		/exports\.getItems = async function \(p\) \{[\s\S]*?\n\};\n\nlet parseWeapon/,
		`exports.getItems = async function (p) {
	const uid = await p.global.getUid(p.msg.author.id);
	const collection = await mongo.collection('user_weapon');
	const result = await collection
		.aggregate([{ $match: { uid } }, { $group: { _id: '$wid', count: { $sum: 1 } } }])
		.toArray();
	const items = {};
	for (const row of result) {
		const key = row._id;
		if (weapons[key]) {
			items[key] = {
				id: Number(key) + 100,
				count: row.count,
				emoji: weapons[key].getEmoji,
			};
		}
	}
	return items;
};

let parseWeapon`,
		'weaponUtil.getItems',
		"aggregate([{ $match: { uid } }, { $group: { _id: '$wid'"
	);

	content = replaceRegex(
		content,
		/let getDisplayPage = async function \(p, user, page, sort, opt = \{\}\) \{[\s\S]*?\n\t\/\* Parse all weapons \*\/\n\tlet user_weapons = parseWeaponQuery\(result\[0\]\);/,
		`let getDisplayPage = async function (p, user, page, sort, opt = {}) {
	let { wid, widList } = opt;
	const uid = await getUserUid(user.id);
	if (uid === undefined || uid === null) {
		p.errorMsg(', you do not have any weapons, or the page is out of bounds', 3000);
		return;
	}

	const collection = await mongo.collection('user_weapon');
	const filter = buildWeaponFilter(uid, wid, widList);
	const totalCount = await collection.countDocuments(filter);
	if (!totalCount) {
		p.errorMsg(', you do not have any weapons, or the page is out of bounds', 3000);
		return;
	}

	const pipeline = [{ $match: filter }];
	if (sort === 'tt') {
		pipeline.push(
			{
				$lookup: {
					from: 'user_weapon_kills',
					localField: 'uwid',
					foreignField: 'uwid',
					as: '_tracker',
				},
			},
			{
				$addFields: {
					_trackerKills: { $ifNull: [{ $arrayElemAt: ['$_tracker.kills', 0] }, 0] },
				},
			},
			{ $sort: { _trackerKills: -1, uwid: -1 } }
		);
	} else {
		pipeline.push({ $sort: weaponSort(sort) });
	}
	pipeline.push({ $skip: page * weaponPerPage }, { $limit: weaponPerPage });
	const weaponDocs = await collection.aggregate(pipeline).toArray();
	if (!weaponDocs.length) {
		p.errorMsg(', you do not have any weapons, or the page is out of bounds', 3000);
		return;
	}
	const rows = await hydrateWeaponRows(weaponDocs);
	const nextPage = (page + 1) * weaponPerPage <= totalCount;
	const prevPage = page > 0;
	const maxPage = Math.ceil(totalCount / weaponPerPage);
	const sql = null;

	/* Parse all weapons */
	let user_weapons = parseWeaponQuery(rows);`,
		'weaponUtil.getDisplayPage',
		'const pipeline = [{ $match: filter }];'
	);

	content = replaceExact(
		content,
		"\t\tif (component === 'weapon_favorite') {\n\t\t\tlet sql = `UPDATE user_weapon SET favorite = 1 WHERE uwid = ${weapon.ruwid} AND uid = ${uid}`;\n\t\t\tawait p.query(sql);",
		"\t\tif (component === 'weapon_favorite') {\n\t\t\tconst userWeapons = await mongo.collection('user_weapon');\n\t\t\tawait userWeapons.updateOne({ uwid: weapon.ruwid, uid }, { $set: { favorite: 1 } });\n\t\t\tweapon.favorite = true;",
		'weapon favorite'
	);
	content = replaceExact(
		content,
		"\t\t} else if (component === 'weapon_unfavorite') {\n\t\t\tlet sql = `UPDATE user_weapon SET favorite = 0 WHERE uwid = ${weapon.ruwid} AND uid = ${uid}`;\n\t\t\tawait p.query(sql);",
		"\t\t} else if (component === 'weapon_unfavorite') {\n\t\t\tconst userWeapons = await mongo.collection('user_weapon');\n\t\t\tawait userWeapons.updateOne({ uwid: weapon.ruwid, uid }, { $set: { favorite: 0 } });\n\t\t\tweapon.favorite = false;",
		'weapon unfavorite'
	);

	content = replaceRegex(
		content,
		/exports\.equip = async function \(p, uwid, pet\) \{[\s\S]*?\n\};\n\nexports\.unequip/,
		`exports.equip = async function (p, uwid, pet) {
	const pid = await animalUtil.getPid(p.msg.author.id, pet);
	const uid = await p.global.getUid(p.msg.author.id);
	uwid = expandUWID(uwid);
	if (!uwid || !pid) return;

	const session = await mongo.startSession();
	try {
		session.startTransaction();
		const collection = await mongo.collection('user_weapon');
		await collection.updateMany({ uid, pid }, { $set: { pid: null } }, { session });
		const equipped = await collection.updateOne({ uid, uwid }, { $set: { pid } }, { session });
		if (!equipped.matchedCount) {
			await session.abortTransaction();
			return;
		}
		await session.commitTransaction();
	} catch (err) {
		if (session.inTransaction()) await session.abortTransaction();
		console.error(err);
		return;
	} finally {
		await session.endSession();
	}

	const { animal, nickname, weapon } =
		(await teamUtil.getBattleAnimal({ uwid }, p.msg.author.id)) || {};
	if (!animal || !weapon) return;

	p.replyMsg(
		weaponEmoji,
		p.replaceMentions(
			`, ${animal.value} **${nickname}** is now wielding ${weapon.emoji} **${weapon.name}**!`
		)
	);
	return true;
};

exports.unequip`,
		'weapon equip',
		'const session = await mongo.startSession();'
	);

	content = replaceExact(
		content,
		"\tconst uid = await p.global.getUid(p.msg.author.id);\n\tlet sql = `UPDATE IGNORE user_weapon SET pid = NULL WHERE uwid = ${uwid} AND uid = ${uid};`;\n\tawait p.query(sql);",
		"\tconst uid = await p.global.getUid(p.msg.author.id);\n\tconst userWeapons = await mongo.collection('user_weapon');\n\tawait userWeapons.updateOne({ uwid, uid }, { $set: { pid: null } });",
		'weapon unequip'
	);

	content = replaceRegex(
		content,
		/\/\* Sells a weapon \*\/\nexports\.sell = async function \(p, uwid\) \{[\s\S]*?\n\};\n\nlet sellRank/,
		`/* Sells a weapon */
exports.sell = async function (p, uwid) {
	uwid = uwid.toLowerCase();
	for (let i = 0; i < ranks.length; i++) {
		if (ranks[i].includes(uwid)) {
			await sellRank(p, i);
			return;
		}
	}

	uwid = expandUWID(uwid);
	if (!uwid) {
		p.errorMsg(', you do not have a weapon with this id!', 3000);
		return;
	}
	const weapon = await exports.getWeapon(uwid, p.msg.author.id);
	if (!weapon) {
		p.errorMsg(', you do not have a weapon with this id!', 3000);
		return;
	}
	if (weapon.animal?.name) {
		p.errorMsg(', please unequip the weapon to sell it!', 3000);
		return;
	}
	if (weapon.unsellable) {
		p.errorMsg(', This weapon cannot be sold!');
		return;
	}
	if (weapon.favorite) {
		p.errorMsg(', unfavorite this weapon to sell!');
		return;
	}

	const price = prices[weapon.rank.name];
	if (!price) {
		p.errorMsg(', Something went terribly wrong...');
		return;
	}
	const uid = await p.global.getUid(p.msg.author.id);
	const result = await removeWeaponsAndCredit(p, uid, [uwid], price);
	if (!result.count) {
		p.errorMsg(', you do not have a weapon with this id!', 3000);
		return;
	}

	p.replyMsg(
		weaponEmoji,
		`, You sold a(n) **${weapon.rank.name} ${weapon.name}**  ${weapon.rank.emoji}${weapon.emoji} for **${price}** cowoncy!`
	);
	p.logger.incr('cowoncy', price, { type: 'sell' }, p.msg);
};

let sellRank`,
		'weapon sell',
		'const result = await removeWeaponsAndCredit(p, uid, [uwid], price);'
	);

	content = replaceRegex(
		content,
		/let sellRank = \(exports\.sellRank = async function \(p, rankLoc\) \{[\s\S]*?\n\}\);\n\n\/\* Shorten a uwid/,
		`let sellRank = (exports.sellRank = async function (p, rankLoc) {
	let min = 0;
	let max = 0;
	for (let i = 0; i <= rankLoc; i++) {
		const rankInfo = WeaponInterface.ranks[i];
		min = max;
		max += rankInfo[0];
	}
	min *= 100;
	max *= 100;
	const lastRank = rankLoc == WeaponInterface.ranks.length - 1;
	const uid = await p.global.getUid(p.msg.author.id);
	const collection = await mongo.collection('user_weapon');
	const avg = min === 0 ? { $gte: min } : { $gt: min };
	if (!lastRank) avg.$lte = max;
	const weaponDocs = await collection
		.find({ uid, avg, pid: null, favorite: { $ne: 1 } })
		.limit(500)
		.toArray();
	if (!weaponDocs.length) {
		p.errorMsg(', you do not have any weapons with this rank!', 3000);
		return;
	}

	const rows = await hydrateWeaponRows(weaponDocs);
	const parsed = parseWeaponQuery(rows);
	const sellable = [];
	for (const key in parsed) {
		const weapon = parseWeapon(parsed[key]);
		if (weapon && !weapon.unsellable) sellable.push(weapon);
	}
	if (!sellable.length) {
		p.errorMsg(', you do not have any weapons with this rank!', 3000);
		return;
	}

	const priceEach = prices[WeaponInterface.ranks[rankLoc][1]];
	if (!priceEach) {
		p.errorMsg(', Something went terribly wrong...');
		return;
	}
	const byId = new Map(sellable.map((weapon) => [Number(weapon.ruwid), weapon]));
	const result = await removeWeaponsAndCredit(p, uid, [...byId.keys()], priceEach);
	if (!result.count) {
		p.errorMsg(', you do not have any weapons with this rank!', 3000);
		return;
	}
	const sold = result.uwids.map((id) => byId.get(Number(id))).filter(Boolean);
	const rank = `${WeaponInterface.ranks[rankLoc][2]} **${WeaponInterface.ranks[rankLoc][1]}**`;

	p.replyMsg(
		weaponEmoji,
		`, You sold all your ${rank} weapons for **${result.total}** cowoncy!\n${
			p.config.emoji.blank
		} **| Sold:** ${sold.map((weapon) => weapon.emoji).join('')}`
	);
	p.logger.incr('cowoncy', result.total, { type: 'sell' }, p.msg);
});

/* Shorten a uwid`,
		'weapon sellRank',
		'const rows = await hydrateWeaponRows(weaponDocs);'
	);

	content = replaceRegex(
		content,
		/exports\.getWeapon = async function \(uwid, id\) \{[\s\S]*?\n\};/,
		`exports.getWeapon = async function (uwid, id) {
	if (!uwid) return null;
	const collection = await mongo.collection('user_weapon');
	const filter = { uwid: Number(uwid) };
	if (id) {
		const uid = await getUserUid(id);
		if (uid === undefined || uid === null) return null;
		filter.uid = uid;
	}
	const document = await collection.findOne(filter);
	if (!document) return null;
	const rows = await hydrateWeaponRows([document]);
	const parsed = parseWeaponQuery(rows);
	const data = parsed[Object.keys(parsed)[0]];
	return data ? parseWeapon(data) : null;
};`,
		'weapon getWeapon',
		'const rows = await hydrateWeaponRows([document]);'
	);

	if (content !== original) write(relative, content);
}

function migrateAlterBattle() {
	const relative = 'src/commands/commandList/patreon/alterBattle.js';
	let content = read(relative);
	const original = content;
	content = replaceRegex(
		content,
		/\tconst sql = `SELECT alterbattle\.\* from alterbattle INNER JOIN user ON alterbattle\.uid = user\.uid WHERE user\.id = \$\{p\.msg\.author\.id\} AND alterbattle\.type = '\$\{type\}'`;\n\tconst result = \(await p\.query\(sql\)\)\[0\];/,
		"\tconst uid = await p.global.getUid(p.msg.author.id);\n\tconst alterBattle = await p.mongo.collection('alterbattle');\n\tconst result = await alterBattle.findOne({ uid, type });",
		'alterBattle custom result',
		"const alterBattle = await p.mongo.collection('alterbattle');"
	);
	if (content !== original) write(relative, content);
}

function printGiveXpReferences() {
	const src = path.join(root, 'src');
	const refs = [];
	function walk(dir) {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) walk(full);
			else if (entry.isFile() && entry.name.endsWith('.js')) {
				const text = fs.readFileSync(full, 'utf8');
				text.split('\n').forEach((line, index) => {
					if (line.includes('.giveXP(') || line.includes('giveXP(')) {
						refs.push(`${path.relative(root, full)}:${index + 1}: ${line.trim()}`);
					}
				});
			}
		}
	}
	walk(src);
	console.log('giveXP references:');
	refs.forEach((ref) => console.log(`  ${ref}`));
}

migrateWeaponInterface();
migrateWeaponUtil();
migrateAlterBattle();
printGiveXpReferences();
console.log(`MongoDB weapon codemod changed ${changed} file(s).`);
