/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');

const dateOptions = {
	weekday: 'short',
	year: 'numeric',
	month: 'short',
	day: 'numeric',
};
const perPage = 20;
const nextPageEmoji = '➡';
const prevPageEmoji = '⬅';

// Yes i know reciever is spelled wrong >:C
module.exports = new CommandInterface({
	alias: ['transaction'],

	owner: true,
	admin: true,
	manager: true,

	execute: function (p) {
		if (p.args[0] == 'to') {
			transactionTo(p);
		} else if (p.args[0] == 'from') {
			transactionFrom(p);
		} else if (p.args.length == 1) {
			transaction(p);
		} else {
			p.errorMsg(', Invalid syntax!');
		}
	},
});

async function transactionTo(p) {
	let id = p.global.parseID('<@' + p.args[1] + '>');
	if (!id) {
		p.errorMsg(', invalid id');
		return;
	}
	displayTransactions(p, id, { reciever: String(id) });
}

async function transactionFrom(p) {
	let id = p.global.parseID('<@' + p.args[1] + '>');
	if (!id) {
		p.errorMsg(', invalid id');
		return;
	}
	displayTransactions(p, id, { sender: String(id) });
}

async function transaction(p) {
	let id = p.global.parseID('<@' + p.args[0] + '>');
	if (!id) {
		p.errorMsg(', invalid id');
		return;
	}
	const value = String(id);
	displayTransactions(p, id, { $or: [{ sender: value }, { reciever: value }] });
}

async function displayTransactions(p, id, filter) {
	const transactions = await p.mongo.collection('transaction');
	const count = await transactions.countDocuments(filter);
	if (!count) {
		p.errorMsg(', this user does not have any transactions');
		return;
	}

	let user = await p.fetch.getUser(String(id));
	let username = user ? user.username : id;
	let page = 0;
	let maxPage = Math.ceil(count / perPage);
	let opt = { id: String(id), username, avatar: user ? user.avatarURL : null, filter };
	let embed = await getPage(p, opt, page, maxPage);
	let msg = await p.send(embed);

	await msg.addReaction(prevPageEmoji);
	await msg.addReaction(nextPageEmoji);
	let reactionFilter = (emoji, userID) =>
		[nextPageEmoji, prevPageEmoji].includes(emoji.name) && userID == p.msg.author.id;
	let collector = p.reactionCollector.create(msg, reactionFilter, {
		time: 900000,
		idle: 120000,
	});

	collector.on('collect', async function (emoji) {
		if (emoji.name == nextPageEmoji) {
			if (page + 1 < maxPage) page++;
			else page = 0;
			embed = await getPage(p, opt, page, maxPage);
			msg.edit(embed);
		} else if (emoji.name === prevPageEmoji) {
			if (page > 0) page--;
			else page = maxPage - 1;
			embed = await getPage(p, opt, page, maxPage);
			msg.edit(embed);
		}
	});
	collector.on('end', async function (_collected) {
		embed.embed.color = 6381923;
		await msg.edit({
			content: 'This message is now inactive',
			embed: embed.embed,
		});
	});
}

async function getPage(p, user, page, maxPage) {
	let desc = '';
	const transactions = await p.mongo.collection('transaction');
	const result = await transactions
		.find(user.filter)
		.sort({ time: -1, createdAt: -1, tid: -1, _id: -1 })
		.skip(page * perPage)
		.limit(perPage)
		.toArray();
	for (let i in result) {
		let row = result[i];
		const when = row.time || row.createdAt;
		if (String(row.sender) == user.id)
			desc += `__**\`${row.sender}\`**__ \`-> ${row.reciever} | ${toDate(when)} | ${p.global.toFancyNum(
				row.amount
			)}\`\n`;
		else if (String(row.reciever) == user.id)
			desc += `\`${row.sender} ->\` __**\`${row.reciever}\`**__ \`| ${toDate(when)} | ${p.global.toFancyNum(
				row.amount
			)}\`\n`;
		else
			desc += `\`${row.sender} -> ${row.reciever} | ${toDate(when)} | ${p.global.toFancyNum(
				row.amount
			)}\`\n`;
	}
	let embed = {
		author: {
			name: 'transactions for ' + user.username,
			icon_url: user.avatar,
		},
		description: desc,
		color: p.config.embed_color,
		footer: {
			text: 'Page ' + (page + 1) + '/' + maxPage + '',
		},
	};
	return { embed };
}

function toDate(date) {
	return date ? new Date(date).toLocaleDateString('default', dateOptions) : 'Unknown date';
}
