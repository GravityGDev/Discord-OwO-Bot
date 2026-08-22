/*
 * OwO Bot for Discord
 * MongoDB connection and index management.
 */

const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
const databaseName = process.env.MONGODB_DB || process.env.MONGO_DB || 'owo';

let client;
let database;
let connectionPromise;
let indexesReady = false;

function createClient() {
	if (!uri) {
		throw new Error(
			'Missing MongoDB connection string. Set MONGODB_URI (preferred) or MONGO_URI.'
		);
	}

	return new MongoClient(uri, {
		maxPoolSize: Number(process.env.MONGODB_MAX_POOL_SIZE || 30),
		minPoolSize: Number(process.env.MONGODB_MIN_POOL_SIZE || 0),
		serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT || 10000),
	});
}

async function ensureIndexes(db) {
	if (indexesReady) return;

	await Promise.all([
		db.collection('redis_hashes').createIndex({ key: 1, field: 1 }, { unique: true }),
		db.collection('redis_hashes').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
		db.collection('redis_sorted_sets').createIndex({ set: 1, member: 1 }, { unique: true }),
		db.collection('redis_sorted_sets').createIndex({ set: 1, score: -1, member: -1 }),
		db.collection('redis_sorted_sets').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
		db.collection('redis_sets').createIndex({ set: 1, value: 1 }, { unique: true }),
		db.collection('redis_sets').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
		db.collection('pubsub_events').createIndex({ createdAt: 1 }, { expireAfterSeconds: 300 }),
		db.collection('rules').createIndex({ opinion: 1 }),
	]);

	indexesReady = true;
}

async function connect() {
	if (database) return database;
	if (connectionPromise) return connectionPromise;

	connectionPromise = (async () => {
		client = createClient();
		await client.connect();
		database = client.db(databaseName);
		await ensureIndexes(database);
		console.log(`[MongoDB] Connected to database ${databaseName}`);
		return database;
	})().catch((err) => {
		connectionPromise = null;
		client = null;
		database = null;
		throw err;
	});

	return connectionPromise;
}

async function collection(name) {
	const db = await connect();
	return db.collection(name);
}

async function startSession() {
	await connect();
	return client.startSession();
}

async function close() {
	if (client) await client.close();
	client = null;
	database = null;
	connectionPromise = null;
	indexesReady = false;
}

function getClient() {
	return client;
}

function getDatabaseName() {
	return databaseName;
}

module.exports = {
	connect,
	collection,
	startSession,
	close,
	getClient,
	getDatabaseName,
};
