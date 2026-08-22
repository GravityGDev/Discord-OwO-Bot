/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */
require('dotenv').config();

const missingRuntimeConfig = [];
if (!process.env.BOT_TOKEN) missingRuntimeConfig.push('BOT_TOKEN');
if (!process.env.MONGODB_URI && !process.env.MONGO_URI) missingRuntimeConfig.push('MONGODB_URI');

if (missingRuntimeConfig.length) {
	console.error(
		`Missing required runtime environment variable(s): ${missingRuntimeConfig.join(', ')}. ` +
			'Configure them in your host environment or a local .env file before starting the bot.'
	);
	process.exitCode = 1;
	return;
}

// Config file
const config = require('./src/data/config.json');

// Grab tokens and secret files
const debug = config.debug;
if (!debug) require('dd-trace').init();

const rateLimitUtil = require('./utils/rateLimitUtil.js');
const request = require('./utils/request.js');
// Eris-Sharder
const Sharder = require('eris-sharder').Master;
var result, shards, firstShardID, lastShardID;
const cluster = require('cluster');

let clusters = 60;

(async () => {
	try {
		// determine how many shards we will need for this manager
		if (!debug && cluster.isMaster) {
			result = await request.fetchInit();
			console.log(result);
			shards = parseInt(result['shards']);
			firstShardID = parseInt(result['firstShardID']);
			lastShardID = parseInt(result['lastShardID']);
		}
		if (debug) {
			shards = 1;
			firstShardID = 0;
			lastShardID = 0;
			clusters = 1;
		}

		console.log(
			'Creating shards ' + firstShardID + '~' + lastShardID + ' out of ' + shards + ' total shards!'
		);

		// Start sharder
		const sharder = new Sharder('Bot ' + process.env.BOT_TOKEN, config.sharder.path, {
			name: config.sharder.name,
			clientOptions: config.eris.clientOptions,
			debug: true,
			shards,
			clusters,
			firstShardID,
			lastShardID,
		});

		if (cluster.isMaster) rateLimitUtil.init(sharder.bucket, debug);
	} catch (e) {
		console.error('Failed to start eris sharder');
		console.error(e);
		process.exitCode = 1;
	}
})();
