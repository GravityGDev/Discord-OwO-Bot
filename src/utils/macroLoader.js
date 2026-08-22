const fs = require('fs');
const path = require('path');

const customPath = path.resolve(__dirname, '../../tokens/macro.js');
const fallbackPath = path.resolve(__dirname, '../../secret/macro.js');

let macro;
if (fs.existsSync(customPath)) {
	macro = require(customPath);
	console.log('[Macro] Loaded custom macro module.');
} else {
	macro = require(fallbackPath);
	console.log('[Macro] Custom module is not configured; using bundled compatibility fallback.');
}

module.exports = macro;
