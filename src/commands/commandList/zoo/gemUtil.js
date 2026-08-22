/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const gems = require('../../../data/gems.json');
for (const gem in gems.gems) gems.gems[gem].key = gem;
const ranks = {
	c: 'Common',
	u: 'Uncommon',
	r: 'Rare',
	e: 'Epic',
	m: 'Mythical',
	l: 'Legendary',
	f: 'Fabled',
};

exports.getItems = async function (p) {
	const uid = await p.global.getUid(p.msg.author.id);
	const collection = await p.mongo.collection('user_gem');
	const rows = await collection.find({ uid, gcount: { $gt: 0 } }).toArray();
	const items = {};
	for (const row of rows) {
		const item = gems.gems[row.gname];
		if (!item) continue;
		items[item.key] = {
			key: item.key,
			emoji: item.emoji,
			id: item.id,
			count: row.gcount,
		};
	}
	return items;
};

function getGemByID(id) {
	for (const gem in gems.gems) {
		if (gems.gems[gem].id == id) return gems.gems[gem];
	}
	return undefined;
}

exports.getGem = function (key) {
	return gems.gems[key] ? { ...gems.gems[key] } : undefined;
};

exports.use = async function (p, ids) {
	if (ids.length > 4) {
		p.errorMsg(', you can only use up to four gems at one time!', 3000);
		return;
	}

	const invalidIds = [];
	const usedGemTypes = {};
	const requested = [];
	for (const id of ids) {
		const gem = getGemByID(id);
		if (!gem) {
			invalidIds.push(id);
		} else if (usedGemTypes[gem.type]) {
			p.errorMsg(`, you can not use multiple **${gem.type} Gems** at the same time!`, 3000);
			return;
		} else {
			requested.push(gem);
			usedGemTypes[gem.type] = true;
		}
	}
	if (invalidIds.length) {
		p.errorMsg(`, one or more ids are not valid gems: ${invalidIds.toString()}`, 3000);
		return;
	}

	const uid = await p.global.getUid(p.msg.author.id);
	const results = await activateGems(p, uid, requested);
	let text = '';
	if (requested.length === 1) {
		if (!results[0]) {
			text = `**🚫 | ${p.getName()}**, you already have an active ${
				requested[0].type
			} gem or you do not own this gem!`;
		} else {
			text =
				`**${requested[0].emoji} | ${p.getName()}**, you activated a(n) **${
					ranks[requested[0].key[0]]
				} ${requested[0].type} Gem**!\n` + getUseGemText(requested[0]);
		}
	} else {
		text = `**✨ | ${p.getName()}**, you activated the following gems:`;
		for (let i = 0; i < requested.length; i++) {
			if (!results[i]) {
				text += `\r\n**🚫 |** you already have an active ${requested[i].type} gem or you do not own this gem!`;
			} else {
				text +=
					`\r\n**${requested[i].emoji} |** A(n) **${ranks[requested[i].key[0]]} ${
						requested[i].type
					} Gem!**\r\n` + getUseGemText(requested[i]);
			}
		}
	}
	p.send(text);
};

async function activateGems(p, uid, requested) {
	const collection = await p.mongo.collection('user_gem');
	const session = await p.mongo.startSession();
	const results = [];
	try {
		await session.withTransaction(async () => {
			results.length = 0;
			const activeRows = await collection.find({ uid, activecount: { $gt: 0 } }, { session }).toArray();
			const activeTypes = new Set();
			for (const row of activeRows) {
				const info = gems.gems[row.gname];
				if (info) activeTypes.add(info.type);
			}

			for (const gem of requested) {
				if (activeTypes.has(gem.type)) {
					results.push(false);
					continue;
				}
				const changed = await collection.updateOne(
					{ uid, gname: gem.key, gcount: { $gt: 0 } },
					{ $inc: { gcount: -1 }, $set: { activecount: gem.length } },
					{ session }
				);
				const success = !!changed.modifiedCount;
				results.push(success);
				if (success) activeTypes.add(gem.type);
			}
		});
	} catch (err) {
		console.error(err);
		return requested.map(() => false);
	} finally {
		await session.endSession();
	}
	return results;
}

function getUseGemText(gem) {
	let text = `**<:blank:427371936482328596> |** Your next ${gem.length} `;
	if (gem.type == 'Hunting') text += `manual hunts will be increased by ${gem.amount}`;
	else if (gem.type == 'Patreon') {
		text +=
			'manual hunts will catch an extra animal and have a chance to contain Patreon exclusive animals!';
	} else if (gem.type == 'Empowering') {
		text += 'animals will be doubled! It can stack with Hunting gems!';
	} else if (gem.type == 'Lucky') {
		text += `animals will have a +${gem.amount}x higher chance of finding gem tiers!`;
	} else if (gem.type == 'Special') {
		text += 'animals will have a +2x higher chance of finding special tiers!';
	} else text += 'ERROR!';
	return text;
}

exports.desc = async function (p, id) {
	const gem = getGemByID(id);
	if (!gem) {
		p.errorMsg(', There is no such item!', 3000);
		return;
	}
	const uid = await p.global.getUid(p.msg.author.id);
	const collection = await p.mongo.collection('user_gem');
	const row = await collection.findOne({ uid, gname: gem.key });
	if (!row) {
		p.errorMsg(', you do not have this item!', 3000);
		return;
	}

	let text = `**ID:** ${gem.id}\n`;
	if (gem.type == 'Hunting') {
		text += `A(n) ${ranks[gem.key[0]]} Hunting Gem!\nWhen activated, this gem will increase your manual hunt by ${
			gem.amount
		} for the next ${gem.length} hunts!\nCannot stack with other Hunting gems.`;
	} else if (gem.type == 'Patreon') {
		text += `A(n) ${
			ranks[gem.key[0]]
		} Patreon Gem!\nWhen activated, this gem will allow you to find Patreon/Custom pets when manually hunting for the next ${
			gem.length
		} hunts!\nYou will also hunt 1 extra animal per hunt!\nCannot stack with other Patreon gems.`;
	} else if (gem.type == 'Empowering') {
		text += `A(n) ${ranks[gem.key[0]]} Empowering Gem!\nWhen activated, this gem will double your next ${
			gem.length
		} animals!\nCannot stack with other Empowering gems, but can stack with Hunting gems.`;
	} else if (gem.type == 'Lucky') {
		text += `A(n) ${ranks[gem.key[0]]} Lucky Gem!\nWhen activated, this gem will increase your chance of finding gem pets by ${
			gem.amount
		}x for the next ${gem.length} animals!\nCannot stack with other Lucky gems.`;
	} else if (gem.type == 'Special') {
		text += `A(n) ${
			ranks[gem.key[0]]
		} Special Gem!\nWhen activated, this gem will increase your chance of finding special pets by 2x for the next ${
			gem.length
		} hunts!\nThis gem will not be active if there are no special pets available.`;
	}
	const embed = {
		color: p.config.embed_color,
		fields: [{ name: `${gem.emoji} ${gem.key}`, value: text }],
	};
	p.send({ embed });
};
