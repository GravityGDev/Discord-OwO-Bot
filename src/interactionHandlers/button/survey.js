/*
 * OwO Bot for Discord
 * Copyright (C) 2021 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const surveyEmoji = '📝';

exports.handle = async function (data, ack) {
	const user = data.member.user;
	const uid = await this.global.getUid(user.id);
	if (!(await startSurvey.bind(this)(user, uid))) return;
	await ack();
};

async function startSurvey(user, uid) {
	const surveys = await this.mongo.collection('survey');
	const questions = await this.mongo.collection('survey_question');
	const userSurveys = await this.mongo.collection('user_survey');
	const session = await this.mongo.startSession();
	let survey;
	let started = false;

	try {
		await session.withTransaction(async () => {
			started = false;
			const latest = await surveys.findOne({}, { sort: { sid: -1 }, session });
			if (!latest) return;

			survey = await questions.find({ sid: latest.sid }, { session }).sort({ number: 1 }).toArray();
			if (!survey.length) return;

			const state = await userSurveys.findOne({ uid }, { session });
			if (state?.in_progress) return;
			if (state?.sid == latest.sid && state?.is_done) return;

			await userSurveys.updateOne(
				{ uid },
				{
					$set: {
						uid,
						sid: latest.sid,
						in_progress: 1,
						question_number: 1,
						is_done: 0,
					},
				},
				{ upsert: true, session }
			);
			started = true;
		});
	} catch (err) {
		console.error(err);
		return false;
	} finally {
		await session.endSession();
	}

	if (!started || !survey?.length) return false;

	let text = `${surveyEmoji} **|** Thanks for participating in the survey! There are ${survey.length} questions.`;
	text += `\n${this.config.emoji.blank} **|** You will get a reward for completing all questions.`;
	text += `\n${this.config.emoji.blank} **|** All answers are submitted anonymously.`;
	text += `\n\n**Question 1:** *${survey[0].question}*`;
	await this.sender.msgUser(user.id, text);
	return true;
}
