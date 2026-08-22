/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');
const mongo = require('../../../utils/mongo.js');

const description =
	'•  Any actions performed to gain an unfair advantage over other users are explicitly against the rules. This includes but not limited to:\n├> Using macros/scripts for any commands\n└> Using multiple accounts for any reason\n\n•  Do **not** use any exploits and report any found in the bot\n\n•  You can **not** sell/trade cowoncy or any bot goods for anything outside of the bot\n\n•  If you have any questions come ask us in our [server](https://discord.gg/owobot)!\n\n[Privacy Policy](https://owobot.com/privacy-policy)   **-**   [Terms of Service](https://owobot.com/terms-of-service)';
const agreeEmoji = '👍';
const warningEmoji = '⚠️';

let agreeCount = 0;
setInterval(updateCount, 1000 * 60 * 60 * 3);

module.exports = new CommandInterface({
	alias: ['rule', 'rules'],

	args: '',

	desc: 'Display the rules for owo bot!',

	example: [],

	related: ['owo help'],

	permissions: ['sendMessages', 'embedLinks', 'attachFiles', 'addReactions'],

	group: ['utility'],

	cooldown: 10000,
	half: 80,
	six: 500,

	execute: async function (p) {
		const rules = await mongo.collection('rules');
		const rule = await rules.findOne({ _id: String(p.msg.author.id) });

		let voted = !!rule;

		/* Construct embed message */
		let descriptionExtra = '';
		if (!voted)
			descriptionExtra =
				'\n\n*Clicking on the button means you will follow the rules and acknowlege the consequences*';
		else if (rule.opinion == 1)
			descriptionExtra = "\n\nOwO what's this? You already agreed to these rules! <3";
		else
			descriptionExtra = '\n\nUwU you disagreed! You still have to follow these rules though! c:<';
		let embed = {
			title: 'Failure to follow these rules will result in a ban and/or account reset!',
			description: description + descriptionExtra,
			color: p.config.embed_color,
			footer: {
				text: p.global.toFancyNum(agreeCount) + ' Users agreed',
			},
			author: {
				name: 'OwO Bot Rules',
				icon_url: p.client.user.avatarURL,
			},
		};

		/* Send message and add reactions if necessary */
		let content;
		if (!voted) {
			content = `${warningEmoji} **You must accept these rules to use the bot!**`;
		}

		let components = !voted
			? [
					{
						type: 1,
						components: [
							{
								type: 2,
								label: 'I accept the OwO Bot Rules',
								style: 1,
								custom_id: 'accept_rules',
								emoji: {
									id: null,
									name: agreeEmoji,
								},
							},
						],
					},
			  ]
			: null;
		let message = await p.send({ content, embed, components });

		if (voted) return;
		let filter = (componentName, user) =>
			componentName === 'accept_rules' && user.id === p.msg.author.id;
		let collector = p.interactionCollector.create(message, filter, {
			time: 900000,
		});

		collector.on('collect', async (component, user, ack) => {
			collector.stop('done');

			await rules.updateOne(
				{ _id: String(user.id) },
				{
					$setOnInsert: { createdAt: new Date() },
					$set: { opinion: 1, updatedAt: new Date() },
				},
				{ upsert: true }
			);

			agreeCount++;
			embed.footer.text = p.global.toFancyNum(agreeCount) + ' Users agreed';
			embed.description = description + "\n\nOwO what's this? You agreed to these rules! <3";
			embed.color = 65280;
			components[0].components[0].disabled = true;
			await ack({ embed, components });
			p.msg.author.acceptedRules = true;
		});

		collector.on('end', async (reason) => {
			if (reason != 'done') {
				embed.color = 6381923;
				components[0].components[0].disabled = true;
				try {
					await message.edit({
						content: `${warningEmoji} **You must accept these rules to use the bot!**\nThis message is now inactive.`,
						embed: embed,
						components,
					});
				} catch (err) {
					console.error(`[${message.id}] Could not edit message`);
				}
			}
		});
	},
});

async function updateCount() {
	try {
		const rules = await mongo.collection('rules');
		agreeCount = await rules.countDocuments({ opinion: 1 });
	} catch (err) {
		console.error('[MongoDB] Could not update rules acceptance count');
		console.error(err);
	}
}
updateCount();
