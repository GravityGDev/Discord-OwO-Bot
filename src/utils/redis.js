/*
 * Compatibility cache used by the existing bot code.
 *
 * This intentionally keeps the old Redis-shaped API while storing all state
 * in MongoDB. That lets command modules migrate independently without keeping
 * a Redis service online during the transition.
 */

const mongo = require('./mongo.js');

const HASH_COLLECTION = 'redis_hashes';
const SORTED_SET_COLLECTION = 'redis_sorted_sets';
const SET_COLLECTION = 'redis_sets';

const stringify = (value) => {
	if (value === undefined || value === null) return '';
	return String(value);
};

async function hashes() {
	return mongo.collection(HASH_COLLECTION);
}

async function sortedSets() {
	return mongo.collection(SORTED_SET_COLLECTION);
}

async function sets() {
	return mongo.collection(SET_COLLECTION);
}

exports.hgetall = async function (key) {
	const collection = await hashes();
	const rows = await collection.find({ key: String(key) }).toArray();
	if (!rows.length) return null;

	const result = {};
	for (const row of rows) result[row.field] = row.value;
	return result;
};

exports.hget = async function (table, key) {
	const collection = await hashes();
	const row = await collection.findOne({ key: String(table), field: String(key) });
	return row ? row.value : null;
};

exports.hset = async function (table, key, val = 1) {
	const collection = await hashes();
	const result = await collection.updateOne(
		{ key: String(table), field: String(key) },
		{ $set: { value: stringify(val) } },
		{ upsert: true }
	);
	return result.upsertedCount ? 1 : 0;
};

exports.hdel = async function (table, key) {
	const collection = await hashes();
	const result = await collection.deleteOne({ key: String(table), field: String(key) });
	return result.deletedCount;
};

exports.hmget = async function (key, field) {
	const fields = Array.isArray(field) ? field.map(String) : [String(field)];
	const collection = await hashes();
	const rows = await collection
		.find({ key: String(key), field: { $in: fields } })
		.toArray();
	const values = new Map(rows.map((row) => [row.field, row.value]));
	return fields.map((name) => (values.has(name) ? values.get(name) : null));
};

exports.hmset = async function (key, val) {
	let entries;
	if (Array.isArray(val)) {
		entries = [];
		for (let i = 0; i < val.length; i += 2) entries.push([val[i], val[i + 1]]);
	} else if (val && typeof val === 'object') {
		entries = Object.entries(val);
	} else {
		throw new TypeError('hmset expects an object or a flat field/value array');
	}

	if (!entries.length) return 'OK';
	const collection = await hashes();
	await collection.bulkWrite(
		entries.map(([field, value]) => ({
			updateOne: {
				filter: { key: String(key), field: String(field) },
				update: { $set: { value: stringify(value) } },
				upsert: true,
			},
		})),
		{ ordered: false }
	);
	return 'OK';
};

exports.hincrby = async function (table, key, val = 1) {
	const collection = await hashes();
	const filter = { key: String(table), field: String(key) };
	await collection.updateOne(
		filter,
		[
			{
				$set: {
					key: String(table),
					field: String(key),
					value: {
						$toString: {
							$add: [
								{
									$convert: {
										input: '$value',
										to: 'long',
										onError: 0,
										onNull: 0,
									},
								},
								Number(val),
							],
						},
					},
				},
			},
		],
		{ upsert: true }
	);
	const row = await collection.findOne(filter);
	return Number(row.value);
};

// The old adapter exposed `incr` as a sorted-set increment (ZINCRBY).
exports.incr = async function (table, key, val = 1) {
	const collection = await sortedSets();
	const filter = { set: String(table), member: String(key) };
	await collection.updateOne(filter, { $inc: { score: Number(val) } }, { upsert: true });
	const row = await collection.findOne(filter);
	return String(row.score);
};

async function getRange(table, min, max) {
	const start = Math.max(0, Number(min) || 0);
	const numericMax = Number(max);
	if (numericMax >= 0 && numericMax < start) return [];

	const collection = await sortedSets();
	let cursor = collection
		.find({ set: String(table) })
		.sort({ score: -1, member: -1 })
		.skip(start);

	if (numericMax >= 0) cursor = cursor.limit(numericMax - start + 1);

	const rows = await cursor.toArray();
	const result = [];
	for (const row of rows) result.push(row.member, String(row.score));
	return result;
}

exports.getTop = function (table, count = 5) {
	const total = Number(count);
	if (total <= 0) return Promise.resolve([]);
	return getRange(table, 0, total - 1);
};

exports.getRange = getRange;

exports.zscore = async function (table, id) {
	const collection = await sortedSets();
	const row = await collection.findOne({ set: String(table), member: String(id) });
	return row ? String(row.score) : null;
};

exports.getXP = exports.zscore;

exports.getRank = async function (table, id) {
	const collection = await sortedSets();
	const member = String(id);
	const row = await collection.findOne({ set: String(table), member });
	if (!row) return null;

	return collection.countDocuments({
		set: String(table),
		$or: [
			{ score: { $gt: row.score } },
			{ score: row.score, member: { $gt: member } },
		],
	});
};

exports.sadd = async function (table, value) {
	const collection = await sets();
	const result = await collection.updateOne(
		{ set: String(table), value: stringify(value) },
		{ $setOnInsert: { set: String(table), value: stringify(value) } },
		{ upsert: true }
	);
	return result.upsertedCount ? 1 : 0;
};

exports.del = async function (table) {
	const key = String(table);
	const [hashResult, sortedResult, setResult] = await Promise.all([
		(await hashes()).deleteMany({ key }),
		(await sortedSets()).deleteMany({ set: key }),
		(await sets()).deleteMany({ set: key }),
	]);
	return hashResult.deletedCount + sortedResult.deletedCount + setResult.deletedCount > 0 ? 1 : 0;
};

exports.expire = async function (key, timer = 259200) {
	const expiresAt = new Date(Date.now() + Number(timer) * 1000);
	const name = String(key);
	const [hashResult, sortedResult, setResult] = await Promise.all([
		(await hashes()).updateMany({ key: name }, { $set: { expiresAt } }),
		(await sortedSets()).updateMany({ set: name }, { $set: { expiresAt } }),
		(await sets()).updateMany({ set: name }, { $set: { expiresAt } }),
	]);
	return hashResult.matchedCount + sortedResult.matchedCount + setResult.matchedCount > 0 ? 1 : 0;
};

exports.zrem = async function (table, key) {
	const collection = await sortedSets();
	const result = await collection.deleteOne({ set: String(table), member: String(key) });
	return result.deletedCount;
};

// Kept for callers that only inspect whether a backing client exists.
Object.defineProperty(exports, 'client', {
	enumerable: true,
	get: () => mongo.getClient(),
});
