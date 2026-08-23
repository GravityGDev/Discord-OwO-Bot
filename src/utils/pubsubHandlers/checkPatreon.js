/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const supportGuild = '420104212895105044';
const daily = '449429399217897473';
const animal = '449429255781351435';

exports.handle = async function (main, message) {
	let { userID } = JSON.parse(message);
	if (!userID) return;

	let guild = main.bot.guilds.get(supportGuild);
	if (!guild) return;

	let member = await main.fetch.getMember(guild, userID);

	let dailyPerk = false;
	let animalPerk = false;
	if (member) {
		for (let i in member.roles) {
			let role = member.roles[i];
			if (role == daily) dailyPerk = true;
			if (role == animal) animalPerk = true;
		}
	}

	const users = await main.mongo.collection('user');
	await users.updateOne(
		{ id: String(userID) },
		{
			$set: {
				patreonDaily: dailyPerk ? 1 : 0,
				patreonAnimal: animalPerk ? 1 : 0,
			},
		}
	);
};
