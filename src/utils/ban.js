/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

var cooldown = {};
const noEmoji = '🚫';
const skullEmoji = '☠';
const liftEmoji = '🙇';
const timerEmoji = '⏱';

exports.check = async function (p, command) {
	let channel = String(p.msg.channel.id);
	let guild = String(p.msg.channel.guild?.id || 0);
	let author = String(p.msg.author.id);

	if (cooldown[author + command]) return;

	// skip for points
	if (command != 'points') {
		//Check for channel cooldown
		if (!cooldown[channel]) {
			cooldown[channel] = 1;
			setTimeout(() => {
				delete cooldown[channel];
			}, 5000);
		} else if (cooldown[channel] >= 6) {
			cooldown[channel]++;
			if (command != 'points' && cooldown[channel] == 8)
				await p.send(
					timerEmoji +
						' **|** This channel is getting a little too crowded! Please slow down for me! ;c',
					3000
				);
			return;
		} else if (cooldown[channel] < 7) {
			cooldown[channel]++;
		}

		//Check if there is a global cooldown
		if (!cooldown[author]) {
			cooldown[author] = 1;
			setTimeout(() => {
				delete cooldown[author];
			}, 5000);
		} else if (cooldown[author] >= 3) {
			cooldown[author]++;
			if (command != 'points' && cooldown[author] == 4)
				await p.replyMsg(
					timerEmoji,
					", Please slow down~ You're a little **too fast** for me :c",
					3000
				);
			return;
		} else if (cooldown[author] < 3) {
			cooldown[author]++;
		}
	}

	const commandNames = ['all', command, ...p.commands[command].group];
	const [disabledCollection, timeoutCollection, userBanCollection] = await Promise.all([
		p.mongo.collection('disabled'),
		p.mongo.collection('timeout'),
		p.mongo.collection('user_ban'),
	]);

	const [disabled, timeoutRows, userBan] = await Promise.all([
		disabledCollection.findOne({ channel, command: { $in: commandNames } }),
		timeoutCollection.find({ id: { $in: [author, guild] } }).toArray(),
		userBanCollection.findOne({ id: author, command }),
	]);

	const now = Date.now();
	const timedOut = timeoutRows.some((row) => {
		const time = row.time instanceof Date ? row.time.getTime() : new Date(row.time).getTime();
		const penaltyHours = Number(row.penalty || 0);
		return Number.isFinite(time) && now - time < penaltyHours * 60 * 60 * 1000;
	});

	if (timedOut) {
		// User in timeout
		p.logger.logstashBanned(p.commandAlias, p);
	} else if (userBan) {
		// User is banned from this command
		cooldown[author + command] = true;
		setTimeout(() => {
			delete cooldown[author + command];
		}, 10000);
		if (command != 'points') {
			try {
				await p.errorMsg(", you're banned from this command! >:c", 3000);
			} catch (err) {
				/* supress */
			}
		}
		p.logger.logstashBanned(p.commandAlias, p);
	} else if (!disabled || ['points', 'disable', 'enable'].includes(command)) {
		// Success
		return true;
	} else {
		// Command is disabled in the channel
		cooldown[p.msg.author.id + command] = true;
		setTimeout(() => {
			delete cooldown[p.msg.author.id + command];
		}, 30000);
		if (command != 'points') {
			try {
				await p.errorMsg(', that command is disabled on this channel!', 3000);
			} catch (err) {
				/* supress */
			}
		}
	}
};

exports.banCommand = async function (p, user, command, reason) {
	await p.global.getUid(user.id);
	const userBans = await p.mongo.collection('user_ban');
	await userBans.updateOne(
		{ id: String(user.id), command },
		{
			$setOnInsert: {
				_id: `user_ban:${encodeURIComponent(String(user.id))}:${encodeURIComponent(command)}`,
				id: String(user.id),
				command,
			},
		},
		{ upsert: true }
	);

	try {
		await (
			await user.getDMChannel()
		).createMessage(
			noEmoji +
				' **|** You have been banned from using the command: `' +
				command +
				'`\n' +
				p.config.emoji.blank +
				' **| Reason:** ' +
				reason
		);
	} catch (err) {
		await p.sender.msgModLogChannel(
			skullEmoji +
				' **⚠ | ' +
				p.getUniqueName() +
				'** is banned from using `' +
				command +
				'` forever.\n' +
				p.config.emoji.blank +
				' **| ID:** ' +
				user.id +
				'\n' +
				p.config.emoji.blank +
				' **| Reason:** ' +
				reason +
				'\n' +
				p.config.emoji.blank +
				" **| I couldn't DM them.**"
		);
		return;
	}
	await p.sender.msgModLogChannel(
		skullEmoji +
			' **| ' +
			p.getUniqueName() +
			'** is banned from using `' +
			command +
			'` forever.\n' +
			p.config.emoji.blank +
			' **| ID:** ' +
			user.id +
			'\n' +
			p.config.emoji.blank +
			' **| Reason:** ' +
			reason
	);
};

exports.liftCommand = async function (p, user, command) {
	const userBans = await p.mongo.collection('user_ban');
	const result = await userBans.deleteOne({ id: String(user.id), command });

	if (result.deletedCount) {
		try {
			await (
				await user.getDMChannel()
			).createMessage(
				liftEmoji + ' **|** An admin has lifted your ban from the `' + command + '` command!'
			);
		} catch (err) {
			await p.send(
				liftEmoji +
					' **⚠ | ' +
					p.getUniqueName() +
					"**'s ban on `" +
					command +
					'` has been lifted!\n' +
					p.config.emoji.blank +
					' **| ID:** ' +
					user.id +
					'\n' +
					p.config.emoji.blank +
					" **| I couldn't DM them.**"
			);
			return;
		}
		await p.send(
			liftEmoji +
				' **| ' +
				p.getUniqueName() +
				"**'s ban on `" +
				command +
				'` has been lifted!\n' +
				p.config.emoji.blank +
				' **| ID:** ' +
				user.id
		);
	} else {
		await p.errorMsg(', **' + p.getUniqueName() + '** does not have a ban on `' + command + '`!');
	}
};
