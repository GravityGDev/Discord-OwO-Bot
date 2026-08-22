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
		db.collection('user').createIndex({ id: 1 }, { unique: true }),
		db.collection('user').createIndex({ uid: 1 }, { unique: true }),
		db.collection('cowoncy').createIndex({ id: 1 }, { unique: true }),
		db.collection('cowoncy_limit').createIndex({ id: 1 }, { unique: true }),
		db.collection('transaction').createIndex({ sender: 1, createdAt: -1 }),
		db.collection('transaction').createIndex({ reciever: 1, createdAt: -1 }),
		db.collection('animal').createIndex({ id: 1, name: 1 }, { unique: true }),
		db.collection('animal').createIndex({ pid: 1 }, { unique: true, sparse: true }),
		db.collection('quest').createIndex({ uid: 1, qid: 1 }, { unique: true }),
		db.collection('quest').createIndex({ uid: 1, qname: 1, locked: 1 }),
		db.collection('timers').createIndex({ uid: 1 }, { unique: true }),
		db.collection('compensation').createIndex({ end_date: 1 }),
		db.collection('user_compensation').createIndex({ uid: 1, cid: 1 }, { unique: true }),
		db.collection('lootbox').createIndex({ id: 1 }, { unique: true }),
		db.collection('survey').createIndex({ sid: -1 }),
		db.collection('survey_question').createIndex({ sid: 1, number: 1 }, { unique: true }),
		db.collection('user_survey').createIndex({ uid: 1 }, { unique: true }),
		db.collection('disabled').createIndex({ channel: 1, command: 1 }, { unique: true }),
		db.collection('timeout').createIndex({ id: 1 }),
		db.collection('user_ban').createIndex({ id: 1, command: 1 }, { unique: true }),
		db.collection('emoji_steal').createIndex({ uid: 1 }),

		// Battle/team/weapon access patterns.
		db.collection('user_weapon').createIndex({ uid: 1, uwid: 1 }),
		db.collection('user_weapon').createIndex({ uid: 1, avg: -1, pid: 1, favorite: 1 }),
		db.collection('user_weapon').createIndex({ pid: 1 }),
		db.collection('user_weapon_passive').createIndex({ uwid: 1, pcount: 1 }),
		db.collection('user_weapon_kills').createIndex({ uwid: 1 }),
		db.collection('pet_team').createIndex({ uid: 1, disabled: 1, pgid: 1 }),
		db.collection('pet_team_active').createIndex({ uid: 1 }),
		db.collection('pet_team_active').createIndex({ pgid: 1 }),
		db.collection('pet_team_animal').createIndex({ pgid: 1, pos: 1 }),
		db.collection('pet_team_animal').createIndex({ pid: 1 }),
		db.collection('user_battle').createIndex({ uid: 1 }),
		db.collection('battle_setting').createIndex({ uid: 1 }),
		db.collection('crate').createIndex({ uid: 1, cratetype: 1 }),
		db.collection('shards').createIndex({ uid: 1 }),

		// Gambling access patterns.
		db.collection('lottery').createIndex({ valid: 1, id: 1 }),
		db.collection('cowoncydrop').createIndex({ channel: 1 }),

		// Supporter/customization access patterns.
		db.collection('patreons').createIndex({ uid: 1 }),
		db.collection('patreon_wh').createIndex({ uid: 1, endDate: -1 }),
		db.collection('patreon_discord').createIndex({ uid: 1 }),
		db.collection('alter').createIndex({ uid: 1, command: 1, type: 1 }),
		db.collection('alterbattle').createIndex({ uid: 1, type: 1 }),
		db.collection('alterhunt').createIndex({ uid: 1, type: 1 }),
		db.collection('pizza').createIndex({ uid: 1 }),
		db.collection('icecream').createIndex({ uid: 1 }),
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
