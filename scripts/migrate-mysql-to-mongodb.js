/* eslint-disable no-console */
require('dotenv').config();

const crypto = require('crypto');
const mysql = require('mysql');
const mongo = require('../src/utils/mongo.js');

const batchSize = Math.max(100, Number(process.env.MONGODB_MIGRATION_BATCH_SIZE || 2000));

const pool = mysql.createPool({
	host: process.env.MYSQL_HOST,
	user: process.env.MYSQL_USER,
	password: process.env.MYSQL_PASS,
	database: process.env.MYSQL_DATABASE || 'owo',
	supportBigNumbers: true,
	bigNumberStrings: true,
	charset: 'utf8mb4',
	connectionLimit: 2,
});

function query(sql, params = []) {
	return new Promise((resolve, reject) => {
		pool.query(sql, params, (err, result) => {
			if (err) reject(err);
			else resolve(result);
		});
	});
}

function closeMysql() {
	return new Promise((resolve, reject) => {
		pool.end((err) => (err ? reject(err) : resolve()));
	});
}

async function getTables() {
	const rows = await query('SHOW TABLES;');
	return rows.map((row) => String(Object.values(row)[0]));
}

async function getPrimaryKey(table) {
	const rows = await query(`SHOW INDEX FROM ${mysql.escapeId(table)} WHERE Key_name = 'PRIMARY';`);
	return rows
		.sort((a, b) => Number(a.Seq_in_index) - Number(b.Seq_in_index))
		.map((row) => String(row.Column_name));
}

function stableValue(value) {
	if (Buffer.isBuffer(value)) return value.toString('base64');
	if (value instanceof Date) return value.toISOString();
	return value;
}

function legacyId(table, row, primaryKey) {
	if (primaryKey.length) {
		const values = primaryKey.map((column) => stableValue(row[column]));
		return `${table}:${values.map((value) => encodeURIComponent(String(value))).join(':')}`;
	}

	const normalized = {};
	for (const key of Object.keys(row).sort()) normalized[key] = stableValue(row[key]);
	const hash = crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
	return `${table}:sha256:${hash}`;
}

function toDocument(table, row, primaryKey) {
	return {
		_id: legacyId(table, row, primaryKey),
		...row,
		_legacyTable: table,
		_migratedAt: new Date(),
	};
}

async function writeBatch(collection, table, rows, primaryKey) {
	if (!rows.length) return;
	await collection.bulkWrite(
		rows.map((row) => {
			const document = toDocument(table, row, primaryKey);
			const id = document._id;
			delete document._id;
			return {
				updateOne: {
					filter: { _id: id },
					update: {
						$set: document,
						$setOnInsert: { _id: id },
					},
					upsert: true,
				},
			};
		}),
		{ ordered: false }
	);
}

async function ensurePrimaryIndex(collection, primaryKey) {
	if (!primaryKey.length) return;
	const index = {};
	for (const column of primaryKey) index[column] = 1;
	try {
		await collection.createIndex(index, { unique: true });
	} catch (err) {
		console.warn(`  Could not create unique primary-key index: ${err.message}`);
	}
}

async function migrateTable(db, table) {
	if (table === 'rules') return;

	const collection = db.collection(table);
	const primaryKey = await getPrimaryKey(table);
	await ensurePrimaryIndex(collection, primaryKey);

	let total = 0;
	let offset = 0;
	let lastPrimaryValue;
	const singlePrimaryKey = primaryKey.length === 1 ? primaryKey[0] : null;

	console.log(`Migrating ${table}${primaryKey.length ? ` [PK: ${primaryKey.join(', ')}]` : ''}...`);

	while (true) {
		let rows;
		if (singlePrimaryKey) {
			const column = mysql.escapeId(singlePrimaryKey);
			const where = lastPrimaryValue === undefined ? '' : `WHERE ${column} > ?`;
			const params = lastPrimaryValue === undefined ? [] : [lastPrimaryValue];
			rows = await query(
				`SELECT * FROM ${mysql.escapeId(table)} ${where} ORDER BY ${column} ASC LIMIT ${batchSize};`,
				params
			);
		} else {
			rows = await query(
				`SELECT * FROM ${mysql.escapeId(table)} LIMIT ${batchSize} OFFSET ${offset};`
			);
		}

		if (!rows.length) break;
		await writeBatch(collection, table, rows, primaryKey);
		total += rows.length;

		if (singlePrimaryKey) lastPrimaryValue = rows[rows.length - 1][singlePrimaryKey];
		else offset += rows.length;

		console.log(`  ${total.toLocaleString()} rows`);
		if (rows.length < batchSize) break;
	}

	console.log(`Finished ${table}: ${total.toLocaleString()} rows`);
}

async function migrateRules(db) {
	console.log('Migrating rules with Discord user IDs...');
	const rows = await query(
		'SELECT u.id AS discordId, r.opinion FROM rules r INNER JOIN user u ON u.uid = r.uid;'
	);
	const collection = db.collection('rules');

	if (rows.length) {
		await collection.bulkWrite(
			rows.map((row) => ({
				updateOne: {
					filter: { _id: String(row.discordId) },
					update: {
						$set: {
							opinion: Number(row.opinion),
							migratedAt: new Date(),
						},
					},
					upsert: true,
				},
			})),
			{ ordered: false }
		);
	}
	console.log(`Finished rules: ${rows.length.toLocaleString()} rows`);
}

async function seedCounterFromCollection(db, counterName, collectionName, field) {
	const latest = await db.collection(collectionName).find().sort({ [field]: -1 }).limit(1).next();
	const value = Number(latest?.[field] || 0);
	await db.collection('counters').updateOne(
		{ _id: counterName },
		{ $max: { value } },
		{ upsert: true }
	);
	console.log(`Seeded counter ${counterName} at ${value}`);
}

async function ensureRuntimeIndexes(db) {
	const jobs = [];
	jobs.push(db.collection('user').createIndex({ uid: 1 }, { unique: true }));
	jobs.push(db.collection('animal').createIndex({ pid: 1 }, { unique: true, sparse: true }));
	await Promise.all(jobs);
}

async function seedRuntimeCounters(db, tables) {
	if (tables.includes('user')) {
		await seedCounterFromCollection(db, 'user_uid', 'user', 'uid');
	}
	if (tables.includes('animal')) {
		await seedCounterFromCollection(db, 'animal_pid', 'animal', 'pid');
	}
}

async function main() {
	console.log('Starting MySQL/MariaDB -> MongoDB migration');
	console.log(`Batch size: ${batchSize.toLocaleString()}`);

	const db = await mongo.connect();
	const tables = await getTables();
	console.log(`Found ${tables.length} SQL tables`);

	for (const table of tables) await migrateTable(db, table);
	if (tables.includes('rules') && tables.includes('user')) await migrateRules(db);
	await ensureRuntimeIndexes(db);
	await seedRuntimeCounters(db, tables);

	console.log('SQL data migration complete.');
}

main()
	.catch((err) => {
		console.error(err);
		process.exitCode = 1;
	})
	.finally(async () => {
		await Promise.allSettled([closeMysql(), mongo.close()]);
	});
