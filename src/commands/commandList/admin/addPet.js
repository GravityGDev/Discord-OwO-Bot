/*
 * OwO Bot for Discord
 * Copyright (C) 2023 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');
const mongoCounters = require('../../../utils/mongoCounters.js');

module.exports = new CommandInterface({
	alias: ['addpet'],

	owner: true,

	execute: async function () {
		const name = this.args[0];
		const id = this.args[1];

		const animal = this.global.validAnimal(name);
		if (!animal) {
			return this.errorMsg(', Unknown animal');
		}
		if (!this.global.isInt(id)) {
			return this.errorMsg(', Invalid user id');
		}

		const animals = await this.mongo.collection('animal');
		if (await animals.findOne({ id: String(id), name: animal.value })) {
			return this.errorMsg(', That user already owns this animal');
		}
		const pid = await mongoCounters.next('animal_pid');
		const result = await animals.insertOne({
			id: String(id),
			name: animal.value,
			pid,
			count: 1,
			totalcount: 1,
			xp: 0,
			ispet: 0,
			nickname: null,
			offensive: 0,
			sellcount: 0,
			saccount: 0,
		});
		this.send(`\`\`\`\n${JSON.stringify({ acknowledged: result.acknowledged, pid }, null, 2)}\n\`\`\``);
	},
});
