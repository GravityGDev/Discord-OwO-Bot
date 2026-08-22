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
const perPage = 15;
const nextPageEmoji = '➡';
const prevPageEmoji = '⬅';
const banEmoji = '☠';

module.exports = new CommandInterface({
	alias: ['prayto'],

	owner: true,
	admin: true,
	manager: true,

	execute: async function (p) {
		if (p.args.length > 2) await banList(p);
		else await displayList(p);
	},
});

async function banList(p) {
	if (p.args[0] != 'ban') {
		p.errorMsg(', Invalid syntax! The correct use is `owo prayto ban {id} {minPrayCount}`', 4000);
		return;
	}
	let userid = p.args[1];
	if (!p.global.isInt(userid)) {
		p.errorMsg(', Invalid user id!', 3000);
		return;
	}
	let min = p.args[2];
	if (!p.global.isInt(min)) {
		p.errorMsg(', Invalid minimum pray count!', 4000);
		return;
	}

	userid = String(userid);
	min = parseInt(min);
	let user = await p.fetch.getUser(userid);
	let username = user ? user.username : userid;

	const prayers = await p.mongo.collection('user_pray');
	const result = await prayers
		.find({ receiver: userid, count: { $gte: min } }, { projection: { sender: 1 } })
		.toArray();
	if (!result.length) {
		p.errorMsg(', no users found', 3000);
		return;
	}
	let bans = [userid, ...result.map((row) => String(row.sender))];
	let count = bans.length;
	const timeout = await p.mongo.collection('timeout');
	await timeout.bulkWrite(
		bans.map((id) => ({
			updateOne: {
				filter: { id },
				update: { $set: { penalty: 99999 }, $setOnInsert: { id } },
				upsert: true,
			},
		})),
		{ ordered: false }
	);

	if (user) {
		try {
			await (await user.getDMChannel()).createMessage('Your accounts has been banned for abusing pray/curse');
		} catch (e) {
			p.replyMsg(
				banEmoji,
				', **' + username + '** and ' + (count - 1) + " users have been banned, I couldn't DM them"
			);
			return;
		}
	}

	let userList = '';
	for (let i in bans) {
		userList += bans[i] + ', ';
		if (!((parseInt(i) + 1) % 10) && i + 1 != bans.length) userList += '\n';
	}
	userList = userList.slice(0, -2);
	const userListBuffer = Buffer.from(userList, 'utf8');
	p.replyMsg(
		banEmoji,
		', **' + username + '** and ' + (count - 1) + ' users have been banned',
		null,
		{ file: userListBuffer, name: 'list.txt' }
	);
}

async function displayList(p) {
	let userid = p.args[0];
	if (!p.global.isInt(userid)) {
		p.errorMsg(', Invalid user id!', 3000);
		return;
	}
	userid = String(userid);

	let user = await p.fetch.getUser(userid);
	let username = user ? user.username : userid;
	const prayers = await p.mongo.collection('user_pray');
	const count = await prayers.countDocuments({ receiver: userid });
	if (!count) {
		p.errorMsg(', nobody has prayed to ' + username + '!', 3000);
		return;
	}

	let page = 0;
	let maxPage = Math.ceil(count / perPage);
	let opt = { id: userid, username, avatar: user ? user.avatarURL : null };
	let embed = await getPage(p, opt, page, maxPage);
	let msg = await p.send(embed);

	await msg.addReaction(prevPageEmoji);
	await msg.addReaction(nextPageEmoji);
	let filter = (emoji, userID) =>
		[nextPageEmoji, prevPageEmoji].includes(emoji.name) && userID == p.msg.author.id;
	let collector = p.reactionCollector.create(msg, filter, {
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
		await msg.edit({ content: 'This message is now inactive', embed: embed.embed });
	});
}

async function getPage(p, user, page, maxPage) {
	let desc = '';
	const prayers = await p.mongo.collection('user_pray');
	const result = await prayers
		.find({ receiver: user.id })
		.sort({ latest: -1, _id: -1 })
		.skip(page * perPage)
		.limit(perPage)
		.toArray();
	for (let prayer of result) {
		desc += '`' + prayer.sender + '` | `' + prayer.count + '` | `' + toDate(prayer.latest) + '`\n';
	}
	let embed = {
		author: { name: 'List of users who prayed to ' + user.username, icon_url: user.avatar },
		description: desc,
		color: p.config.embed_color,
		footer: { text: 'Page ' + (page + 1) + '/' + maxPage + '' },
	};
	return { embed };
}

function toDate(date) {
	return new Date(date).toLocaleDateString('default', dateOptions);
}
