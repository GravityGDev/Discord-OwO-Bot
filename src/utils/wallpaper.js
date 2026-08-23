/* Shared helpers for MongoDB-backed profile wallpapers. */

const bundledWallpaperUrls = {
	1: 'https://static.wikia.nocookie.net/owobot/images/a/a1/Wallpaper1.png/revision/latest?cb=20230216133355',
	2: 'https://static.wikia.nocookie.net/owobot/images/3/3c/Wallpaper2.png/revision/latest?cb=20230216133404',
	3: 'https://static.wikia.nocookie.net/owobot/images/9/93/Wallpaper3.png/revision/latest?cb=20230216133409',
	4: 'https://static.wikia.nocookie.net/owobot/images/c/cf/Wallpaper4.png/revision/latest?cb=20230216133422',
	5: 'https://static.wikia.nocookie.net/owobot/images/c/ce/Wallpaper5.png/revision/latest?cb=20230216133427',
	6: 'https://static.wikia.nocookie.net/owobot/images/9/9d/Wallpaper6.png/revision/latest?cb=20230216133435',
	7: 'https://static.wikia.nocookie.net/owobot/images/2/23/Wallpaper7.png/revision/latest?cb=20230216133445',
	8: 'https://static.wikia.nocookie.net/owobot/images/b/b5/Wallpaper8.png/revision/latest?cb=20230216133458',
	9: 'https://static.wikia.nocookie.net/owobot/images/f/f9/Wallpaper9.png/revision/latest?cb=20230216133506',
	10: 'https://static.wikia.nocookie.net/owobot/images/6/6c/Wallpaper10.png/revision/latest?cb=20230216133517',
	11: 'https://static.wikia.nocookie.net/owobot/images/6/61/Wallpaper11.png/revision/latest?cb=20230216133523',
	12: 'https://static.wikia.nocookie.net/owobot/images/f/fc/Wallpaper12.png/revision/latest?cb=20230216133527',
};

function getStoredUrl(wallpaper) {
	return (
		wallpaper.url ||
		wallpaper.image_url ||
		wallpaper.imageURL ||
		wallpaper.image ||
		wallpaper.link ||
		wallpaper.background_url ||
		wallpaper.wallpaper_url ||
		null
	);
}

exports.getUrl = function (wallpaper) {
	if (!wallpaper) return null;
	const storedUrl = getStoredUrl(wallpaper);
	if (storedUrl) return storedUrl;

	const host = String(process.env.GEN_HOST || '')
		.trim()
		.replace(/\/+$/, '');
	if (host && wallpaper.bid != null) return `${host}/background/${wallpaper.bid}.png`;

	const bid = Number(wallpaper.bid);
	if (Number.isInteger(bid) && bundledWallpaperUrls[bid]) {
		return bundledWallpaperUrls[bid];
	}

	if (Number.isInteger(bid) && bid > 0) {
		return `https://owobot.fandom.com/wiki/Special:Redirect/file/Wallpaper${bid}.png`;
	}
	return null;
};
