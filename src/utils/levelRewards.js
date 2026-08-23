const request = require('request');
const levels = require('./levels.js');
const global = require('./global.js');
const mongo = require('./mongo.js');
const mongoNumeric = require('./mongoNumeric.js');
const DataResolver = require('./dataResolver.js');
const levelupEmoji = '🎉';
const infoEmoji = 'ℹ';
const legacyClaimDate = new Date('2017-01-01T00:00:00.000Z');

exports.distributeRewards = async function (msg) {
	const perms = msg.channel.permissionsOf(global.getClient().user.id);
	if (!perms.has('readMessages') || !perms.has('sendMessages') || !perms.has('attachFiles')) return;

	const level = (await levels.getUserLevel(msg.author.id)).level;
	const uid = await global.getUid(msg.author.id);
	const rewards = await mongo.collection('user_level_rewards');
	const guildSettings = await mongo.collection('guild_setting');
	const guildSetting = await guildSettings.findOne({ id: String(msg.channel.guild.id) });
	if (guildSetting?.levelup == 1) return;

	const current = await rewards.findOne({ uid });
	const plevel = Number(current?.rewardLvl || 0);
	if (plevel >= level) return;

	let cowoncy = 0;
	let lootbox = 0;
	let weaponcrate = 0;
	for (let i = plevel + 1; i <= level; i++) {
		const reward = getReward(i);
		cowoncy += reward.cowoncy;
		lootbox += reward.lootbox;
		weaponcrate += reward.weaponcrate;
	}

	let uuid;
	let url;
	let buffer;
	try {
		uuid = await generateImage(msg, { level, cowoncy, lootbox, weaponcrate });
		if (!uuid) return;
		url = `${process.env.GEN_HOST}/levelup/${uuid}.png`;
		buffer = await DataResolver.urlToBuffer(url);
	} catch (err) {
		return;
	}

	const applied = await applyLevelRewards(msg.author.id, uid, plevel, level, {
		cowoncy,
		lootbox,
		weaponcrate,
	});
	if (!applied) return;

	let text = levelupEmoji + ' **| ' + global.getName(msg.member || msg.author) + '** leveled up!';
	if (level - plevel > 1) {
		text += '\n<:blank:427371936482328596> **|** Extra rewards were added for missing levels';
	}
	if (!plevel) {
		text +=
			'\n' +
			infoEmoji +
			' **|** Level up messages can be disabled for the guild with `owo level disabletext`';
	}
	await msg.channel.createMessage(text, { file: buffer, name: 'levelup.png' });
};

async function applyLevelRewards(id, uid, previousLevel, level, reward) {
	const rewardCollection = await mongo.collection('user_level_rewards');
	const cowoncyCollection = await mongo.collection('cowoncy');
	const crateCollection = await mongo.collection('crate');
	const lootboxCollection = await mongo.collection('lootbox');
	const session = await mongo.startSession();
	let applied = false;

	try {
		await session.withTransaction(async () => {
			applied = false;
			const current = await rewardCollection.findOne({ uid }, { session });
			const currentLevel = Number(current?.rewardLvl || 0);
			if (currentLevel !== previousLevel || currentLevel >= level) return;

			if (current) {
				const changed = await rewardCollection.updateOne(
					{ _id: current._id, rewardLvl: current.rewardLvl },
					{ $set: { rewardLvl: level } },
					{ session }
				);
				if (!changed.modifiedCount) return;
			} else {
				await rewardCollection.insertOne({ uid, rewardLvl: level }, { session });
			}

			await mongoNumeric.add(
				cowoncyCollection,
				{ id: String(id) },
				'money',
				reward.cowoncy,
				{ upsert: true, session },
				{ id: String(id) }
			);
			await crateCollection.updateOne(
				{ uid, cratetype: 0 },
				{
					$inc: { boxcount: reward.weaponcrate },
					$setOnInsert: { uid, cratetype: 0, claimcount: 0, claim: legacyClaimDate },
				},
				{ upsert: true, session }
			);
			await lootboxCollection.updateOne(
				{ id: String(id) },
				{
					$inc: { boxcount: reward.lootbox },
					$setOnInsert: { id: String(id), claimcount: 0, claim: legacyClaimDate, fbox: 0 },
				},
				{ upsert: true, session }
			);
			applied = true;
		});
	} catch (err) {
		if (err?.code !== 11000) console.error(err);
		return false;
	} finally {
		await session.endSession();
	}
	return applied;
}

function getReward(lvl) {
	return { cowoncy: lvl * 5000, lootbox: lvl, weaponcrate: lvl };
}

async function generateImage(msg, reward) {
	const background = await getBackground(msg.author);
	let avatarURL = msg.author.dynamicAvatarURL('png');
	avatarURL = avatarURL.replace(/\?[a-zA-Z0-9=?&]+/gi, '');

	const info = {
		theme: {
			background: background.id,
			name_color: background.color,
		},
		user: {
			avatarURL,
			name: global.getName(msg.author),
		},
		level: reward.level,
		rewards: [
			{ img: 'cowoncy.png', text: '+' + global.toFancyNum(reward.cowoncy) },
			{ img: 'lootbox.png', text: '+' + global.toFancyNum(reward.lootbox) },
			{ img: 'crate.png', text: '+' + global.toFancyNum(reward.weaponcrate) },
		],
	};
	info.password = process.env.GEN_PASS;
	try {
		return new Promise((resolve) => {
			request(
				{
					method: 'POST',
					uri: `${process.env.GEN_API_HOST}/levelupgen`,
					json: true,
					body: info,
				},
				(error, res, body) => {
					if (error) return resolve('');
					if (res.statusCode == 200) resolve(body);
					else resolve('');
				}
			);
		});
	} catch (err) {
		console.error(err);
		return '';
	}
}

async function getBackground(user) {
	const uid = await global.getUid(user.id);
	const profiles = await mongo.collection('user_profile');
	const backgrounds = await mongo.collection('backgrounds');
	const profile = await profiles.findOne({ uid });
	if (!profile?.bid) return { id: 1 };
	const background = await backgrounds.findOne({ bid: profile.bid });
	if (!background) return { id: 1 };
	return { id: background.bid, color: background.name_color };
}
