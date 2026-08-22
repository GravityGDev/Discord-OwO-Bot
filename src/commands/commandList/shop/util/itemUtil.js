/*
 * OwO Bot for Discord
 * Copyright (C) 2020 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const config = require('../../../../data/config.json');
const event = require('../../../../data/event.json');
const interactionAgree = 'item_agree';
const interactionDisagree = 'item_disagree';
const items = {
	common_tickets: {
		id: 10,
		name: 'Wrapped Common Ticket',
		emoji: config.emoji.perkTicket.wcommon,
		column: 'common_tickets',
		tradeNote: '⚠️ **You can only trade this item ONCE. The ticket will be unwrapped.**',
		tradeConvert: 14,
		desc: 'You can use this item to redeem 1 month of common tier perks!\n\nYou can trade this item with other users with `owo trade 10 {@user} {pricePerTicket} {numberOfTickets}`. An example would be `owo trade 10 @Scuttler 100000 2`. This will trade 2 tickets for a total price of 200000 cowoncy.\n\n**This ticket is only tradeable ONCE.** It will be unwrapped once traded.\n\nYou can also use this item by typing in `owo use 10`.',
	},
	unwrapped_common_tickets: {
		id: 14,
		name: 'Common Ticket',
		emoji: config.emoji.perkTicket.common,
		column: 'unwrapped_common_tickets',
		untradeable: true,
		desc: 'You can use this item to redeem 1 month of common tier perks by typing `owo use 14`.',
	},
	giveaway_tickets: {
		id: 18,
		name: 'Giveaway Ticket',
		emoji: config.emoji.perkTicket.giveaway,
		column: 'giveaway_tickets',
		untradeable: true,
		desc: `You can use this item to start a giveaway in this channel! Anyone who has access to the channel can join the giveaway.\n${config.emoji.warning} Selling this item for cowoncy, real money, or any item with monetary value will result in an immediate ban.`,
	},
	custom_pet_tickets: {
		id: 19,
		name: 'Custom Pet Ticket',
		emoji: config.emoji.perkTicket.custom_pet,
		column: 'custom_pet_tickets',
		untradeable: true,
		desc: 'You can use this item to create one custom pet for yourself. You can choose the name, description, stats, and picture for the custom pet! Any users with a common perks or above will be able to hunt for your pet!',
	},
};

const lowestEventId = 22;
let eventItemId = lowestEventId;
for (const key in event) {
	const eventItem = event[key].item;
	if (eventItem) {
		items[eventItem.id] = {
			id: eventItemId,
			name: eventItem.name,
			emoji: eventItem.emoji,
			column: eventItem.id,
			untradeable: true,
			desc: eventItem.description,
		};
		eventItemId++;
	}
}

exports.getItems = async function (p) {
	const uid = await p.global.getUid(p.msg.author.id);
	const inventory = await p.mongo.collection('user_item');
	const rows = await inventory.find({ uid, count: { $gt: 0 } }).toArray();
	const inv = {};

	for (const row of rows) {
		const info = items[row.name];
		if (!info) {
			console.error('No item for: ' + row.name);
			continue;
		}
		inv[info.id] = { id: info.id, emoji: info.emoji, count: row.count };
	}
	return inv;
};

exports.use = async function (id, p) {
	const item = getById(id);
	if (!item || !(await checkInventory(item, p))) {
		await p.errorMsg(', you do not have this item!');
		return;
	}

	switch (item.id) {
		case 10:
		case 14:
			await useCommonTicket(item, p);
			break;
		case 18:
			await useGiveawayTicket(item, p);
			break;
		case 19:
			await useCustomPetTicket(item, p);
			break;
		default:
			if (eventItemId > item.id && item.id >= lowestEventId) {
				await p.event.useItem.bind(p)(item);
			} else {
				await p.errorMsg(', this item does not exist! :(');
			}
	}
};

function getById(id) {
	return Object.values(items).find((item) => item.id == id);
}
exports.getById = getById;

function getByName(name) {
	return items[name];
}
exports.getByName = getByName;

exports.desc = async function (p, id) {
	const item = getById(id);
	if (!item) {
		p.errorMsg(', that item does not exist!');
		return;
	}

	const uid = await p.global.getUid(p.msg.author.id);
	const inventory = await p.mongo.collection('user_item');
	const row = await inventory.findOne({ uid, name: item.column });
	if (!row?.count) {
		p.errorMsg(', you do not have this item');
		return;
	}

	const embed = {
		color: p.config.embed_color,
		fields: [{ name: `${item.emoji} ${item.name}`, value: `**ID:** ${item.id}\n${item.desc}` }],
	};
	if (item.giveOnly) {
		embed.fields[0].value += '\n\n💸 **This item can only be gifted. You cannot trade this for cowoncy.**';
	}
	if (item.untradeable) embed.fields[0].value += '\n\n🚫 **This item can not be traded.**';
	if (item.tradeLimit) appendTradeLimit(p, embed, item, row);
	await p.send({ embed });
};

function appendTradeLimit(p, embed, item, row) {
	const afterMid = p.dateUtil.afterMidnight(row.daily_reset);
	if (afterMid.after) {
		embed.fields[0].value += `\n\n📑 **You can ${item.giveOnly ? 'gift' : 'trade'} this item ${
			item.tradeLimit
		} more times today.**`;
		return;
	}
	const current = Number(row.daily_count || 0);
	if (current >= item.tradeLimit) {
		embed.fields[0].value += `\n\n📑 **You have hit the max ${
			item.giveOnly ? 'gift' : 'trade'
		} limit for today.**`;
		return;
	}
	const diff = item.tradeLimit - current;
	embed.fields[0].value += `\n\n📑 **You can ${item.giveOnly ? 'gift' : 'trade'} this item ${diff} more times today.**`;
}

async function checkInventory(item, p) {
	if (!item) return false;
	const uid = await p.global.getUid(p.msg.author.id);
	const inventory = await p.mongo.collection('user_item');
	const row = await inventory.findOne({ uid, name: item.column }, { projection: { count: 1 } });
	return Number(row?.count || 0) > 0;
}

async function useCommonTicket(ticket, p) {
	const uid = await p.global.getUid(p.msg.author.id);
	const inventory = await p.mongo.collection('user_item');
	let count = p.args[1];
	if (!count) {
		count = 1;
	} else if (count === 'all') {
		const row = await inventory.findOne({ uid, name: ticket.column });
		if (!row || Number(row.count || 0) <= 0) {
			p.errorMsg(', you do not have this item!', 3000);
			return;
		}
		count = Number(row.count);
	} else if (p.global.isInt(count)) {
		count = parseInt(count);
	} else {
		p.errorMsg(', invalid arguments! Please specify the number of tickets you want to use >:c', 3000);
		return;
	}

	if (count <= 0) {
		p.errorMsg(', bad! You must use at least one ticket', 3000);
		return;
	}

	const embed = {
		description: `**${p.getName()}**, are you sure you want to redeem **${count}** ${ticket.emoji} **${
			ticket.name
		}${count > 1 ? 's' : ''}**?`,
		color: p.config.embed_color,
	};
	const components = confirmationComponents();
	const msg = await p.send({ embed, components });
	const filter = (componentName, user) =>
		[interactionAgree, interactionDisagree].includes(componentName) && user.id === p.msg.author.id;
	const collector = p.interactionCollector.create(msg, filter, { time: 900000 });

	collector.on('collect', async (componentName, user, ack) => {
		collector.stop('done');
		disableComponents(components);
		embed.color = config.timeout_color;
		if (componentName === interactionDisagree) {
			embed.color = config.fail_color;
			ack({ embed, components });
			return;
		}

		const result = await redeemCommonTickets(p, uid, ticket.column, count);
		if (!result.ok) {
			embed.color = config.fail_color;
			embed.description = result.notEnough
				? `${p.config.emoji.error} **| ${p.getName()}**, you do not have enough tickets silly!`
				: `${p.config.emoji.error} **| ${p.getName()}**, there was an error using your ticket!`;
			await ack({ embed, components });
			return;
		}

		embed.description = `**${p.getName()}**, your patreon has been extended by **${count} month${
			count > 1 ? 's' : ''
		}**!\nExpires on: **${result.expires.toString()}**`;
		await ack({ embed, components });
	});

	collector.on('end', async function (reason) {
		if (reason === 'idle') {
			embed.color = config.timeout_color;
			disableComponents(components);
			await msg.edit({ content: 'This message is now inactive', embed, components });
		}
	});
}

async function redeemCommonTickets(p, uid, itemName, count) {
	const inventory = await p.mongo.collection('user_item');
	const patreons = await p.mongo.collection('patreons');
	const session = await p.mongo.startSession();
	let outcome = { ok: false };

	try {
		await session.withTransaction(async () => {
			outcome = { ok: false };
			const removed = await inventory.updateOne(
				{ uid, name: itemName, count: { $gte: count } },
				{ $inc: { count: -count } },
				{ session }
			);
			if (!removed.modifiedCount) {
				outcome = { ok: false, notEnough: true };
				return;
			}

			const row = await patreons.findOne({ uid }, { session });
			const months = Number(row?.patreonMonths || 0);
			const monthsPassed = row?.patreonTimer ? fullMonthsBetween(new Date(row.patreonTimer), new Date()) : months;
			let expires;
			if (!row || months <= monthsPassed) {
				const now = new Date();
				await patreons.updateOne(
					{ uid },
					{ $set: { uid, patreonType: 1, patreonMonths: count, patreonTimer: now } },
					{ upsert: true, session }
				);
				expires = addMonths(now, count);
			} else {
				await patreons.updateOne(
					{ uid },
					{ $set: { patreonType: 1 }, $inc: { patreonMonths: count } },
					{ session }
				);
				expires = addMonths(new Date(row.patreonTimer), months + count);
			}
			outcome = { ok: true, expires };
		});
	} catch (err) {
		console.error(err);
		return { ok: false };
	} finally {
		await session.endSession();
	}
	return outcome;
}

function fullMonthsBetween(start, end) {
	let months = (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth();
	const probe = new Date(start);
	probe.setMonth(probe.getMonth() + months);
	if (probe > end) months--;
	return Math.max(0, months);
}

function addMonths(date, count) {
	const result = new Date(date);
	result.setMonth(result.getMonth() + count);
	return result;
}

async function useGiveawayTicket(ticket, p) {
	const embed = {
		description:
			`**${p.getName()}**, are you sure you want to redeem a ${ticket.emoji} **${ticket.name}** in this channel?` +
			'\n\nAnyone in this channel will be able to enter the giveaway.' +
			`\n\n${config.emoji.warning} Selling this item for cowoncy, real money, or any item with monetary value will result in an immediate ban.`,
		color: p.config.embed_color,
	};
	const components = confirmationComponents();
	const msg = await p.send({ embed, components });
	const filter = (componentName, user) =>
		[interactionAgree, interactionDisagree].includes(componentName) && user.id === p.msg.author.id;
	const collector = p.interactionCollector.create(msg, filter, { time: 900000 });

	collector.on('collect', async (componentName, user, ack) => {
		collector.stop('done');
		disableComponents(components);
		embed.color = config.timeout_color;
		if (componentName === interactionDisagree) embed.color = config.fail_color;
		ack({ embed, components });
		if (componentName === interactionAgree) {
			await p.giveaway.createGiveaway.bind(p)(p.msg.channel.id, p.msg.author, true);
		}
	});

	collector.on('end', async function (reason) {
		if (reason === 'idle') {
			embed.color = config.timeout_color;
			disableComponents(components);
			await msg.edit({ content: 'This message is now inactive', embed, components });
		}
	});
}

async function useCustomPetTicket(ticket, p) {
	await p.send('Unfinished');
}

function confirmationComponents() {
	return [
		{
			type: 1,
			components: [
				{ type: 2, label: 'Use Ticket', style: 3, custom_id: interactionAgree },
				{ type: 2, label: 'Cancel', style: 4, custom_id: interactionDisagree },
			],
		},
	];
}

function disableComponents(components) {
	components[0].components[0].disabled = true;
	components[0].components[1].disabled = true;
}
