/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');

module.exports = new CommandInterface({
	alias: ['reply'],

	owner: true,
	admin: true,

	execute: async function (p) {
		let feedbackId = p.args.shift();
		if (!p.global.isInt(feedbackId)) {
			p.errorMsg(', Invalid feedback id!', 3000);
			return;
		}
		feedbackId = parseInt(feedbackId);

		let reply = p.args.join(' ');
		if (reply.length > 250) {
			p.errorMsg(', Sorry! Messages must be under 250 character!!!');
			return;
		} else if (!reply || reply.length == 0) {
			p.errorMsg(', Please include a message!', 3000);
			return;
		}

		const feedback = await p.mongo.collection('feedback');
		const result = await feedback.findOne({ id: feedbackId });
		if (!result) {
			p.errorMsg(', Could not find that feedback id!', 3000);
			return;
		}

		let user = await p.fetch.getUser(String(result.sender));
		if (!user) {
			p.errorMsg(', Could not find that user!', 3000);
			return;
		}
		let embed = {
			color: 10590193,
			timestamp: new Date(),
			thumbnail: {
				url: 'https://cdn.discordapp.com/app-icons/408785106942164992/00d934dce5e41c9e956aca2fd3461212.png',
			},
			author: {
				name: 'OwO Bot Support',
				icon_url:
					'https://cdn.discordapp.com/app-icons/408785106942164992/00d934dce5e41c9e956aca2fd3461212.png',
			},
			fields: [
				{
					name: 'Thank you for your feedback!',
					value: '===============================================',
				},
				{ name: 'Message ID', value: feedbackId, inline: true },
				{ name: 'Message Type', value: result.type, inline: true },
				{ name: 'Your Message', value: '```' + result.message + '```' },
				{
					name: 'Reply from Admin',
					value: '```' + reply + '```\n\n===============================================',
				},
			],
		};

		try {
			(await user.getDMChannel()).createMessage({ embed });
			p.send('Replied to user ' + user.username);
		} catch (e) {
			p.errorMsg('Failed to message that user :(', 3000);
		}
	},
});
