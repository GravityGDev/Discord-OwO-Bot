/*
 * OwO Bot for Discord
 * Copyright (C) 2022 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */
const axios = require('axios');
const members = {};
const cache = {};

const patreonUserAgent = 'OwO Bot - Patreon Rewards';

exports.request = async function (cookie) {
	console.log('getting cowoncy...');
	const cowoncyList = await getCowoncy(cookie);
	console.log('getting pets...');
	const petList = await getPets(cookie);
	console.log('getting customized command...');
	const customizedList = await getCustomizedCommand(cookie);
	console.log('getting custom command...');
	const commandList = await getCommand(cookie);
	return {
		cowoncy: cowoncyList,
		pet: petList,
		customizedCommand: customizedList,
		customCommand: commandList,
	};
};

function getCowoncy(cookie) {
	return getUsers(
		cookie,
		'https://www.patreon.com/api/reward-items/159691/deliverables?include=member.user.null&filter[delivery_status]=not_delivered&fields[user]=full_name,social_connections&json-api-version=1.0&page[count]=100&page[size]=100',
		[]
	);
}

function getPets(cookie) {
	return getUsers(
		cookie,
		'https://www.patreon.com/api/reward-items/120005/deliverables?include=member.user.null&filter[delivery_status]=not_delivered&fields[user]=full_name,social_connections&json-api-version=1.0&page[count]=100&page[size]=100',
		[]
	);
}

function getCustomizedCommand(cookie) {
	return getUsers(
		cookie,
		'https://www.patreon.com/api/reward-items/120006/deliverables?include=member.user.null&filter[delivery_status]=not_delivered&fields[user]=full_name,social_connections&json-api-version=1.0&page[count]=100&page[size]=100',
		[]
	);
}

function getCommand(cookie) {
	return getUsers(
		cookie,
		'https://www.patreon.com/api/reward-items/120008/deliverables?include=member.user.null&filter[delivery_status]=not_delivered&fields[user]=full_name,social_connections&json-api-version=1.0&page[count]=100&page[size]=100',
		[]
	);
}

async function getUsers(cookie, url, list) {
	if (!url.includes('/api/')) {
		url = url.replace('patreon.com', 'patreon.com/api');
	}
	try {
		const { data } = await axios.get(url, {
			headers: {
				cookie,
				'User-Agent': patreonUserAgent,
			},
		});
		data.included?.forEach((item) => {
			if (item.type === 'user') {
				const discord = item.attributes?.social_connections?.discord;
				list.push({
					name: item.attributes?.full_name,
					discord: getDiscordConnectionId(discord),
					user_id: item.id,
				});
			} else if (item.type === 'member') {
				const userId = item.relationships?.user?.data?.id;
				if (userId) members[userId] = item.id;
			}
		});
		for (let i in list) {
			if (!list[i].discord) {
				list[i].discord = await getDiscordId(list[i].user_id);
			}
		}

		console.log('list length: ' + list.length);
		if (data.links?.next) {
			console.log('getting next page...');
			return getUsers(cookie, data.links.next, list);
		}
		return list;
	} catch (err) {
		console.error(err);
		return list;
	}
}

function getDiscordConnectionId(discord) {
	if (!discord) return null;
	if (typeof discord === 'string') return discord;
	return discord.user_id || discord.id || null;
}

async function getDiscordId(userId) {
	const memberId = members[userId];
	if (!memberId) return null;
	if (cache[memberId] !== undefined) return cache[memberId];

	const token = process.env.PATREON_ACCESS_TOKEN;
	if (!token) {
		cache[memberId] = null;
		return null;
	}

	try {
		const { data } = await axios.get(
			`https://www.patreon.com/api/oauth2/v2/members/${encodeURIComponent(memberId)}`,
			{
				params: {
					include: 'user',
					'fields[user]': 'social_connections',
				},
				headers: {
					Authorization: `Bearer ${token}`,
					'User-Agent': patreonUserAgent,
				},
			}
		);
		const user = data.included?.find((item) => item.type === 'user');
		const discordId = getDiscordConnectionId(user?.attributes?.social_connections?.discord);
		cache[memberId] = discordId || null;
		return cache[memberId];
	} catch (err) {
		console.error(`Failed to resolve Patreon member ${memberId} through API v2`);
		console.error(err.response?.data || err.message || err);
		cache[memberId] = null;
		return null;
	}
}
