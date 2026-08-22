/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');

const teamUtil = require('./util/teamUtil.js');
const battleFriendUtil = require('./util/battleFriendUtil.js');
const starEmoji = '⭐';

module.exports = new CommandInterface({
	alias: ['teams', 'setteam', 'squads', 'useteams'],

	args: '{teamNumber}',

	desc: 'Select a different team!',

	example: ['owo teams', 'owo setteam 2'],

	related: ['owo battle', 'owo team'],

	permissions: ['sendMessages', 'embedLinks', 'addReactions'],

	group: ['animals'],

	cooldown: 5000,
	half: 80,
	six: 500,

	execute: async function (p) {
		if (p.args.length < 1) {
			await displayTeams(p);
		} else if (p.global.isInt(p.args[0])) {
			await setTeam(p, +p.args[0]);
		} else {
			p.errorMsg(', the correct syntax is `owo setteam {teamNumber}`', 3000);
		}
	},
});

async function displayTeams(p) {
	const maxTeams = await teamUtil.getMaxTeams.bind(p)(p.msg.author);
	const info = await teamUtil.getUserTeamPgids(p, p.msg.author.id);
	if (!info.pgids.length) {
		p.errorMsg(", you don't have a team! Create one with `owo team add {animalName}`!", 5000);
		return;
	}

	let activeTeam = info.pgids.indexOf(info.activePgid);
	if (activeTeam < 0) activeTeam = 0;
	const teams = [];

	for (let i = 0; i < info.pgids.length && i < maxTeams; i++) {
		const pgid = info.pgids[i];
		const rows = await teamUtil.getJoinedTeamRows(p, pgid);
		if (!rows.length) continue;
		const other = {
			streak: rows[0].streak || 0,
			highest_streak: rows[0].highest_streak || 0,
			tname: rows[0].tname || 'team',
		};
		const team = teamUtil.parseTeam(rows, rows);
		teams[i] = teamUtil.createTeamEmbed(p, team, other);
	}

	for (let i = 0; i < maxTeams; i++) {
		if (!teams[i]) {
			teams[i] = {
				author: {
					name: p.getName() + "'s team",
					icon_url: p.msg.author.avatarURL,
				},
				description:
					'`owo team add {animal} {pos}` Add an animal to your team\n`owo team remove {pos}` Removes an animal from your team\n`owo team rename {name}` Renames your team\n`owo rename {animal} {name}` Rename an animal\n`owo setteam {teamNum}` to set multiple teams',
				color: p.config.embed_color,
				footer: {
					text: `Current Streak: 0 | Highest Streak: 0 | Page ${i + 1}/${maxTeams}`,
				},
				fields: [],
			};
			for (let j = 1; j <= 3; j++) {
				teams[i].fields.push({
					name: 'none',
					value: '*`owo team add {animal} ' + j + '`*',
					inline: true,
				});
			}
		} else {
			teams[i].footer.text += ` | Page ${i + 1}/${maxTeams}`;
		}
		if (activeTeam == i) teams[i].footer.text += ' ' + starEmoji;
	}

	const createEmbed = (curr) => teams[curr];
	const additionalButtons = [
		{
			type: 2,
			style: 1,
			custom_id: 'star',
			emoji: {
				id: null,
				name: starEmoji,
			},
		},
	];
	const additionalFilter = (componentName, user) =>
		componentName === 'star' && user.id == p.msg.author.id;
	const pagedMsg = new p.PagedMessage(p, createEmbed, maxTeams - 1, {
		startingPage: Math.min(activeTeam, maxTeams - 1),
		idle: 120000,
		additionalFilter,
		additionalButtons,
	});

	/* eslint-disable-next-line */
	pagedMsg.on('button', async (component, user, ack, { currentPage, maxPage }) => {
		if (component === 'star') {
			await setTeam(p, currentPage + 1, true);
			for (let i in teams) teams[i].footer.text = teams[i].footer.text.replace(` ${starEmoji}`, '');
			teams[currentPage].footer.text += ` ${starEmoji}`;
			await ack({ embed: teams[currentPage] });
		}
	});
}

async function setTeam(p, teamNum, dontDisplay) {
	const maxTeams = await teamUtil.getMaxTeams.bind(p)(p.msg.author);
	if (!teamNum || teamNum < 1 || teamNum > maxTeams) {
		p.errorMsg(', invalid team number!', 3000);
		return;
	}

	if (await battleFriendUtil.inBattle(p)) {
		p.errorMsg(
			', You cannot change your team while you have a pending battle! Use `owo db` to decline',
			3000
		);
		return;
	}

	const uid = await p.global.getUid(p.msg.author.id);
	const info = await teamUtil.getUserTeamPgids(p, p.msg.author.id);
	let pgid = info.pgids[teamNum - 1];
	if (!pgid) pgid = await teamUtil.createEmptyTeam(p, uid);

	const active = await p.mongo.collection('pet_team_active');
	await active.updateOne({ uid }, { $set: { uid, pgid } }, { upsert: true });

	if (!dontDisplay) await displayTeams(p);
}
