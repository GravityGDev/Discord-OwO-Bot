#!/usr/bin/env python3
"""Finish the remaining rank-sale MongoDB cutover in weaponUtil.js."""

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
FILE = ROOT / "src/commands/commandList/battle/util/weaponUtil.js"
content = FILE.read_text()

if "const rows = await hydrateWeaponRows(weaponDocs);\n\tconst parsed = parseWeaponQuery(rows);" in content and "let sql = `SELECT\n\t\t\ta.uwid" not in content:
    print("Rank-wide weapon sales are already MongoDB-backed")
    raise SystemExit(0)

pattern = re.compile(
    r"let sellRank = \(exports\.sellRank = async function \(p, rankLoc\) \{.*?\n\}\);\n\n/\* Shorten a uwid",
    re.S,
)
if not pattern.search(content):
    raise RuntimeError("Could not locate legacy sellRank block")

replacement = r'''let sellRank = (exports.sellRank = async function (p, rankLoc) {
	let min = 0;
	let max = 0;
	for (let i = 0; i <= rankLoc; i++) {
		const rankInfo = WeaponInterface.ranks[i];
		min = max;
		max += rankInfo[0];
	}
	min *= 100;
	max *= 100;
	const lastRank = rankLoc == WeaponInterface.ranks.length - 1;
	const uid = await p.global.getUid(p.msg.author.id);
	const collection = await mongo.collection('user_weapon');
	const avg = min === 0 ? { $gte: min } : { $gt: min };
	if (!lastRank) avg.$lte = max;

	const weaponDocs = await collection
		.find({ uid, avg, pid: null, favorite: { $ne: 1 } })
		.limit(500)
		.toArray();
	if (!weaponDocs.length) {
		p.errorMsg(', you do not have any weapons with this rank!', 3000);
		return;
	}

	const rows = await hydrateWeaponRows(weaponDocs);
	const parsed = parseWeaponQuery(rows);
	const sellable = [];
	for (const key in parsed) {
		const weapon = parseWeapon(parsed[key]);
		if (weapon && !weapon.unsellable) sellable.push(weapon);
	}
	if (!sellable.length) {
		p.errorMsg(', you do not have any weapons with this rank!', 3000);
		return;
	}

	const priceEach = prices[WeaponInterface.ranks[rankLoc][1]];
	if (!priceEach) {
		p.errorMsg(', Something went terribly wrong...');
		return;
	}
	const byId = new Map(sellable.map((weapon) => [Number(weapon.ruwid), weapon]));
	const result = await removeWeaponsAndCredit(p, uid, [...byId.keys()], priceEach);
	if (!result.count) {
		p.errorMsg(', you do not have any weapons with this rank!', 3000);
		return;
	}
	const sold = result.uwids.map((id) => byId.get(Number(id))).filter(Boolean);
	const rank = `${WeaponInterface.ranks[rankLoc][2]} **${WeaponInterface.ranks[rankLoc][1]}**`;

	p.replyMsg(
		weaponEmoji,
		`, You sold all your ${rank} weapons for **${result.total}** cowoncy!\n${
			p.config.emoji.blank
		} **| Sold:** ${sold.map((weapon) => weapon.emoji).join('')}`
	);
	p.logger.incr('cowoncy', result.total, { type: 'sell' }, p.msg);
});

/* Shorten a uwid'''

content = pattern.sub(lambda _m: replacement, content, count=1)
FILE.write_text(content)
print("Converted rank-wide weapon sales to MongoDB")
