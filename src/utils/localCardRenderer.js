/*
 * Local image rendering for OwO profile and level cards.
 * Uses the user's equipped wallpaper as the actual card background.
 */

const axios = require('axios');
const { createCanvas, loadImage } = require('canvas');
const rings = require('../data/rings.json');

const WHITE = '#ffffff';
const MUTED = '#d9deea';
const FONT = 'DejaVu Sans';

function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value));
}

function roundedRect(ctx, x, y, width, height, radius) {
	const r = Math.min(radius, width / 2, height / 2);
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.lineTo(x + width - r, y);
	ctx.quadraticCurveTo(x + width, y, x + width, y + r);
	ctx.lineTo(x + width, y + height - r);
	ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
	ctx.lineTo(x + r, y + height);
	ctx.quadraticCurveTo(x, y + height, x, y + height - r);
	ctx.lineTo(x, y + r);
	ctx.quadraticCurveTo(x, y, x + r, y);
	ctx.closePath();
}

function toHex(value) {
	return clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0');
}

function parseColor(value, fallback) {
	if (!value) return fallback;
	const text = String(value).trim();
	if (/^#[0-9a-f]{6}$/i.test(text)) return text.toLowerCase();
	const parts = text.split(',').map((part) => Number(part.trim()));
	if (parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite)) {
		return `#${toHex(parts[0])}${toHex(parts[1])}${toHex(parts[2])}`;
	}
	return fallback;
}

function rgba(hex, alpha) {
	const color = parseColor(hex, '#ffffff').slice(1);
	const r = parseInt(color.slice(0, 2), 16);
	const g = parseInt(color.slice(2, 4), 16);
	const b = parseInt(color.slice(4, 6), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function normalizeDisplayText(value) {
	if (value === undefined || value === null) return '';
	const text = String(value);
	try {
		return text.normalize('NFKC');
	} catch (_err) {
		return text;
	}
}

function safeText(value, fallback = '') {
	if (value === undefined || value === null) return fallback;
	return normalizeDisplayText(value);
}

function formatNumber(value) {
	const number = Number(value);
	if (!Number.isFinite(number)) return safeText(value, '0');
	return Math.max(0, Math.floor(number)).toLocaleString('en-US');
}

function setFont(ctx, weight, size, italic = false) {
	ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px "${FONT}", sans-serif`;
}

function fitText(ctx, text, maxWidth) {
	let value = safeText(text);
	if (ctx.measureText(value).width <= maxWidth) return value;
	while (value.length > 1 && ctx.measureText(`${value}…`).width > maxWidth) value = value.slice(0, -1);
	return `${value}…`;
}

function wrapText(ctx, text, maxWidth, maxLines = 2) {
	const words = safeText(text).split(/\s+/).filter(Boolean);
	if (!words.length) return [''];
	const lines = [];
	let line = '';
	let consumed = 0;
	for (const word of words) {
		const candidate = line ? `${line} ${word}` : word;
		if (ctx.measureText(candidate).width <= maxWidth) {
			line = candidate;
			consumed += 1;
			continue;
		}
		if (line) lines.push(line);
		if (lines.length >= maxLines) break;
		line = word;
		consumed += 1;
	}
	if (lines.length < maxLines && line) lines.push(line);
	if (consumed < words.length && lines.length) {
		lines[lines.length - 1] = fitText(ctx, `${lines[lines.length - 1]}…`, maxWidth);
	}
	return lines.slice(0, maxLines);
}

function isHttpUrl(value) {
	return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

async function fetchRemoteImage(url, label) {
	if (!isHttpUrl(url)) return null;
	try {
		const response = await axios.get(url, {
			responseType: 'arraybuffer',
			timeout: 10000,
			headers: { 'User-Agent': 'OwO-Bot/1.0' },
		});
		return await loadImage(Buffer.from(response.data));
	} catch (err) {
		console.warn(`[LocalCardRenderer] ${label} download failed: ${err.message}`);
		return null;
	}
}

function drawCover(ctx, image, x, y, width, height) {
	const scale = Math.max(width / image.width, height / image.height);
	const drawWidth = image.width * scale;
	const drawHeight = image.height * scale;
	ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function seededRandom(seed) {
	let state = 2166136261;
	for (const char of String(seed || 'owo')) {
		state ^= char.charCodeAt(0);
		state = Math.imul(state, 16777619);
	}
	return function () {
		state += 0x6d2b79f5;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}

async function drawWallpaper(ctx, width, height, theme, accent, accent2) {
	const wallpaperUrl = theme?.backgroundURL || theme?.background_url || theme?.wallpaperURL;
	const wallpaper = await fetchRemoteImage(wallpaperUrl, 'Wallpaper');
	if (wallpaper) {
		drawCover(ctx, wallpaper, 0, 0, width, height);
	} else {
		const gradient = ctx.createLinearGradient(0, 0, width, height);
		gradient.addColorStop(0, '#101426');
		gradient.addColorStop(0.42, accent);
		gradient.addColorStop(1, accent2);
		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, width, height);
		const random = seededRandom(theme?.background || 'owo');
		for (let index = 0; index < 95; index++) {
			const x = random() * width;
			const y = random() * height * 0.78;
			const size = 0.7 + random() * 2.2;
			ctx.beginPath();
			ctx.arc(x, y, size, 0, Math.PI * 2);
			ctx.fillStyle = `rgba(255,255,255,${0.16 + random() * 0.46})`;
			ctx.fill();
		}
	}
	ctx.fillStyle = 'rgba(5, 7, 14, 0.34)';
	ctx.fillRect(0, 0, width, height);
	const leftShade = ctx.createLinearGradient(0, 0, width, 0);
	leftShade.addColorStop(0, 'rgba(5, 7, 14, 0.16)');
	leftShade.addColorStop(0.55, 'rgba(5, 7, 14, 0.04)');
	leftShade.addColorStop(1, 'rgba(5, 7, 14, 0.48)');
	ctx.fillStyle = leftShade;
	ctx.fillRect(0, 0, width, height);
	const bottomFade = ctx.createLinearGradient(0, height * 0.35, 0, height);
	bottomFade.addColorStop(0, 'rgba(5, 7, 14, 0)');
	bottomFade.addColorStop(1, 'rgba(5, 7, 14, 0.72)');
	ctx.fillStyle = bottomFade;
	ctx.fillRect(0, height * 0.35, width, height * 0.65);
}

function drawGlassPanel(ctx, x, y, width, height, radius = 24, alpha = 0.76) {
	ctx.save();
	ctx.shadowColor = 'rgba(0,0,0,0.40)';
	ctx.shadowBlur = 26;
	ctx.shadowOffsetY = 8;
	roundedRect(ctx, x, y, width, height, radius);
	ctx.fillStyle = `rgba(8, 11, 20, ${alpha})`;
	ctx.fill();
	ctx.restore();
	roundedRect(ctx, x, y, width, height, radius);
	ctx.strokeStyle = 'rgba(255,255,255,0.18)';
	ctx.lineWidth = 2;
	ctx.stroke();
}

function drawSquareAvatar(ctx, image, name, x, y, size, accent) {
	const radius = 28;
	ctx.save();
	ctx.shadowColor = 'rgba(0,0,0,0.45)';
	ctx.shadowBlur = 24;
	ctx.shadowOffsetY = 9;
	roundedRect(ctx, x, y, size, size, radius);
	ctx.clip();
	if (image) drawCover(ctx, image, x, y, size, size);
	else {
		const gradient = ctx.createLinearGradient(x, y, x + size, y + size);
		gradient.addColorStop(0, accent);
		gradient.addColorStop(1, '#151925');
		ctx.fillStyle = gradient;
		ctx.fillRect(x, y, size, size);
		ctx.fillStyle = WHITE;
		setFont(ctx, 700, Math.floor(size * 0.34));
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(safeText(name, '?').charAt(0).toUpperCase() || '?', x + size / 2, y + size / 2);
	}
	ctx.restore();
	roundedRect(ctx, x, y, size, size, radius);
	ctx.strokeStyle = 'rgba(255,255,255,0.28)';
	ctx.lineWidth = 3;
	ctx.stroke();
	roundedRect(ctx, x + 7, y + 7, size - 14, size - 14, radius - 7);
	ctx.strokeStyle = rgba(accent, 0.72);
	ctx.lineWidth = 3;
	ctx.stroke();
}

function drawProgress(ctx, x, y, width, height, current, max, accent, accent2) {
	const currentValue = Number(current) || 0;
	const maxValue = Math.max(Number(max) || 1, 1);
	const ratio = clamp(currentValue / maxValue, 0, 1);
	roundedRect(ctx, x, y, width, height, height / 2);
	ctx.fillStyle = 'rgba(255,255,255,0.18)';
	ctx.fill();
	ctx.strokeStyle = 'rgba(255,255,255,0.22)';
	ctx.lineWidth = 2;
	ctx.stroke();
	if (ratio > 0) {
		const fillWidth = Math.max(height, width * ratio);
		roundedRect(ctx, x, y, fillWidth, height, height / 2);
		const gradient = ctx.createLinearGradient(x, y, x + width, y);
		gradient.addColorStop(0, accent);
		gradient.addColorStop(1, accent2);
		ctx.fillStyle = gradient;
		ctx.fill();
	}
}

function drawStatTile(ctx, x, y, width, label, value) {
	drawGlassPanel(ctx, x, y, width, 108, 20, 0.82);
	ctx.textAlign = 'left';
	ctx.textBaseline = 'alphabetic';
	ctx.fillStyle = MUTED;
	setFont(ctx, 700, 16);
	ctx.fillText(label.toUpperCase(), x + 22, y + 35);
	ctx.fillStyle = WHITE;
	setFont(ctx, 700, 27);
	ctx.fillText(fitText(ctx, safeText(value, '—'), width - 44), x + 22, y + 78);
}

function drawGlasses(ctx, x, centerY, size = 45) {
	const lensWidth = size * 0.42;
	const lensHeight = size * 0.27;
	const gap = size * 0.12;
	ctx.save();
	ctx.strokeStyle = '#dff6ff';
	ctx.lineWidth = Math.max(3, size * 0.075);
	ctx.lineCap = 'round';
	roundedRect(ctx, x, centerY - lensHeight / 2, lensWidth, lensHeight, lensHeight * 0.35);
	ctx.stroke();
	roundedRect(ctx, x + lensWidth + gap, centerY - lensHeight / 2, lensWidth, lensHeight, lensHeight * 0.35);
	ctx.stroke();
	ctx.beginPath();
	ctx.moveTo(x + lensWidth, centerY);
	ctx.lineTo(x + lensWidth + gap, centerY);
	ctx.moveTo(x - 5, centerY - 3);
	ctx.lineTo(x, centerY);
	ctx.moveTo(x + lensWidth * 2 + gap, centerY);
	ctx.lineTo(x + lensWidth * 2 + gap + 5, centerY - 3);
	ctx.stroke();
	ctx.restore();
}

function drawHeaderText(ctx, name, title, x, nameY, maxWidth, accent) {
	const normalized = safeText(name || 'OwO User');
	const hasGlasses = normalized.includes('👓');
	const plainName = normalized.replace(/👓/gu, '').replace(/\uFE0F/gu, '').trim() || 'OwO User';
	ctx.textAlign = 'left';
	ctx.textBaseline = 'alphabetic';
	ctx.save();
	ctx.shadowColor = 'rgba(0,0,0,0.78)';
	ctx.shadowBlur = 12;
	ctx.shadowOffsetY = 3;
	ctx.fillStyle = WHITE;
	setFont(ctx, 700, 62);
	const fittedName = fitText(ctx, plainName, hasGlasses ? maxWidth - 76 : maxWidth);
	ctx.fillText(fittedName, x, nameY);
	if (hasGlasses) drawGlasses(ctx, x + ctx.measureText(fittedName).width + 16, nameY - 24, 45);
	ctx.fillStyle = '#eef2f8';
	setFont(ctx, 500, 31, true);
	ctx.fillText(fitText(ctx, title || 'An OwO Bot User', maxWidth), x, nameY + 48);
	ctx.restore();
	ctx.fillStyle = accent;
	roundedRect(ctx, x, nameY + 66, 72, 5, 3);
	ctx.fill();
}

function getMarriageRing(marriage) {
	if (!marriage) return null;
	if (marriage.ring?.id && rings[String(marriage.ring.id)]) return rings[String(marriage.ring.id)];
	const match = safeText(marriage.img).match(/^ring_(\d+)\.png$/i);
	if (!match) return null;
	return rings[String(Number(match[1]))] || null;
}

async function loadMarriageRing(marriage) {
	const ring = getMarriageRing(marriage);
	const emoji = ring?.emoji || ring?.value;
	const match = safeText(emoji).match(/^<a?:[^:>]+:(\d+)>$/);
	if (!match) return { image: null, ring };
	const image = await fetchRemoteImage(`https://cdn.discordapp.com/emojis/${match[1]}.png?size=128&quality=lossless`, 'Marriage ring');
	return { image, ring };
}

function drawFallbackRing(ctx, x, y, size, accent) {
	ctx.save();
	ctx.strokeStyle = accent;
	ctx.fillStyle = rgba(accent, 0.28);
	ctx.lineWidth = 4;
	ctx.beginPath();
	ctx.ellipse(x + size / 2, y + size * 0.62, size * 0.28, size * 0.22, 0, 0, Math.PI * 2);
	ctx.fill();
	ctx.stroke();
	ctx.beginPath();
	ctx.moveTo(x + size * 0.35, y + size * 0.39);
	ctx.lineTo(x + size * 0.5, y + size * 0.14);
	ctx.lineTo(x + size * 0.65, y + size * 0.39);
	ctx.closePath();
	ctx.fillStyle = '#e8dcff';
	ctx.fill();
	ctx.stroke();
	ctx.restore();
}

async function drawMarriageTile(ctx, x, y, width, marriage, accent) {
	drawGlassPanel(ctx, x, y, width, 108, 20, 0.82);
	ctx.textAlign = 'left';
	ctx.fillStyle = MUTED;
	setFont(ctx, 700, 16);
	ctx.fillText('MARRIED TO', x + 22, y + 35);
	const { image } = await loadMarriageRing(marriage);
	const iconSize = 40;
	if (image) ctx.drawImage(image, x + 20, y + 52, iconSize, iconSize);
	else drawFallbackRing(ctx, x + 20, y + 49, iconSize, accent);
	ctx.fillStyle = WHITE;
	setFont(ctx, 700, 25);
	ctx.fillText(fitText(ctx, safeText(marriage?.text, 'Someone'), width - 88), x + 72, y + 80);
}

exports.renderLevelCard = async function (info, opt = {}) {
	const width = 1280;
	const height = 480;
	const canvas = createCanvas(width, height);
	const ctx = canvas.getContext('2d');
	const accent = parseColor(info?.theme?.accent || info?.theme?.name_color, '#8b5cf6');
	const accent2 = parseColor(info?.theme?.accent2, '#38bdf8');
	await drawWallpaper(ctx, width, height, info?.theme, accent, accent2);
	const avatar = await fetchRemoteImage(info?.user?.avatarURL, 'Avatar');
	drawSquareAvatar(ctx, avatar, info?.user?.name, 36, 46, 336, accent);
	const contentX = 412;
	drawHeaderText(ctx, info?.user?.name || 'OwO User', info?.user?.title || 'An OwO Bot User', contentX, 104, 810, accent);
	drawGlassPanel(ctx, contentX, 202, 830, 216, 26, 0.84);
	const level = info?.level || {};
	ctx.fillStyle = MUTED;
	setFont(ctx, 700, 18);
	ctx.fillText('LEVEL', contentX + 30, 245);
	ctx.fillText('RANK', contentX + 182, 245);
	ctx.textAlign = 'right';
	ctx.fillText(opt.guild ? 'SERVER XP' : 'GLOBAL XP', contentX + 798, 245);
	ctx.textAlign = 'left';
	ctx.fillStyle = WHITE;
	setFont(ctx, 700, 76);
	ctx.fillText(safeText(level.lvl, '0'), contentX + 27, 319);
	setFont(ctx, 700, 36);
	ctx.fillText(fitText(ctx, safeText(info?.rank?.text, 'Last'), 250), contentX + 182, 300);
	ctx.textAlign = 'right';
	setFont(ctx, 700, 30);
	ctx.fillText(`${formatNumber(level.currentxp)} / ${formatNumber(level.maxxp)} XP`, contentX + 798, 300);
	ctx.textAlign = 'left';
	drawProgress(ctx, contentX + 182, 340, 616, 27, level.currentxp, level.maxxp, accent, accent2);
	ctx.fillStyle = '#e8edf7';
	setFont(ctx, 700, 17);
	ctx.fillText(opt.guild ? 'SERVER LEVEL' : 'GLOBAL LEVEL', contentX + 182, 397);
	return canvas.toBuffer('image/png');
};

exports.renderProfileCard = async function (info) {
	const width = 1080;
	const height = 800;
	const canvas = createCanvas(width, height);
	const ctx = canvas.getContext('2d');
	const accent = parseColor(info?.theme?.accent || info?.theme?.name_color, '#8b5cf6');
	const accent2 = parseColor(info?.theme?.accent2, '#38bdf8');
	await drawWallpaper(ctx, width, height, info?.theme, accent, accent2);
	const avatar = await fetchRemoteImage(info?.user?.avatarURL, 'Avatar');
	drawSquareAvatar(ctx, avatar, info?.user?.name, 40, 42, 278, accent);
	drawHeaderText(ctx, info?.user?.name || 'OwO User', info?.user?.title || 'An OwO Bot User', 356, 102, 668, accent);
	const level = info?.level || {};
	drawGlassPanel(ctx, 356, 202, 684, 152, 24, 0.84);
	ctx.fillStyle = MUTED;
	setFont(ctx, 700, 16);
	ctx.fillText('LEVEL', 382, 239);
	ctx.fillText('RANK', 502, 239);
	ctx.textAlign = 'right';
	ctx.fillText('XP', 1010, 239);
	ctx.textAlign = 'left';
	ctx.fillStyle = WHITE;
	setFont(ctx, 700, 58);
	ctx.fillText(safeText(level.lvl, '0'), 380, 302);
	setFont(ctx, 700, 31);
	ctx.fillText(fitText(ctx, safeText(info?.rank?.text, 'Last'), 210), 502, 290);
	ctx.textAlign = 'right';
	setFont(ctx, 700, 27);
	ctx.fillText(`${formatNumber(level.currentxp)} / ${formatNumber(level.maxxp)}`, 1010, 290);
	ctx.textAlign = 'left';
	drawProgress(ctx, 502, 313, 508, 22, level.currentxp, level.maxxp, accent, accent2);
	const rank = info?.rank?.text || 'Last';
	const cookie = info?.cookie?.text || '+0';
	if (info?.marriage) {
		const tileWidth = 322;
		drawStatTile(ctx, 40, 390, tileWidth, 'Rank', rank);
		drawStatTile(ctx, 379, 390, tileWidth, 'Cookies', cookie);
		await drawMarriageTile(ctx, 718, 390, tileWidth, info.marriage, accent);
	} else {
		drawStatTile(ctx, 40, 390, 492, 'Rank', rank);
		drawStatTile(ctx, 548, 390, 492, 'Cookies', cookie);
	}
	drawGlassPanel(ctx, 40, 522, 1000, 230, 26, 0.84);
	ctx.fillStyle = WHITE;
	setFont(ctx, 700, 34);
	ctx.fillText('About me', 70, 578);
	ctx.fillStyle = accent;
	roundedRect(ctx, 70, 594, 66, 5, 3);
	ctx.fill();
	ctx.fillStyle = '#f0f3f8';
	setFont(ctx, 500, 28);
	const aboutLines = wrapText(ctx, info?.aboutme || "I'm just a plain human.", 930, 4);
	aboutLines.forEach((line, index) => ctx.fillText(line, 70, 646 + index * 40));
	return canvas.toBuffer('image/png');
};
