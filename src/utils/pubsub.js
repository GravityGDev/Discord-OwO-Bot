/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const requireDir = require('require-dir');
const dir = requireDir('./pubsubHandlers');
const mongo = require('./mongo.js');

class PubSub {
	constructor(main) {
		this.main = main;
		this.channels = {};
		this.changeStream = null;
		this.pollTimer = null;
		this.polling = false;
		this.lastSeenId = null;

		for (let listener in dir) this.channels[listener] = dir[listener];

		this.ready = this.init();
		this.ready.catch((err) => {
			console.error('[MongoDB PubSub] Failed to initialize');
			console.error(err);
		});
	}

	async init() {
		this.collection = await mongo.collection('pubsub_events');

		try {
			this.changeStream = this.collection.watch([{ $match: { operationType: 'insert' } }]);
			this.changeStream.on('change', (change) => this.handleDocument(change.fullDocument));
			this.changeStream.on('error', (err) => {
				console.error('[MongoDB PubSub] Change stream unavailable, using polling fallback');
				console.error(err);
				this.startPolling().catch(console.error);
			});
		} catch (err) {
			console.error('[MongoDB PubSub] Change stream unavailable, using polling fallback');
			console.error(err);
			await this.startPolling();
		}
	}

	handleDocument(document) {
		if (!document || !this.channels[document.channel]) return;
		Promise.resolve(this.channels[document.channel].handle(this.main, document.message)).catch(
			console.error
		);
	}

	async startPolling() {
		if (this.pollTimer) return;
		if (!this.collection) this.collection = await mongo.collection('pubsub_events');

		const latest = await this.collection.find().sort({ _id: -1 }).limit(1).next();
		this.lastSeenId = latest?._id || null;

		this.pollTimer = setInterval(() => this.poll().catch(console.error), 1000);
		this.pollTimer.unref?.();
	}

	async poll() {
		if (this.polling) return;
		this.polling = true;
		try {
			const filter = this.lastSeenId ? { _id: { $gt: this.lastSeenId } } : {};
			const documents = await this.collection.find(filter).sort({ _id: 1 }).limit(500).toArray();
			for (const document of documents) {
				this.lastSeenId = document._id;
				this.handleDocument(document);
			}
		} finally {
			this.polling = false;
		}
	}

	async publish(channel, message = true) {
		await this.ready;
		if (!this.collection) this.collection = await mongo.collection('pubsub_events');
		if (typeof message === 'object') message = JSON.stringify(message);

		const result = await this.collection.insertOne({
			channel,
			message: String(message),
			createdAt: new Date(),
		});
		return result.acknowledged ? 1 : 0;
	}

	async close() {
		if (this.pollTimer) {
			clearInterval(this.pollTimer);
			this.pollTimer = null;
		}
		if (this.changeStream) {
			try {
				await this.changeStream.close();
			} catch (err) {
				console.error('[MongoDB PubSub] Failed to close change stream');
				console.error(err);
			}
			this.changeStream = null;
		}
	}
}

module.exports = PubSub;
