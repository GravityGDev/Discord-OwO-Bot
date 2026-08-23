/* MongoDB data helpers shared by ranking commands. */

const mongo = require('../../../utils/mongo.js');

function scoreExpr(field) {
	return {
		$convert: {
			input: `$${field}`,
			to: 'decimal',
			onError: 0,
			onNull: 0,
		},
	};
}

function constantScore(value) {
	return {
		$convert: {
			input: String(value ?? 0),
			to: 'decimal',
			onError: 0,
			onNull: 0,
		},
	};
}

function clean(rows) {
	return rows.map((row) => {
		delete row.__rankScore;
		delete row.user;
		return row;
	});
}

exports.memberIds = function (msg) {
	const ids = [];
	msg.channel.guild.members.forEach((_member, id) => ids.push(String(id)));
	return ids;
};

exports.topDirect = async function ({
	collection,
	scoreField,
	count,
	memberIds,
	higherBetter = true,
	match = {},
}) {
	const c = await mongo.collection(collection);
	const filter = { ...match };
	if (memberIds) filter.id = { $in: memberIds };
	const rows = await c
		.aggregate([
			{ $match: filter },
			{ $addFields: { __rankScore: scoreExpr(scoreField) } },
			{ $sort: { __rankScore: higherBetter ? -1 : 1 } },
			{ $limit: count },
		])
		.toArray();
	return clean(rows);
};

exports.aroundDirect = async function ({
	collection,
	scoreField,
	authorId,
	memberIds,
	higherBetter = true,
	match = {},
	meMatch,
	meSort,
}) {
	const c = await mongo.collection(collection);
	const ownFilter = { ...(meMatch || {}), id: String(authorId) };
	let cursor = c.find(ownFilter);
	if (meSort) cursor = cursor.sort(meSort);
	const me = await cursor.limit(1).next();
	if (!me) return { above: [], below: [], me: null };

	const candidate = { ...match };
	if (memberIds) candidate.id = { $in: memberIds };
	const target = constantScore(me[scoreField]);
	const betterOp = higherBetter ? '$gt' : '$lt';
	const worseOp = higherBetter ? '$lt' : '$gt';
	const betterSort = higherBetter ? 1 : -1;
	const worseSort = higherBetter ? -1 : 1;

	const above = await c
		.aggregate([
			{ $match: candidate },
			{ $addFields: { __rankScore: scoreExpr(scoreField) } },
			{ $match: { $expr: { [betterOp]: ['$__rankScore', target] } } },
			{ $sort: { __rankScore: betterSort } },
			{ $limit: 2 },
		])
		.toArray();
	const below = await c
		.aggregate([
			{ $match: candidate },
			{ $addFields: { __rankScore: scoreExpr(scoreField) } },
			{ $match: { $expr: { [worseOp]: ['$__rankScore', target] } } },
			{ $sort: { __rankScore: worseSort } },
			{ $limit: 2 },
		])
		.toArray();
	const rankRows = await c
		.aggregate([
			{ $match: candidate },
			{ $addFields: { __rankScore: scoreExpr(scoreField) } },
			{ $match: { $expr: { [betterOp]: ['$__rankScore', target] } } },
			{ $count: 'count' },
		])
		.toArray();

	me.rank = Number(rankRows[0]?.count || 0) + 1;
	return { above: clean(above), below: clean(below), me };
};

function joinedUidPipeline(scoreField, memberIds, match = {}) {
	const pipeline = [
		{ $match: match },
		{
			$lookup: {
				from: 'user',
				localField: 'uid',
				foreignField: 'uid',
				as: 'user',
			},
		},
		{ $unwind: '$user' },
	];
	if (memberIds) pipeline.push({ $match: { 'user.id': { $in: memberIds } } });
	pipeline.push({ $addFields: { id: '$user.id', __rankScore: scoreExpr(scoreField) } });
	return pipeline;
}

exports.topUidScores = async function ({
	collection,
	scoreField,
	count,
	memberIds,
	higherBetter = true,
	match = {},
}) {
	const c = await mongo.collection(collection);
	const pipeline = joinedUidPipeline(scoreField, memberIds, match);
	pipeline.push({ $sort: { __rankScore: higherBetter ? -1 : 1 } }, { $limit: count });
	return clean(await c.aggregate(pipeline).toArray());
};

exports.aroundUidScores = async function ({
	collection,
	scoreField,
	authorId,
	memberIds,
	higherBetter = true,
	match = {},
	meExtraMatch = {},
}) {
	const c = await mongo.collection(collection);
	const mePipeline = joinedUidPipeline(scoreField, null, { ...match, ...meExtraMatch });
	mePipeline.push(
		{ $match: { 'user.id': String(authorId) } },
		{ $sort: { __rankScore: higherBetter ? -1 : 1 } },
		{ $limit: 1 }
	);
	const ownRows = await c.aggregate(mePipeline).toArray();
	const me = ownRows[0];
	if (!me) return { above: [], below: [], me: null };

	const target = constantScore(me[scoreField]);
	const betterOp = higherBetter ? '$gt' : '$lt';
	const worseOp = higherBetter ? '$lt' : '$gt';
	const betterSort = higherBetter ? 1 : -1;
	const worseSort = higherBetter ? -1 : 1;
	const base = () => joinedUidPipeline(scoreField, memberIds, match);

	const abovePipeline = base();
	abovePipeline.push(
		{ $match: { $expr: { [betterOp]: ['$__rankScore', target] } } },
		{ $sort: { __rankScore: betterSort } },
		{ $limit: 2 }
	);
	const belowPipeline = base();
	belowPipeline.push(
		{ $match: { $expr: { [worseOp]: ['$__rankScore', target] } } },
		{ $sort: { __rankScore: worseSort } },
		{ $limit: 2 }
	);
	const rankPipeline = base();
	rankPipeline.push(
		{ $match: { $expr: { [betterOp]: ['$__rankScore', target] } } },
		{ $count: 'count' }
	);

	const above = await c.aggregate(abovePipeline).toArray();
	const below = await c.aggregate(belowPipeline).toArray();
	const rankRows = await c.aggregate(rankPipeline).toArray();
	me.rank = Number(rankRows[0]?.count || 0) + 1;
	return { above: clean(above), below: clean(below), me: clean([me])[0] };
};

exports.getActiveTeamPgid = async function (authorId) {
	const users = await mongo.collection('user');
	const user = await users.findOne({ id: String(authorId) }, { projection: { uid: 1 } });
	if (!user?.uid) return null;
	const teams = await mongo.collection('pet_team');
	const rows = await teams.find({ uid: user.uid }).sort({ pgid: 1 }).toArray();
	if (!rows.length) return null;
	const active = await mongo.collection('pet_team_active');
	const activeRow = await active.findOne({ uid: user.uid }, { projection: { pgid: 1 } });
	if (activeRow?.pgid && rows.some((row) => row.pgid === activeRow.pgid)) return activeRow.pgid;
	return rows[0].pgid;
};
