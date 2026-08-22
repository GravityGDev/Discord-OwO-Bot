/* eslint-disable no-console */
const assert = require('assert');
const mongo = require('../src/utils/mongo.js');
const mongoNumeric = require('../src/utils/mongoNumeric.js');

const testIds = ['mongo-smoke-balance', 'mongo-smoke-transaction'];

async function main() {
	const db = await mongo.connect();
	const hello = await db.admin().command({ hello: 1 });
	assert.strictEqual(hello.setName, 'rs0', 'Smoke MongoDB must be running as replica set rs0');
	assert.strictEqual(Boolean(hello.isWritablePrimary), true, 'Smoke MongoDB must have a writable primary');

	const cowoncy = await mongo.collection('cowoncy');
	const smokeTransactions = await mongo.collection('runtime_smoke_transactions');
	await cowoncy.deleteMany({ id: { $in: testIds } });
	await smokeTransactions.deleteMany({ smoke: true });

	// Verify the runtime indexes created by mongo.connect().
	const cowoncyIndexes = await cowoncy.indexes();
	const idIndex = cowoncyIndexes.find((index) => index.key?.id === 1);
	assert(idIndex, 'Expected cowoncy.id runtime index');
	assert.strictEqual(idIndex.unique, true, 'cowoncy.id must remain unique');

	// Verify precision well beyond Number.MAX_SAFE_INTEGER.
	const startingBalance = '900719925474099312345';
	await cowoncy.insertOne({ id: testIds[0], money: startingBalance });
	await mongoNumeric.add(cowoncy, { id: testIds[0] }, 'money', '5');
	let balance = await cowoncy.findOne({ id: testIds[0] });
	assert.strictEqual(balance.money, '900719925474099312350');

	let changed = await mongoNumeric.subtractIfEnough(
		cowoncy,
		{ id: testIds[0] },
		'money',
		'50'
	);
	assert.strictEqual(changed.modifiedCount, 1, 'Expected affordable subtraction to succeed');
	balance = await cowoncy.findOne({ id: testIds[0] });
	assert.strictEqual(balance.money, '900719925474099312300');

	changed = await mongoNumeric.subtractIfEnough(
		cowoncy,
		{ id: testIds[0] },
		'money',
		'900719925474099312301'
	);
	assert.strictEqual(changed.modifiedCount, 0, 'Expected unaffordable subtraction to be rejected');
	balance = await cowoncy.findOne({ id: testIds[0] });
	assert.strictEqual(balance.money, '900719925474099312300');

	// Verify a real multi-document transaction commits atomically.
	const session = await mongo.startSession();
	try {
		await session.withTransaction(async () => {
			await mongoNumeric.add(
				cowoncy,
				{ id: testIds[1] },
				'money',
				'12345678901234567890',
				{ session, upsert: true },
				{ id: testIds[1] }
			);
			await smokeTransactions.insertOne(
				{ smoke: true, state: 'committed', createdAt: new Date() },
				{ session }
			);
		});

		const committedBalance = await cowoncy.findOne({ id: testIds[1] });
		assert.strictEqual(committedBalance.money, '12345678901234567890');
		assert(await smokeTransactions.findOne({ smoke: true, state: 'committed' }));

		// Verify aborted work is not visible after rollback.
		session.startTransaction();
		await smokeTransactions.insertOne(
			{ smoke: true, state: 'aborted', createdAt: new Date() },
			{ session }
		);
		await mongoNumeric.add(cowoncy, { id: testIds[1] }, 'money', '10', { session });
		await session.abortTransaction();

		assert.strictEqual(
			await smokeTransactions.countDocuments({ smoke: true, state: 'aborted' }),
			0,
			'Aborted transaction document must not persist'
		);
		const rolledBackBalance = await cowoncy.findOne({ id: testIds[1] });
		assert.strictEqual(rolledBackBalance.money, '12345678901234567890');
	} finally {
		await session.endSession();
	}

	console.log('MongoDB runtime smoke test passed: indexes, exact arithmetic and transactions are healthy.');
}

main()
	.catch((err) => {
		console.error(err);
		process.exitCode = 1;
	})
	.finally(async () => {
		try {
			const cowoncy = await mongo.collection('cowoncy');
			const smokeTransactions = await mongo.collection('runtime_smoke_transactions');
			await cowoncy.deleteMany({ id: { $in: testIds } });
			await smokeTransactions.deleteMany({ smoke: true });
		} catch (err) {
			console.error('Smoke cleanup failed:', err);
		}
		await mongo.close();
	});
