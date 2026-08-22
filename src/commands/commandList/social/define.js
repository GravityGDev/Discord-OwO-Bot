/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');
const axios = require('axios');

const nextPageEmoji = '➡️';
const prevPageEmoji = '⬅️';

module.exports = new CommandInterface({
	alias: ['define'],

	args: '{word}',

	desc: 'I shall define thy word!',

	example: ['owo define tsundere'],

	related: [],

	permissions: ['sendMessages', 'embedLinks', 'addReactions'],

	group: ['fun'],

	cooldown: 5000,
	half: 100,
	six: 500,

	execute: async function (p) {
		const word = p.args.join(' ').trim();
		if (!word) {
			p.errorMsg(', Silly human! Makes sure to add a word to define!', 3000);
			return;
		}

		let entries;
		try {
			const response = await axios.get('https://api.urbandictionary.com/v0/define', {
				params: { term: word },
				timeout: 10000,
			});
			entries = Array.isArray(response.data?.list) ? response.data.list : [];
		} catch (err) {
			console.error('[Define] Urban Dictionary request failed:', err.message);
			p.errorMsg(", I couldn't reach the dictionary right now! :c", 3000);
			return;
		}

		if (!entries.length) {
			p.errorMsg(", I couldn't find that word! :c", 3000);
			return;
		}

		const pages = [];
		let count = 1;
		for (const entry of entries) {
			let definition = String(entry.definition || '').replace(/\[([^\]]+)\]/g, '$1');
			const exampleText = String(entry.example || '').replace(/\[([^\]]+)\]/g, '$1');
			const example = exampleText ? `\n*\`\`${exampleText} \`\`*` : '';
			let result = definition + example;

			if (!p.msg.channel.nsfw && p.global.isProfane(result)) {
				result =
					'⚠️ **A few words may have been censored! To view an uncensored version, use this command in a NSFW channel.** ⚠️\n\n' +
					p.global.cleanString(result);
			}

			do {
				let print;
				if (result.length > 1700) {
					print = result.substring(0, 1700);
					result = result.substring(1700);
				} else {
					print = result;
					result = '';
				}

				pages.push({
					embed: {
						description: print || '*no description*',
						color: p.config.embed_color,
						author: {
							name: `Definition of '${entries[0].word || word}'`,
							icon_url: p.msg.author.avatarURL,
						},
						url: entry.permalink,
						footer: {
							text: `Definition ${count}/${entries.length}`,
						},
					},
				});
			} while (result.length);
			count++;
		}

		await display(p, pages);
	},
});

async function display(p, pages) {
	let loc = 0;
	const msg = await p.send(pages[loc]);

	/* Add a reaction collector to update the pages */
	await msg.addReaction(prevPageEmoji);
	await msg.addReaction(nextPageEmoji);

	const filter = (emoji, userID) =>
		(emoji.name === nextPageEmoji || emoji.name === prevPageEmoji) && userID === p.msg.author.id;
	const collector = p.reactionCollector.create(msg, filter, {
		time: 900000,
		idle: 120000,
	});

	/* Flip the page if reaction is pressed */
	collector.on('collect', async function (emoji) {
		if (emoji.name === nextPageEmoji && loc + 1 < pages.length) {
			loc++;
			await msg.edit(pages[loc]);
		}
		if (emoji.name === prevPageEmoji && loc > 0) {
			loc--;
			await msg.edit(pages[loc]);
		}
	});

	collector.on('end', async function () {
		const page = pages[loc];
		page.embed.color = 6381923;
		await msg.edit({ content: 'This message is now inactive', embed: page.embed });
	});
}
