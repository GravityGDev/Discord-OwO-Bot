/*
 * OwO Bot for Discord
 * Copyright (C) 2021 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const surveyEmoji = '📝';
const surveyLogChannel = '882521311371485184';
const legacyClaimDate = new Date('2017-01-01T00:00:00.000Z');

exports.handle = async function (msg, _ack) {
	const survey = await getSurvey.bind(this)(msg.author.id);
	if (!survey) return;

	const currentQuestion = survey.questions.find(
		(question) => survey.state.question_number === question.number
	);
	if (!currentQuestion) return;

	const outcome = await sendNextQuestion.bind(this)(msg, survey, currentQuestion);
	if (!outcome) return;

	const embed = {
		title: currentQuestion.question,
		author: {
			name: `Question ${currentQuestion.sid}.${currentQuestion.number}`,
		},
		description: msg.content.trim(),
		color: this.config.embed_color,
	};
	this.snailSocket.messageChannel(surveyLogChannel, { embed });

	if (outcome.nextQuestion) {
		const text = `**Question ${outcome.nextQuestion.number}:** *${outcome.nextQuestion.question}*`;
		await this.sender.msgUser(msg.author.id, text);
	} else if (outcome.completed) {
		const text = `${surveyEmoji} **|** Thanks for completing the survey! You have received 5 ${this.config.emoji.lootbox} and 5 ${this.config.emoji.crate}`;
		await this.sender.msgUser(msg.author.id, text);
	}
};

async function getSurvey(userId) {
	const uid = await this.global.getUid(userId);
	const userSurvey = await this.mongo.collection('user_survey');
	const questions = await this.mongo.collection('survey_question');
	const state = await userSurvey.findOne({ uid, in_progress: 1 });
	if (!state) return;

	const rows = await questions.find({ sid: state.sid }).sort({ number: 1 }).toArray();
	if (!rows.length) return;
	return { state, questions: rows };
}

async function sendNextQuestion(msg, survey, currentQuestion) {
	const { uid, sid, question_number: questionNumber } = survey.state;
	const nextQuestion = survey.questions.find((question) => questionNumber + 1 === question.number);
	const userSurvey = await this.mongo.collection('user_survey');
	const lootbox = await this.mongo.collection('lootbox');
	const crate = await this.mongo.collection('crate');
	const session = await this.mongo.startSession();
	let outcome;

	try {
		await session.withTransaction(async () => {
			outcome = undefined;
			const filter = {
				uid,
				sid,
				in_progress: 1,
				is_done: { $ne: 1 },
				question_number: currentQuestion.number,
			};

			if (nextQuestion) {
				const changed = await userSurvey.updateOne(
					filter,
					{ $set: { question_number: nextQuestion.number } },
					{ session }
				);
				if (changed.modifiedCount) outcome = { nextQuestion };
				return;
			}

			const changed = await userSurvey.updateOne(
				filter,
				{
					$set: {
						question_number: currentQuestion.number + 1,
						in_progress: 0,
						is_done: 1,
					},
				},
				{ session }
			);
			if (!changed.modifiedCount) return;

			await lootbox.updateOne(
				{ id: String(msg.author.id) },
				{
					$inc: { boxcount: 5 },
					$setOnInsert: {
						id: String(msg.author.id),
						claimcount: 0,
						claim: legacyClaimDate,
						fbox: 0,
					},
				},
				{ upsert: true, session }
			);
			await crate.updateOne(
				{ uid, cratetype: 0 },
				{
					$inc: { boxcount: 5 },
					$setOnInsert: {
						uid,
						cratetype: 0,
						claimcount: 0,
						claim: legacyClaimDate,
					},
				},
				{ upsert: true, session }
			);
			outcome = { completed: true };
		});
	} catch (err) {
		console.error(err);
		return;
	} finally {
		await session.endSession();
	}

	return outcome;
}
