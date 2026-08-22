/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const API_BASE = 'https://discord.com/api/v10';
const CDN_BASE = 'https://cdn.discordapp.com/emojis';
const ROOTS = ['src', 'utils', 'index.js'];
const ALLOWED_EXTENSIONS = new Set(['.js', '.json', '.txt']);
const EMOJI_REGEX = /<(a?):([A-Za-z0-9_]+):(\d{15,22})>/g;
const REPORT_PATH = path.resolve(process.cwd(), 'runtime/application-emojis.json');
const APPLICATION_EMOJI_LIMIT = 2000;

const token = process.env.BOT_TOKEN;

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

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

function discoverEmojiReferences(files) {
	const emojis = new Map();
	for (const file of files) {
		const content = fs.readFileSync(file, 'utf8');
		EMOJI_REGEX.lastIndex = 0;
		let match;
		while ((match = EMOJI_REGEX.exec(content))) {
			const animated = match[1] === 'a';
			const name = match[2];
			const id = match[3];
			if (!emojis.has(id)) {
				emojis.set(id, {
					id,
					name,
					animated,
					files: new Set(),
				});
			}
			emojis.get(id).files.add(path.relative(process.cwd(), file));
		}
	}
	return emojis;
}

async function discordRequest(method, endpoint, data) {
	let attempt = 0;
	while (attempt < 10) {
		attempt++;
		try {
			return await axios({
				method,
				url: `${API_BASE}${endpoint}`,
				data,
				headers: {
					Authorization: `Bot ${token}`,
					'Content-Type': 'application/json',
				},
				timeout: 30000,
			});
		} catch (err) {
			if (err.response?.status === 429) {
				const retryAfter = Number(err.response.data?.retry_after || 1);
				console.log(`[AppEmojiSync] Rate limited; retrying in ${retryAfter}s...`);
				await sleep(Math.ceil(retryAfter * 1000) + 250);
				continue;
			}
			throw err;
		}
	}
	throw new Error(`Discord API rate limit did not clear for ${method} ${endpoint}`);
}

async function getCurrentApplication() {
	try {
		return (await discordRequest('get', '/applications/@me')).data;
	} catch (err) {
		if (err.response?.status !== 404) throw err;
		return (await discordRequest('get', '/oauth2/applications/@me')).data;
	}
}

async function listApplicationEmojis(applicationId) {
	const response = await discordRequest('get', `/applications/${applicationId}/emojis`);
	return response.data?.items || [];
}

async function downloadEmojiAsset(emoji) {
	const candidates = emoji.animated
		? [
			{ extension: 'gif', mime: 'image/gif', suffix: '?size=128&quality=lossless' },
			{ extension: 'webp', mime: 'image/webp', suffix: '?size=128&animated=true' },
		]
		: [
			{ extension: 'png', mime: 'image/png', suffix: '?size=128&quality=lossless' },
			{ extension: 'webp', mime: 'image/webp', suffix: '?size=128' },
		];

	let lastError;
	for (const candidate of candidates) {
		try {
			const response = await axios.get(
				`${CDN_BASE}/${emoji.id}.${candidate.extension}${candidate.suffix}`,
				{
					responseType: 'arraybuffer',
					timeout: 30000,
				}
			);
			const buffer = Buffer.from(response.data);
			if (!buffer.length) throw new Error('Discord CDN returned an empty emoji asset');
			if (buffer.length > 256 * 1024) {
				throw new Error(`emoji asset is ${buffer.length} bytes; Discord limit is 256 KiB`);
			}
			return {
				buffer,
				mime: candidate.mime,
			};
		} catch (err) {
			lastError = err;
		}
	}
	throw lastError || new Error('Unable to download emoji asset');
}

async function createApplicationEmoji(applicationId, sourceEmoji) {
	const asset = await downloadEmojiAsset(sourceEmoji);
	const image = `data:${asset.mime};base64,${asset.buffer.toString('base64')}`;
	const response = await discordRequest('post', `/applications/${applicationId}/emojis`, {
		name: sourceEmoji.name,
		image,
	});
	return response.data;
}

function rewriteEmojiReferences(files, mapping) {
	let changedFiles = 0;
	let replacedReferences = 0;

	for (const file of files) {
		const before = fs.readFileSync(file, 'utf8');
		EMOJI_REGEX.lastIndex = 0;
		const after = before.replace(EMOJI_REGEX, (full, _animated, _name, oldId) => {
			const target = mapping.get(oldId);
			if (!target) return full;
			replacedReferences++;
			return `<${target.animated ? 'a' : ''}:${target.name}:${target.id}>`;
		});
		if (after !== before) {
			fs.writeFileSync(file, after);
			changedFiles++;
		}
	}

	return { changedFiles, replacedReferences };
}

function writeReport(application, discovered, mapping, failures, rewriteStats) {
	fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
	const report = {
		generatedAt: new Date().toISOString(),
		application: {
			id: String(application.id),
			name: application.name,
		},
		discovered: discovered.size,
		mapped: mapping.size,
		failed: failures.length,
		rewrite: rewriteStats,
		mapping: Object.fromEntries(
			[...mapping.entries()].map(([oldId, emoji]) => [
				oldId,
				{
					id: String(emoji.id),
					name: emoji.name,
					animated: Boolean(emoji.animated),
				},
			])
		),
		failures,
	};
	fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
}

function formatApiError(err) {
	const status = err.response?.status;
	const message = err.response?.data?.message || err.message || String(err);
	return status ? `HTTP ${status}: ${message}` : message;
}

async function main() {
	if (process.env.DISABLE_APPLICATION_EMOJI_SYNC === '1') {
		console.log('[AppEmojiSync] Disabled by DISABLE_APPLICATION_EMOJI_SYNC=1');
		return;
	}
	if (!token) {
		console.log('[AppEmojiSync] BOT_TOKEN is not configured; skipping application emoji migration.');
		return;
	}

	const files = [];
	for (const root of ROOTS) collectFiles(path.resolve(process.cwd(), root), files);
	const discovered = discoverEmojiReferences(files);
	if (!discovered.size) {
		console.log('[AppEmojiSync] No custom Discord emoji references were found.');
		return;
	}

	console.log(`[AppEmojiSync] Found ${discovered.size} unique custom emoji IDs in runtime source.`);
	const application = await getCurrentApplication();
	let existing = await listApplicationEmojis(application.id);
	console.log(
		`[AppEmojiSync] ${application.name} currently owns ${existing.length}/${APPLICATION_EMOJI_LIMIT} application emojis.`
	);

	const existingByName = new Map();
	for (const emoji of existing) {
		if (!existingByName.has(emoji.name)) existingByName.set(emoji.name, emoji);
	}

	const mapping = new Map();
	const failures = [];
	let created = 0;
	let reused = 0;

	for (const sourceEmoji of discovered.values()) {
		let target = existingByName.get(sourceEmoji.name);
		if (target) {
			mapping.set(sourceEmoji.id, target);
			reused++;
			continue;
		}

		if (existing.length >= APPLICATION_EMOJI_LIMIT) {
			failures.push({
				id: sourceEmoji.id,
				name: sourceEmoji.name,
				error: `Application emoji limit (${APPLICATION_EMOJI_LIMIT}) reached`,
			});
			continue;
		}

		try {
			target = await createApplicationEmoji(application.id, sourceEmoji);
			existing.push(target);
			existingByName.set(target.name, target);
			mapping.set(sourceEmoji.id, target);
			created++;
			console.log(
				`[AppEmojiSync] Uploaded ${sourceEmoji.animated ? 'animated ' : ''}:${sourceEmoji.name}: (${created} new).`
			);
		} catch (err) {
			const error = formatApiError(err);
			failures.push({ id: sourceEmoji.id, name: sourceEmoji.name, error });
			console.warn(`[AppEmojiSync] Could not migrate :${sourceEmoji.name}: (${sourceEmoji.id}): ${error}`);
		}
	}

	const rewriteStats = rewriteEmojiReferences(files, mapping);
	writeReport(application, discovered, mapping, failures, rewriteStats);

	console.log(
		`[AppEmojiSync] Complete: ${created} uploaded, ${reused} reused, ${mapping.size}/${discovered.size} mapped.`
	);
	console.log(
		`[AppEmojiSync] Replaced ${rewriteStats.replacedReferences} references across ${rewriteStats.changedFiles} runtime files.`
	);
	console.log(`[AppEmojiSync] Mapping report written to ${path.relative(process.cwd(), REPORT_PATH)}.`);
	if (failures.length) {
		console.warn(`[AppEmojiSync] ${failures.length} emoji(s) could not be migrated; the bot will continue.`);
	}
}

main().catch((err) => {
	console.error(`[AppEmojiSync] FAILED: ${formatApiError(err)}`);
	process.exitCode = 1;
});
