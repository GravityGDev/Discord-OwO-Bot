# OwO Bot

[![Discord Bots](https://discordbots.org/api/widget/status/408785106942164992.svg)](https://discordbots.org/bot/408785106942164992) [![Discord Bots](https://discordbots.org/api/widget/servers/408785106942164992.svg)](https://discordbots.org/bot/408785106942164992) [![Discord Bots](https://discordbots.org/api/widget/lib/408785106942164992.svg)](https://discordbots.org/bot/408785106942164992)

Here are the codes for OwO Bot! Feel free to submit an issue or open a pull request!

## Self hosting

This migration branch uses **MongoDB** for runtime persistence. Use MongoDB Atlas or another replica set because economy and other state-changing commands use multi-document transactions.

Create a private runtime environment file from the template:

```bash
cp .env.example .env
```

At minimum configure:

```text
BOT_TOKEN=your_discord_bot_token
MONGODB_URI=your_mongodb_atlas_or_replica_set_uri
MONGODB_DB=owo
```

For a brand-new database, seed the bundled base reference data and run the deployment preflight before starting Discord:

```bash
npm install
npm run seed:mongo-static
npm run preflight:runtime
npm run start:checked
```

The real `.env` file is gitignored and must not be committed. Optional integrations such as DBL reporting, Patreon administration, legacy socket services, InfluxDB logging and the image-generation service can be left blank for the initial single-shard/debug deployment.

If you are preserving data from an older MySQL/MariaDB + Redis installation, temporary source-database variables and migration commands are documented in [MONGODB_MIGRATION.md](./MONGODB_MIGRATION.md). MySQL and Redis are no longer runtime persistence requirements.

## Render background worker

The repository includes a root-level `render.yaml` for a Render **Background Worker**. It is configured for Node.js 24, the Frankfurt region, the `mongodb-migration` branch, MongoDB pre-deploy seeding, checked startup, and graceful shutdown.

Create the worker from the Render Blueprint and provide the two private values Render requests:

```text
BOT_TOKEN=your_discord_bot_token
MONGODB_URI=your_mongodb_atlas_or_replica_set_uri
```

`MONGODB_DB=owo` and the standard Mongo client settings are supplied by the Blueprint. Additional optional keys are listed in `.env.example` and can be added in Render's **Environment** section when those integrations are needed.

Automatic deployment is set to **After CI Checks Pass**. Every successful push to `mongodb-migration` therefore causes Render to rebuild and restart the worker automatically, while a commit with failing GitHub checks is not deployed.

The Render commands are:

```text
Build:      npm ci --no-audit --no-fund
Pre-deploy: npm run seed:mongo-static
Start:      npm run start:checked
```

When the migration is ultimately merged to `master`, change the Blueprint/service branch from `mongodb-migration` to `master` so future production pushes continue to auto-deploy.

## License

OwO Bot is licensed under the terms of [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International](https://github.com/ChristopherBThai/Discord-OwO-Bot/blob/master/LICENSE) ("CC-BY-NC-SA-4.0"). Commercial use is not allowed under this license. This includes any kind of revenue made with or based upon the software, even donations.

The CC-BY-NC-SA-4.0 allows you to:

- [x] **Share** -- copy and redistribute the material in any medium or format
- [x] **Adapt** -- remix, transform, and build upon the material

Under the following terms:

- **Attribution** — You must give appropriate credit, provide a link to the license, and indicate if changes were made. You may do so in any reasonable manner, but not in any way that suggests the licensor endorses you or your use.
- **NonCommercial** — You may not use the material for commercial purposes.
- **ShareAlike** — If you remix, transform, or build upon the material, you must distribute your contributions under the same license as the original.

More information can be found [here](https://creativecommons.org/licenses/by-nc-sa/4.0/).

## Contributing

All merge requests are welcome! Just make sure to sign the [CLA](https://cla-assistant.io/ChristopherBThai/Discord-OwO-Bot) or else we cannot merge your changes.
