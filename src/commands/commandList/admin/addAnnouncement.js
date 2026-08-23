/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');
const mongoCounters = require('../../../utils/mongoCounters.js');

module.exports = new CommandInterface({
	alias: ['addannouncement'],

	owner: true,

	execute: async function (p) {
		try {
			const url = p.args[0];
			const data = await p.DataResolver.urlToBuffer(url);
			await p.send('This is a test message! Does it look ok?', null, {
				file: data,
				name: 'announcement.png',
			});

			const announcements = await p.mongo.collection('announcement');
			const latest = await announcements.findOne({}, { sort: { aid: -1 } });
			await mongoCounters.seedAtLeast('announcement_aid', latest?.aid || 0);
			const aid = await mongoCounters.next('announcement_aid');
			await announcements.insertOne({ aid, url, adate: new Date() });
			await p.send('Added new announcement!');
		} catch (err) {
			console.error(err);
			p.errorMsg(', failed to add announcement');
		}
	},
});
