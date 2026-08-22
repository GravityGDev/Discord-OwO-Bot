/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const debugGuilds = new Set(
	(process.env.DEBUG_GUILD_IDS || '')
		.split(',')
		.map((id) => id.trim())
		.filter(Boolean)
);
const levels = require('../utils/levels.js');
/* eslint-disable-next-line */
const blacklist = require('../utils/blacklist.js');
const survey = require('../utils/survey.js');

// Fired when a message is created
exports.handle = async function (msg, raw) {
	// if (blacklist.checkBot(msg)) return;
	if (this.optOut[msg.author.id]) return;
	if (this.pause) return;

	// Ignore if bot
	if (msg.author.bot) {
		return;
	} else if (
		/* Debug mode is single-shard, not single-server. Only restrict guilds when explicitly configured. */
		this.debug &&
		debugGuilds.size &&
		msg.channel.guild &&
		!debugGuilds.has(msg.channel.guild.id)
	) {
		return;
	} else if (await this.command.executeAdmin(msg, raw)) {
		return;

		// no guild, its a dm
	} else if (!msg.channel.guild) {
		if (await this.macro.verify(msg, msg.content.trim())) {
			survey.handle.bind(this)(msg);
		}
	} else {
		this.command.execute(msg, raw).catch((err) => {
			console.error('[Command] Failed to execute message command');
			console.error(err);
		});
		levels.giveXP(msg).catch((err) => {
			console.error('[XP] Failed to process message XP');
			console.error(err);
		});
	}
};
