/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

const LEGACY_PRIVILEGED_USER_IDS = ['184587051943985152', '460987842961866762'];
const ROOTS = ['index.js', 'src', 'utils'];
const ALLOWED_EXTENSIONS = new Set(['.js', '.json']);

function collectFiles(target, files = []) {
	if (!fs.existsSync(target)) return files;
	const stat = fs.statSync(target);
	if (stat.isFile()) {
		if (ALLOWED_EXTENSIONS.has(path.extname(target))) files.push(target);
		return files;
	}

	for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
		const fullPath = path.join(target, entry.name);
		if (entry.isDirectory()) collectFiles(fullPath, files);
		else if (ALLOWED_EXTENSIONS.has(path.extname(entry.name))) files.push(fullPath);
	}
	return files;
}

const matches = [];
for (const root of ROOTS) {
	for (const file of collectFiles(path.resolve(process.cwd(), root))) {
		const content = fs.readFileSync(file, 'utf8');
		for (const id of LEGACY_PRIVILEGED_USER_IDS) {
			if (content.includes(id)) {
				matches.push(`${path.relative(process.cwd(), file)} contains legacy privileged user ID ${id}`);
			}
		}
	}
}

const config = require('../src/data/config.json');
if (!/^\d{17,20}$/.test(String(config.owner || ''))) {
	matches.push('src/data/config.json does not contain a valid Discord owner ID');
}

if (matches.length) {
	console.error('[OwnerAudit] Runtime owner audit failed:');
	for (const match of matches) console.error(`- ${match}`);
	process.exit(1);
}

console.log(`[OwnerAudit] Runtime owner ID is centralized on config.owner (${config.owner}).`);
console.log('[OwnerAudit] No known legacy privileged Discord user IDs remain in runtime files.');
