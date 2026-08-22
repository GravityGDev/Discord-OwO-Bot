/* eslint-disable no-console */
require('dotenv').config();

const mongo = require('../src/utils/mongo.js');

const animals = [
	{ name: ':bee:', rank: 'common', hp: 1, att: 5, pr: 2, wp: 3, mag: 3, mr: 1, description: 'How do bees go to school?\n~   On the school buzz!', alt: 'bee,wasp' },
	{ name: ':beetle:', rank: 'common', hp: 4, att: 2, pr: 2, wp: 3, mag: 2, mr: 2, description: 'Are they all female?', alt: 'beetle,ladybug' },
	{ name: ':bug:', rank: 'common', hp: 3, att: 2, pr: 2, wp: 4, mag: 2, mr: 2, description: "It's a worm.", alt: 'bug,worm,caterpillar' },
	{ name: ':butterfly:', rank: 'common', hp: 1, att: 1, pr: 1, wp: 5, mag: 5, mr: 2, description: 'Why did you throw butter out the window?\n~ To see a butter fly!', alt: 'butterfly' },
	{ name: ':snail:', rank: 'common', hp: 8, att: 1, pr: 2, wp: 3, mag: 5, mr: 1, description: 'The slowest animal, but the toughest in the zoo', alt: 'snail,slug' },
	{ name: ':baby_chick:', rank: 'uncommon', hp: 3, att: 2, pr: 3, wp: 3, mag: 3, mr: 2, description: "chirp chirp! It's so cute!", alt: 'chick,baby_chick' },
	{ name: ':chipmunk:', rank: 'uncommon', hp: 3, att: 5, pr: 2, wp: 3, mag: 2, mr: 1, description: "Don't mess with them.", alt: 'chipmunk,squirrel' },
	{ name: ':mouse2:', rank: 'uncommon', hp: 3, att: 3, pr: 2, wp: 3, mag: 3, mr: 2, description: '~~sqeak~~ squeak!', alt: 'mouse,mouse2,rat' },
	{ name: ':rabbit2:', rank: 'uncommon', hp: 3, att: 4, pr: 2, wp: 3, mag: 2, mr: 2, description: "There's a ton of them.", alt: 'rabbit,rabbit2,bunny' },
	{ name: ':rooster:', rank: 'uncommon', hp: 3, att: 4, pr: 3, wp: 2, mag: 2, mr: 2, description: 'The alarm cluck', alt: 'chicken,rooster' },
	{ name: ':cat2:', rank: 'rare', hp: 3, att: 1, pr: 1, wp: 6, mag: 3, mr: 3, description: 'They shoot lazers.', alt: 'cat,cat2,kitty,kitten' },
	{ name: ':cow2:', rank: 'rare', hp: 5, att: 4, pr: 3, wp: 1, mag: 1, mr: 3, description: 'Some say that they are highly sought-after', alt: 'cow,cow2' },
	{ name: ':dog2:', rank: 'rare', hp: 4, att: 6, pr: 3, wp: 1, mag: 1, mr: 2, description: 'Very loyal and protective', alt: 'dog,dog2,doggy,puppy,wolf' },
	{ name: ':pig2:', rank: 'rare', hp: 4, att: 2, pr: 3, wp: 2, mag: 2, mr: 4, description: 'aka ur mum', alt: 'pig,pig2' },
	{ name: ':sheep:', rank: 'rare', hp: 5, att: 2, pr: 2, wp: 3, mag: 1, mr: 4, description: 'Tastes like cotten candy!', alt: 'sheep,ram,goat' },
	{ name: ':crocodile:', rank: 'epic', hp: 3, att: 4, pr: 4, wp: 2, mag: 1, mr: 4, description: 'How do you tell the difference between an alligator and an crocodile?\n~ You will see one later and one in a while', alt: 'crocodile,alligator' },
	{ name: ':elephant:', rank: 'epic', hp: 5, att: 5, pr: 3, wp: 1, mag: 1, mr: 3, description: "They don't actually eat peanuts", alt: 'elephant' },
	{ name: ':penguin:', rank: 'epic', hp: 2, att: 1, pr: 2, wp: 6, mag: 5, mr: 2, description: "The birds that can't fly", alt: 'penguin' },
	{ name: ':tiger2:', rank: 'epic', hp: 4, att: 6, pr: 2, wp: 1, mag: 3, mr: 2, description: 'Just a very large kitty', alt: 'tiger,tiger2,cheetah' },
	{ name: ':whale:', rank: 'epic', hp: 7, att: 1, pr: 3, wp: 1, mag: 2, mr: 4, description: 'whale, whale, whale, look what we have here', alt: 'whale' },
];

async function main() {
	if (!process.env.MONGODB_URI && !process.env.MONGO_URI) {
		throw new Error('Set MONGODB_URI before running the MongoDB static-data seeder.');
	}

	await mongo.connect();
	const collection = await mongo.collection('animals');

	for (const animal of animals) {
		await collection.updateOne({ name: animal.name }, { $set: animal }, { upsert: true });
	}

	const count = await collection.countDocuments({ name: { $in: animals.map((animal) => animal.name) } });
	if (count !== animals.length) {
		throw new Error(`Static animal seed verification failed: expected ${animals.length}, found ${count}.`);
	}

	console.log(`Seeded and verified ${count} base animal definitions in MongoDB.`);
}

main()
	.catch((err) => {
		console.error(err);
		process.exitCode = 1;
	})
	.finally(async () => {
		await mongo.close();
	});
