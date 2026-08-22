/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const Base = require('eris-sharder').Base;
const EventHandler = require('./eventHandlers/EventHandler.js');

// Discordbots.org api
const DBL = require('dblapi.js');
const dbl = new DBL(process.env.DBL_TOKEN);

class OwO extends Base {
	constructor(bot) {
		super(bot);
		this.dbl = dbl;
		this.shuttingDown = false;

		// MongoDB is the runtime persistence layer for bot state.
		this.mongo = require('./utils/mongo.js');
		this.mongoReady = this.mongo.connect();
		this.mongoReady.catch((err) => {
			console.error('[MongoDB] Initial connection failed');
			console.error(err);
		});

		// MongoDB-backed compatibility cache (keeps the previous Redis API shape).
		this.redis = require('./utils/redis.js');

		// Neo4j Logging
		this.neo4j = require('./utils/neo4j.js');

		// MongoDB pubsub to communicate with all the other shards/processes.
		this.pubsub = new (require('./utils/pubsub.js'))(this);

		// Handles discord interaction events
		this.interactionHandlers = new (require('./interactionHandlers'))(this);

		// Creates a pageable message
		this.PagedMessage = require('./utils/PagedMessage.js');

		// Websockets
		this.streamSocket = new (require('./utils/streamSocket.js'))(this);
		this.snailSocket = new (require('./utils/snailSocket.js'))(this);

		// Logger
		this.logger = require('./utils/logger.js');

		// Bot config file
		this.config = require('./data/config.json');
		this.debug = this.config.debug;
		this.prefix = this.config.prefix;
		this.optOut = {};

		// Ban check
		this.ban = require('./utils/ban.js');

		// Cooldown check
		this.cooldown = require('./utils/cooldown.js');

		// Quest Handler
		this.questHandler = new (require('./botHandlers/questHandler.js'))();

		this.cache = require('./utils/cacheUtil.js');

		// Global helper methods
		this.global = require('./utils/global.js');
		this.global.init(this);

		this.animalUtil = require('./utils/animalInfoUtil.js');
		this.animalReady = this.animalUtil.setBot(this);
		this.animalReady.catch((err) => {
			console.error('[Startup] Failed to initialize animal catalog');
			console.error(err);
		});

		this.rewardUtil = require('./utils/rewardUtil.js');

		this.event = require('./utils/eventUtil.js');
		this.event.init(this);

		// Message sender helper methods
		this.sender = require('./utils/sender.js');
		this.sender.init(this);

		// Date utility
		this.dateUtil = require('./utils/dateUtil.js');

		// Hidden macro detection file
		try {
			this.macro = require('./../../tokens/macro.js');
		} catch (err) {
			console.error('Could not find macro.js, attempting to use ./secret file...');
			this.macro = require('../secret/macro.js');
			console.log('Found macro.js file in secret folder!');
		}
		this.macro.bind(this, require('merge-images'), require('canvas'));
		this.cooldown.setMacro(this.macro);

		// Allows me to check cache before any fetch requests (reduces api calls)
		this.fetch = new (require('./utils/fetch.js'))(this);

		// Creates a reaction collector for a message (works for uncached messages too)
		this.reactionCollector = new (require('./utils/reactionCollector.js'))(this);

		// Creates an interaction collector for a message
		this.interactionCollector = new (require('./utils/interactionCollector.js'))(this);

		// Fetches images and converts them to buffers
		this.DataResolver = require('./utils/dataResolver.js');

		// Ability to add emojis to guilds
		this.EmojiAdder = require('./utils/EmojiAdder.js');

		// Helper for patreon benefits
		this.patreon = require('./utils/patreon.js');
		this.patreon.init(this);

		this.patreonUtil = require('./commands/commandList/patreon/utils/patreonUtil.js');

		try {
			this.badwords = require('./../../tokens/badwords.json');
		} catch (err) {
			console.error('Could not find badwords.json, attempting to use ./secret file...');
			this.badwords = require('../secret/badwords.json');
			console.log('Found badwords.json file in secret folder!');
		}

		this.giveaway = require('./utils/giveaway.js');

		// Create commands
		this.command = new (require('./commands/command.js'))(this);
	}

	async launch() {
		try {
			// eris-sharder loads this app after Discord is ready. Do not bind command/event
			// handlers until every Mongo-backed startup dependency is ready as well.
			await Promise.all([this.mongoReady, this.pubsub.ready, this.animalReady]);
			await this.setOptOut();
			await this.giveaway.checkGiveawayTimeout(this);
		} catch (err) {
			console.error('[Startup] MongoDB-backed runtime initialization failed');
			console.error(err);
			try {
				await this.pubsub.close();
				await this.mongo.close();
			} catch (closeErr) {
				console.error('[Startup] Failed while closing MongoDB resources');
				console.error(closeErr);
			}
			process.exit(1);
			return;
		}

		this.installShutdownHandlers();

		// Bind bot events only after MongoDB-backed state is ready.
		this.eventHandler = new EventHandler(this);

		// sends info to our main server every X seconds
		this.InfoUpdater = new (require('./utils/InfoUpdater.js'))(this);

		this.logger.logstashQos('launch');
		console.log('[Startup] MongoDB runtime ready; event handlers enabled');
	}

	installShutdownHandlers() {
		const shutdown = async (signal) => {
			if (this.shuttingDown) return;
			this.shuttingDown = true;
			console.log(`[Shutdown] Received ${signal}; closing MongoDB resources`);
			try {
				await this.pubsub.close();
				await this.mongo.close();
			} catch (err) {
				console.error('[Shutdown] Failed to close MongoDB resources cleanly');
				console.error(err);
			} finally {
				process.exit(0);
			}
		};

		process.once('SIGTERM', () => shutdown('SIGTERM'));
		process.once('SIGINT', () => shutdown('SIGINT'));
	}

	async setOptOut() {
		const ids = await this.redis.hgetall('optOut');
		for (let id in ids) this.optOut[id] = true;
	}
}

module.exports = OwO;
