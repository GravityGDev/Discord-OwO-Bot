/*
 * OwO Bot for Discord
 * Copyright (C) 2021 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const banEmoji = '<:ban:444365501708107786>';

exports.handle = async function (main, message) {
	let { guildId, replyChannel } = JSON.parse(message);
	if (!guildId || !replyChannel) return;

	const guild = main.bot.guilds.get(guildId);
	if (!guild) return;

	let memberIds = [];
	let memberCount = 0;
	let log = '';
	guild.members.forEach((member) => {
		memberIds.push(String(member.id));
		log += member.id + ',';
		memberCount++;
	});
	console.log(log);

	if (memberIds.length) {
		const timeout = await main.mongo.collection('timeout');
		const now = new Date();
		await timeout.bulkWrite(
			memberIds.map((id) => ({
				updateOne: {
					filter: { id },
					update: {
						$set: { time: now, penalty: 999999 },
						$inc: { count: 1 },
						$setOnInsert: { id },
					},
					upsert: true,
				},
			})),
			{ ordered: false }
		);
	}

	let userList = '';
	for (let i in memberIds) {
		userList += memberIds[i] + ', ';
		if (!((parseInt(i) + 1) % 10) && i + 1 != memberIds.length) {
			userList += '\n';
		}
	}
	userList = userList.slice(0, -2);
	const buffer = Buffer.from(userList, 'utf8');

	const msg = `${banEmoji} **|** Banned ${memberCount} members from **${guild.name}**.`;
	main.bot.createMessage(replyChannel, msg, { file: buffer, name: 'list.txt' });
};
