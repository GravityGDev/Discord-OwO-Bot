/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');

module.exports = new CommandInterface({
	alias: ['rename'],

	args: '[animal] [name]',

	desc: 'Rename an animal from your zoo!',

	example: ['owo rename dog doggy'],

	related: ['owo zoo', 'owo battle', 'owo hunt'],

	permissions: ['sendMessages'],

	group: ['animals'],

	cooldown: 3000,
	half: 200,
	six: 500,

	execute: async function (p) {
		if (p.args.length < 2) {
			return p.errorMsg(', The correct command is `owo rename [animal] [name]`!');
		}

		let animal = p.args.shift();
		let input = p.args.join(' ');

		animal = p.global.validAnimal(animal);
		if (!animal) {
			return p.errorMsg(", I couldn't find that animal! D:");
		}
		if (input.length > 35) {
			return p.errorMsg(', The nickname is too long!', 3000);
		} else if (input == '') {
			return p.errorMsg(', Invalid nickname!', 3000);
		}

		const { name, offensive } = p.global.filteredName(input);
		if (name == '') {
			return p.errorMsg(', Invalid nickname!', 3000);
		}

		const animals = await p.mongo.collection('animal');
		const result = await animals.updateOne(
			{ id: String(p.msg.author.id), name: animal.value },
			{ $set: { nickname: name, offensive } }
		);

		if (result.matchedCount == 0) {
			p.errorMsg(', you do not own this pet!', 3000);
		} else {
			p.replyMsg(
				'🌱',
				p.replaceMentions(
					', you successfully named your pet **' +
						(animal.uni ? animal.uni : animal.value) +
						'** to **' +
						name +
						'**!'
				)
			);
		}
	},
});
