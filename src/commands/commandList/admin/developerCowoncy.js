/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');
const mongoNumeric = require('../../../utils/mongoNumeric.js');

module.exports = new CommandInterface({
	alias: ['givecowoncy', 'setcowoncy'],

	owner: true,

	execute: async function (p) {
		const parsed = parseArguments(p);
		if (!parsed) return;

		const { targetId, amount } = parsed;
		const operation = p.command === 'setcowoncy' ? 'set' : 'give';
		const amountValue = BigInt(amount);

		if (operation === 'give' && amountValue <= 0n) {
			return p.errorMsg(', the amount to give must be greater than 0');
		}
		if (operation === 'set' && amountValue < 0n) {
			return p.errorMsg(', cowoncy cannot be set below 0');
		}

		const balances = await p.mongo.collection('cowoncy');
		const audit = await p.mongo.collection('developer_cowoncy_adjustment');
		const session = await p.mongo.startSession();
		let previousBalance = '0';
		let newBalance = '0';

		try {
			await session.withTransaction(async () => {
				const previous = await balances.findOne(
					{ id: targetId },
					{ projection: { money: 1 }, session }
				);
				previousBalance = mongoNumeric.integerString(previous?.money ?? '0');

				if (operation === 'set') {
					await balances.updateOne(
						{ id: targetId },
						{ $set: { id: targetId, money: amount } },
						{ upsert: true, session }
					);
				} else {
					await mongoNumeric.add(
						balances,
						{ id: targetId },
						'money',
						amount,
						{ upsert: true, session },
						{ id: targetId }
					);
				}

				const updated = await balances.findOne(
					{ id: targetId },
					{ projection: { money: 1 }, session }
				);
				newBalance = mongoNumeric.integerString(updated?.money ?? '0');

				await audit.insertOne(
					{
						actorId: String(p.msg.author.id),
						targetId,
						operation,
						amount,
						previousBalance,
						newBalance,
						createdAt: new Date(),
					},
					{ session }
				);
			});
		} catch (err) {
			console.error('[Developer Cowoncy] Failed to update balance:', err);
			return p.errorMsg(', failed to update cowoncy. Check the bot logs for details.');
		} finally {
			await session.endSession();
		}

		const action = operation === 'set' ? 'Set' : 'Added';
		const amountText = formatInteger(amount);
		const previousText = formatInteger(previousBalance);
		const newText = formatInteger(newBalance);

		return p.send(
			`💰 **| ${action} cowoncy for <@${targetId}>**\n` +
				`${p.config.emoji.blank} **| Amount:** ${amountText}\n` +
				`${p.config.emoji.blank} **| Previous:** ${previousText}\n` +
				`${p.config.emoji.blank} **| New balance:** ${newText}`
		);
	},
});

function parseArguments(p) {
	if (p.args.length !== 1 && p.args.length !== 2) {
		p.errorMsg(
			`, invalid syntax! Use \`${p.config.prefix || 'owo'} ${p.command} <amount>\` or \`${
				p.config.prefix || 'owo'
			} ${p.command} <user> <amount>\``
		);
		return null;
	}

	let targetId = String(p.msg.author.id);
	let rawAmount = p.args[0];

	if (p.args.length === 2) {
		targetId = parseUserId(p.args[0]);
		rawAmount = p.args[1];
		if (!targetId) {
			p.errorMsg(', invalid user. Mention a user or provide their Discord user ID.');
			return null;
		}
	}

	try {
		const amount = mongoNumeric.integerString(String(rawAmount).replace(/,/g, ''));
		return { targetId, amount };
	} catch (_err) {
		p.errorMsg(', invalid amount. Use a whole number such as `1000000`.');
		return null;
	}
}

function parseUserId(value) {
	const match = String(value).match(/^(?:<@!?)?(\d+)>?$/);
	return match ? match[1] : null;
}

function formatInteger(value) {
	return BigInt(value).toLocaleString('en-US');
}
