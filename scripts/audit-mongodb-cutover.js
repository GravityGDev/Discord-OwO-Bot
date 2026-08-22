/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'src');
const strict = process.argv.includes('--strict');

const patterns = [
	{ name: 'legacy mysql import', regex: /require\([^\n]*mysql\.js['"]\)/g },
	{ name: 'legacy query helper', regex: /\bp\.query\s*\(/g },
	{ name: 'legacy transaction helper', regex: /\bstartTransaction\s*\(/g },
	{ name: 'legacy connection query', regex: /\bcon\.query\s*\(/g },
	{ name: 'SQL SELECT', regex: /\bSELECT\b[^\n;]*/gi },
	{ name: 'SQL INSERT', regex: /\bINSERT\s+(?:IGNORE\s+)?INTO\b[^\n;]*/gi },
	{ name: 'SQL UPDATE', regex: /\bUPDATE\b[^\n;]*/gi },
	{ name: 'SQL DELETE', regex: /\bDELETE\s+FROM\b[^\n;]*/gi },
];

const ignoredFiles = new Set([
	path.normalize('src/utils/mysql.js'),
	path.normalize('src/botHandlers/mysqlHandler.js'),
]);

function walk(dir) {
	const result = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const absolute = path.join(dir, entry.name);
		if (entry.isDirectory()) result.push(...walk(absolute));
		else if (entry.isFile() && entry.name.endsWith('.js')) result.push(absolute);
	}
	return result;
}

function lineNumber(content, index) {
	return content.slice(0, index).split('\n').length;
}

const findings = [];
for (const file of walk(src)) {
	const relative = path.normalize(path.relative(root, file));
	if (ignoredFiles.has(relative)) continue;

	const content = fs.readFileSync(file, 'utf8');
	for (const pattern of patterns) {
		pattern.regex.lastIndex = 0;
		let match;
		while ((match = pattern.regex.exec(content))) {
			findings.push({
				file: relative.replace(/\\/g, '/'),
				line: lineNumber(content, match.index),
				type: pattern.name,
			});
		}
	}
}

const grouped = new Map();
for (const finding of findings) {
	if (!grouped.has(finding.file)) grouped.set(finding.file, []);
	grouped.get(finding.file).push(finding);
}

console.log(`MongoDB cutover audit: ${grouped.size} files still contain legacy SQL/MySQL markers.`);
for (const [file, fileFindings] of [...grouped.entries()].sort()) {
	const summary = fileFindings
		.map((finding) => `${finding.type}@${finding.line}`)
		.join(', ');
	console.log(`- ${file}: ${summary}`);
}

if (process.env.GITHUB_STEP_SUMMARY) {
	const lines = [
		'## MongoDB cutover audit',
		'',
		`**${grouped.size} files** still contain legacy SQL/MySQL markers.`,
		'',
		'| File | Markers |',
		'| --- | --- |',
	];
	for (const [file, fileFindings] of [...grouped.entries()].sort()) {
		lines.push(
			`| \`${file}\` | ${fileFindings
				.map((finding) => `${finding.type} (L${finding.line})`)
				.join('<br>')} |`
		);
	}
	fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
}

if (strict && grouped.size) process.exitCode = 1;
