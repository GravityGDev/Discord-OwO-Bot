/* eslint-disable no-console */
require('dotenv').config();

const crypto = require('crypto');
const mongo = require('../src/utils/mongo.js');

function required(name, aliases = []) {
	for (const key of [name, ...aliases]) {
		if (process.env[key]) return process.env[key];
	}
	throw new Error(`Missing required environment variable: ${name}`);
}

function status(name) {
	return process.env[name] ? 'configured' : 'disabled';
}

async function verifyTransactions() {
	const session = await mongo.startSession();
	const collection = await mongo.collection('runtime_preflight');
	const id = `preflight-${crypto.randomBytes(8).toString('hex')}`;
	try {
		session.startTransaction();
		await collection.insertOne({ _id: id, createdAt: new Date() }, { session });
		await session.abortTransaction();
		const leaked = await collection.findOne({ _id: id });
		if (leaked) {
			await collection.deleteOne({ _id: id });
			throw new Error('MongoDB transaction rollback verification failed.');
		}
	} finally {
		if (session.inTransaction()) await session.abortTransaction();
		await session.endSession();
	}
}

async function main() {
	required('BOT_TOKEN');
	required('MONGODB_URI', ['MONGO_URI']);

	console.log('[Preflight] Required environment variables are present.');
	await mongo.connect();

	const animals = await mongo.collection('animals');
	const animalCount = await animals.countDocuments();
	if (!animalCount) {
		throw new Error(
			'MongoDB has no base animal definitions. Run `npm run seed:mongo-static` or import the old database before starting the bot.'
		);
	}

	await verifyTransactions();

	console.log(`[Preflight] MongoDB connected to ${mongo.getDatabaseName()}.`);
	console.log(`[Preflight] Found ${animalCount} animal definitions.`);
	console.log('[Preflight] Replica-set transaction rollback verified.');
	console.log(`[Preflight] DBL: ${status('DBL_TOKEN')}`);
	console.log(`[Preflight] Stream socket: ${status('STREAM_SOCKET')}`);
	console.log(`[Preflight] Snail socket: ${status('SNAIL_SOCKET')}`);
	console.log(`[Preflight] InfluxDB: ${status('INFLUXDB_HOST')}`);
	console.log(`[Preflight] Image generator: ${status('GEN_API_HOST')}`);
	console.log('[Preflight] Runtime prerequisites passed.');
}

main()
	.catch((err) => {
		console.error('[Preflight] FAILED');
		console.error(err);
		process.exitCode = 1;
	})
	.finally(async () => {
		await mongo.close();
	});
