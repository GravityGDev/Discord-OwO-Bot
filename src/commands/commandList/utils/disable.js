/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');

const enabledUtil = require('./utils/enabledUtil.js');

module.exports = new CommandInterface({
	alias: ['disable'],

	args: '{command1, command2, ...}',

	desc: 'Disable a command in the current channel. You can list multiple commands to disable multiple at once. You can also disable a whole group.',

	example: ['owo disable hunt battle zoo', 'owo disable gambling', 'owo disable all'],

	related: ['owo enable'],

	permissions: ['sendMessages'],

	group: ['utility'],

	cooldown: 1000,
	half: 100,
	six: 500,

	execute: async function (p) {
		/* Checks if the user has permission */
		if (!p.msg.member.permissions.has('manageChannels')) {
			p.errorMsg(', You are not an admin!', 3000);
			return;
		}

		/* Parse commands */
		let commands = p.args.slice();
		for (let i = 0; i < commands.length; i++) commands[i] = commands[i].toLowerCase();

		const channel = String(p.msg.channel.id);
		const disabled = await p.mongo.collection('disabled');

		// If the user wants to disable all commands
		if (commands.includes('all')) {
			const names = new Set(['all']);
			for (let key in p.mcommands) {
				if (key != 'disable' && key != 'enable') names.add(key);
			}
			for (let key in p.commandGroups) {
				if (key != 'undefined') names.add(key);
			}

			await disabled.bulkWrite(
				Array.from(names).map((command) => ({
					updateOne: {
						filter: { channel, command },
						update: {
							$setOnInsert: {
								_id: `disabled:${encodeURIComponent(channel)}:${encodeURIComponent(command)}`,
								channel,
								command,
							},
						},
						upsert: true,
					},
				})),
				{ ordered: false }
			);

			p.send('**⚙ | All** commands have been **disabled** for this channel!');
			return;
		}

		// Disable commands from parsed args
		const names = new Set();
		for (let i = 0; i < commands.length; i++) {
			/* Convert command name to proper name */
			let command = p.aliasToCommand[commands[i]];
			if (!command && p.commandGroups[commands[i]]) command = commands[i];
			if (command && command != 'disabled' && command != 'enable' && command != 'undefined') {
				names.add(command);
			}
		}

		if (names.size) {
			await disabled.bulkWrite(
				Array.from(names).map((command) => ({
					updateOne: {
						filter: { channel, command },
						update: {
							$setOnInsert: {
								_id: `disabled:${encodeURIComponent(channel)}:${encodeURIComponent(command)}`,
								channel,
								command,
							},
						},
						upsert: true,
					},
				})),
				{ ordered: false }
			);
		}

		p.send(await enabledUtil.createEmbed(p));
	},
});
