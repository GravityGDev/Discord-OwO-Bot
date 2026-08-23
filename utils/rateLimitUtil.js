/*
 * OwO Bot for Discord
 * Copyright (C) 2024 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */
const request = require('request');

let influxErrorShown = false;

exports.init = function (bucket, debug) {
	if (!process.env.INFLUXDB_HOST) {
		console.log('[RateLimitMetrics] Disabled; INFLUXDB_HOST is not configured');
		return;
	}

	setInterval(() => {
		logBucket(bucket, debug);
	}, 10000);
};

async function logBucket(bucket, debug) {
	if (!process.env.INFLUXDB_HOST) return;

	const { concurrent, queueCount, bucketCount, waiting } = bucket.getState();
	const body = {
		password: process.env.INFLUXDB_PASS,
		metric: 'ratelimit',
		server: process.env.SHARDER_SERVER,
		concurrent,
		queueCount,
		bucketCount,
		waiting,
	};

	if (debug) body.debug = true;

	request(
		{
			method: 'POST',
			uri: `${process.env.INFLUXDB_HOST.replace(/\/$/, '')}/qos`,
			json: true,
			body,
			timeout: 10000,
		},
		function (err) {
			if (err && !influxErrorShown) {
				console.error('[RateLimitMetrics] InfluxDB is inactive; metric upload disabled until restart.');
				console.error(err.message);
				influxErrorShown = true;
			}
		}
	);
}
