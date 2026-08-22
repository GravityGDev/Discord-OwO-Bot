const fs = require('fs');
const path = require('path');

const candidates = [
	// Original production layout: tokens lives beside the repository directory.
	path.resolve(__dirname, '../../../tokens/macro.js'),
	// Also support a tokens directory inside a self-hosted checkout.
	path.resolve(__dirname, '../../tokens/macro.js'),
	// Bundled compatibility implementation used by this fork.
	path.resolve(__dirname, '../../secret/macro.js'),
];

const macroPath = candidates.find((candidate) => fs.existsSync(candidate));
if (!macroPath) {
	throw new Error('[Macro] macro.js was not found in any supported location.');
}

const macro = require(macroPath);
const bundledPath = candidates[candidates.length - 1];
if (macroPath === bundledPath) {
	console.log('[Macro] Loaded bundled secret/macro.js.');
} else {
	console.log('[Macro] Loaded custom macro module.');
}

module.exports = macro;
