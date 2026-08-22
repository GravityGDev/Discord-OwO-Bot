/*
 * OwO Bot for Discord
 * Copyright (C) 2020 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */
const config = require('../data/config.json');
const global = require('./global.js');

/***** Datadog *****/
var StatsD = require('node-dogstatsd').StatsD;
var log = new StatsD();

exports.increment = function (name, tags) {
	log.increment('owo.' + name, tags);
};

exports.decrement = function (name, tags) {
	log.decrement('owo.' + name, tags);
};

exports.value = function (name, amount, tags) {
	if (amount > 0) log.incrementBy('owo.' + name, amount, tags);
	else if (amount < 0) log.decrementBy('owo.' + name, Math.abs(amount), tags);
};

/***** StatsD *****/
const SDC = require('statsd-client');
const sdc = new SDC({
	host: 'localhost',
	port: 9125,
	prefix: 'owo',
	socketTimeout: 5000,
});

const incr = (exports.incr = function (name, amount = 1, tags = {}, msg) {
	return;
	/* eslint-disable-next-line */
	if (amount < 0) {
		decr(name, amount, tags, msg);
		return;
	}
	if (msg) {
		tags.user = msg.author.id;
		tags.channel = msg.channel.id;
		tags.guild = msg.channel.type == 1 ? 'dm' : msg.channel.guild.id;
	}
	sdc.increment(`${name}`, amount, tags);
});

const decr = (exports.decr = function (name, amount = -1, tags = {}, msg) {
	return;
	/* eslint-disable-next-line */
	if (amount > 0) {
		incr(name, amount, tags, msg);
		return;
	}
	if (msg) {
		tags.user = msg.author.id;
		tags.channel = msg.channel.id;
		tags.guild = msg.channel.type == 1 ? 'dm' : msg.channel.guild.id;
	}
	sdc.decrement(`${name}`, amount, tags);
});

const request = require('request');
let influxErrorShown = false;
setInterval(() => {
	influxErrorShown = false;
}, 5 * 60 * 1000).unref?.();

function influxEnabled() {
	return Boolean(process.env.INFLUXDB_HOST && process.env.INFLUXDB_PASS);
}

function postInflux(path, body) {
	if (!influxEnabled()) return;
	request(
		{
			method: 'POST',
			uri: `${process.env.INFLUXDB_HOST}${path}`,
			json: true,
			body,
		},
		function (err) {
			if (err && !influxErrorShown) {
				console.error('InfluxDB is inactive. Log upload will not work.');
				console.error(err);
				influxErrorShown = true;
			}
		}
	);
}

exports.command = function (command, msg) {
	postInflux('/command', {
		password: process.env.INFLUXDB_PASS,
		command,
		user: msg.author.id,
	});
};

exports.logstash = function (command, p) {
	postInflux('/metric', {
		password: process.env.INFLUXDB_PASS,
		user: p.msg.author.id,
		command,
		text: p.msg.content,
		guild: p.msg.channel.guild?.id || 'dm',
	});
};

exports.logstashBanned = function (command, p) {
	postInflux('/metric', {
		password: process.env.INFLUXDB_PASS,
		user: p.msg.author.id,
		bannedCommand: command,
		text: p.msg.content,
		guild: p.msg.channel.guild?.id || 'dm',
	});
};

exports.logstashCaptcha = function (metric) {
	postInflux('/captcha', {
		...metric,
		password: process.env.INFLUXDB_PASS,
	});
};

exports.logstashQos = function (metricKey, metric = {}) {
	postInflux('/qos', {
		...metric,
		password: process.env.INFLUXDB_PASS,
		metric: metricKey,
		server: process.env.SHARDER_SERVER,
		shards: global.getShardString(),
		...(config.debug ? { debug: true } : {}),
	});
};
