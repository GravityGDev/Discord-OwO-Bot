/*
 * OwO Bot for Discord
 * Copyright (C) 2021 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const CommandInterface = require('../../CommandInterface.js');

const surveyEmoji = '📝';

module.exports = new CommandInterface({
	alias: ['survey'],

	args: '',

	desc: 'View the latest survey! Surveys can help us improve the bot.',

	example: [],

	related: ['owo daily'],

	permissions: ['sendMessages', 'embedLinks', 'attachFiles'],

	group: ['utility'],

	cooldown: 10000,
	half: 100,
	six: 500,

	execute: async function () {
		const uid = await this.global.getUid(this.msg.author.id);
		const { inProgress, newSurvey } = (await getSurvey.bind(this)(uid)) || {};

		if (inProgress) {
			await this.replyMsg(surveyEmoji, ', You already have a survey in progress!');
			return;
		}

		if (!newSurvey) {
			await this.replyMsg(surveyEmoji, ', There is no survey available.');
			return;
		}

		const components = [
			{
				type: 1,
				components: [
					{
						type: 2,
						label: 'Answer Survey',
						style: 1,
						custom_id: 'survey',
						emoji: {
							id: null,
							name: surveyEmoji,
						},
					},
				],
			},
		];

		await this.replyMsg(surveyEmoji, {
			content: ', There is a survey available! Complete it to earn a reward!',
			components,
		});
	},
});

async function getSurvey(uid) {
	const surveys = await this.mongo.collection('survey');
	const questions = await this.mongo.collection('survey_question');
	const userSurveys = await this.mongo.collection('user_survey');
	const latest = await surveys.findOne({}, { sort: { sid: -1 } });
	if (!latest) return;

	const survey = await questions.find({ sid: latest.sid }).sort({ number: 1 }).toArray();
	if (!survey.length) return;

	const userSurvey = await userSurveys.findOne({ uid });
	if (!userSurvey) return { newSurvey: survey };
	if (userSurvey.in_progress) return { inProgress: true };
	if (userSurvey.sid == latest.sid && userSurvey.is_done) return;
	return { newSurvey: survey };
}
