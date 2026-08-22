/*
 * Atomic sequence helper used to replace MySQL AUTO_INCREMENT values.
 */

const mongo = require('./mongo.js');

async function collection() {
	return mongo.collection('counters');
}

exports.seedAtLeast = async function (name, value) {
	const counters = await collection();
	await counters.updateOne(
		{ _id: String(name) },
		{ $max: { value: Number(value) || 0 } },
		{ upsert: true }
	);
};

exports.next = async function (name) {
	const counters = await collection();
	const result = await counters.findOneAndUpdate(
		{ _id: String(name) },
		{ $inc: { value: 1 } },
		{ upsert: true, returnDocument: 'after' }
	);

	// MongoDB Node driver 5 returns a ModifyResult with `.value`.
	const document = result && result.value && typeof result.value === 'object' ? result.value : result;
	if (!document || typeof document.value !== 'number') {
		throw new Error(`Could not allocate MongoDB counter: ${name}`);
	}
	return document.value;
};
