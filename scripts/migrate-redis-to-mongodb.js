/* eslint-disable no-console */
require('dotenv').config();

const redis = require('redis');
const mongo = require('../src/utils/mongo.js');

const client = redis.createClient({
	host: process.env.REDIS_HOST,
	port: process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : undefined,
	password: process.env.REDIS_PASS,
});

function call(method, ...args) {
	return new Promise((resolve, reject) => {
		client[method](...args, (err, result) => {
			if (err) reject(err);
			else resolve(result);
		});
	});
}

function closeRedis() {
	return new Promise((resolve) => {
		client.quit(() => resolve());
	});
}

async function scanKeys() {
	const keys = [];
	let cursor = '0';
	do {
		const result = await call('scan', cursor, 'COUNT', 500);
		cursor = String(result[0]);
		keys.push(...result[1]);
	} while (cursor !== '0');
	return keys;
}

async function expiresAtFor(key) {
	const ttl = Number(await call('ttl', key));
	if (ttl > 0) return new Date(Date.now() + ttl * 1000);
	return null;
}

async function migrateHash(db, key, expiresAt) {
	const values = await call('hgetall', key);
	const collection = db.collection('redis_hashes');
	await collection.deleteMany({ key: String(key) });
	if (!values || !Object.keys(values).length) return 0;

	const documents = Object.entries(values).map(([field, value]) => ({
		key: String(key),
		field: String(field),
		value: String(value),
		...(expiresAt ? { expiresAt } : {}),
	}));
	await collection.insertMany(documents, { ordered: false });
	return documents.length;
}

async function migrateSortedSet(db, key, expiresAt) {
	const values = await call('zrange', key, 0, -1, 'WITHSCORES');
	const collection = db.collection('redis_sorted_sets');
	await collection.deleteMany({ set: String(key) });
	if (!values.length) return 0;

	const documents = [];
	for (let i = 0; i < values.length; i += 2) {
		documents.push({
			set: String(key),
			member: String(values[i]),
			score: Number(values[i + 1]),
			...(expiresAt ? { expiresAt } : {}),
		});
	}
	await collection.insertMany(documents, { ordered: false });
	return documents.length;
}

async function migrateSet(db, key, expiresAt) {
	const values = await call('smembers', key);
	const collection = db.collection('redis_sets');
	await collection.deleteMany({ set: String(key) });
	if (!values.length) return 0;

	const documents = values.map((value) => ({
		set: String(key),
		value: String(value),
		...(expiresAt ? { expiresAt } : {}),
	}));
	await collection.insertMany(documents, { ordered: false });
	return documents.length;
}

async function main() {
	console.log('Starting Redis -> MongoDB migration');
	const db = await mongo.connect();
	const keys = await scanKeys();
	console.log(`Found ${keys.length.toLocaleString()} Redis keys`);

	let migrated = 0;
	let skipped = 0;
	for (let i = 0; i < keys.length; i++) {
		const key = keys[i];
		const type = await call('type', key);
		const expiresAt = await expiresAtFor(key);
		let count = 0;

		if (type === 'hash') count = await migrateHash(db, key, expiresAt);
		else if (type === 'zset') count = await migrateSortedSet(db, key, expiresAt);
		else if (type === 'set') count = await migrateSet(db, key, expiresAt);
		else {
			skipped++;
			console.warn(`Skipping unsupported Redis type ${type} for key ${key}`);
			continue;
		}

		migrated++;
		console.log(`[${i + 1}/${keys.length}] ${key} (${type}, ${count} entries)`);
	}

	console.log(`Redis migration complete: ${migrated} keys migrated, ${skipped} skipped.`);
}

main()
	.catch((err) => {
		console.error(err);
		process.exitCode = 1;
	})
	.finally(async () => {
		await Promise.allSettled([closeRedis(), mongo.close()]);
	});
