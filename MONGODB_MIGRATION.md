# MongoDB Migration

This branch converts OwO Bot from the original MySQL + Redis persistence stack to MongoDB.

## Current migration state

The bot runtime is now MongoDB-only for application persistence. The strict cutover audit reports zero legacy SQL/MySQL markers under `src/`, and CI fails if a runtime SQL dependency is reintroduced.

MongoDB now backs:

- shared Mongo connection and index management
- the former Redis hash/set/sorted-set runtime API
- cross-shard pub/sub
- users, guild settings, rules, bans, cooldown/config state and command settings
- quests, surveys, voting and checklist state
- Cowoncy balances, transfers, transactions and gambling
- daily rewards, claims, Patreon rewards and shared reward delivery
- inventory, trading, gems, lootboxes and weapon crates
- zoo animals, zoo totals, hunt, HuntBot, sacrifice, selling and upgrades
- battle teams, pets, weapons, crates and friendly battle state
- event items and giveaways
- ranking and leaderboard reads

The old runtime MySQL pool and MySQL command query handler have been removed. `src/owo.js` no longer initializes MySQL and command parameters no longer expose SQL connections/query helpers.

The `mysql` and `redis` npm packages are temporarily retained only for the one-time source-data import scripts. They are not part of the bot's runtime persistence path.

## Runtime environment

Create the host's private `.env` from the committed template:

```bash
cp .env.example .env
```

The real `.env` is gitignored and must never be committed. At minimum, fill in:

```text
BOT_TOKEN=your_discord_bot_token
MONGODB_URI=your_mongodb_atlas_or_replica_set_uri
MONGODB_DB=owo
```

`BOT_TOKEN` and a MongoDB URI are the only required secrets for the initial debug/single-shard deployment. DBL reporting, legacy socket services, InfluxDB logging and the old sharder coordination service are optional and can remain blank initially.

Some image-heavy commands use the optional `GEN_HOST`, `GEN_API_HOST` and `GEN_PASS` integration. The bot can boot without those values, but those particular generated-image features will not be fully functional until the service is configured.

See `.env.example` for every currently documented runtime and migration variable.

## MongoDB requirements

Use MongoDB Atlas or another MongoDB replica set. Multi-document transactions are required by economy, inventory, reward, giveaway and other mutation paths. Change streams are used for pub/sub when available; a polling fallback exists for pub/sub, but transactions still require a replica set or Atlas.

Recommended runtime Mongo settings are already shown in `.env.example`:

```text
MONGODB_MAX_POOL_SIZE=30
MONGODB_MIN_POOL_SIZE=0
MONGODB_SERVER_SELECTION_TIMEOUT=10000
```

## Fresh MongoDB initialization

A brand-new Mongo database needs the base animal definitions before the bot can enable its command/event handlers. Seed those directly into MongoDB with:

```bash
npm run seed:mongo-static
```

The seeder is idempotent. It upserts the bundled base animal definitions and verifies they exist afterward, so it is safe to run again.

If you are importing a complete existing OwO database from MySQL, the migration script will copy the existing `animals` table as well. Running the static seeder afterward only refreshes the bundled base definitions and does not delete migrated rows.

Before starting the Discord bot on a host, run:

```bash
npm run preflight:runtime
```

The preflight verifies:

- `BOT_TOKEN` and the Mongo URI are configured
- MongoDB connects and indexes initialize
- the base animal collection is populated
- Mongo transactions are supported by performing and verifying a rollback
- optional integrations are reported as configured or disabled without printing secret values

## Data migration

Back up MySQL/MariaDB and Redis before running either source migration.

```bash
npm run migrate:mysql-to-mongo
npm run migrate:redis-to-mongo
```

The MySQL migration is batch-based and idempotent. Existing BIGINT values are imported as strings to prevent JavaScript from rounding Discord snowflakes or large counters. Runtime economy arithmetic uses MongoDB Decimal128 expressions while storing final integer values exactly.

The Redis migration copies hashes, sorted sets, sets and TTLs into the MongoDB compatibility collections used by the runtime Redis-shaped API.

The MySQL/Redis variables in `.env.example` are migration-only. They should not be present in the final runtime environment after the old data has been imported and verified.

Do not remove the `mysql` or `redis` npm packages until the corresponding one-time source migration is no longer needed.

## Automated validation

The migration branch CI now performs three important classes of checks:

1. syntax, lint, circular-dependency and strict Mongo-only runtime auditing
2. a clean dependency-resolution/install smoke test for fresh deployments
3. a real MongoDB replica-set smoke test that runs the static seeder, exercises indexes/transactions/rollback/precision-safe Cowoncy arithmetic, and runs the deployment preflight

The runtime audit can also be run locally:

```bash
npm run audit:mongo-cutover -- --strict
```

It must report zero legacy SQL/MySQL runtime markers.

## Deployment flow

1. Create a MongoDB Atlas database or another replica set.
2. Create `.env` from `.env.example` and set `BOT_TOKEN`, `MONGODB_URI` and `MONGODB_DB`.
3. If this is a fresh database, run `npm run seed:mongo-static`.
4. If preserving old bot data, temporarily add the MySQL/Redis source credentials and run the migration scripts.
5. Compare critical collection counts and spot-check balances, animals, quests, inventories, marriages, battle teams, weapons and guild settings.
6. Remove the temporary source-database credentials from the runtime `.env` after import verification.
7. Perform a clean dependency install on the deployment host.
8. Run `npm run preflight:runtime` and do not start the bot until it passes.
9. Start the bot and confirm the log reaches `[Startup] MongoDB runtime ready; event handlers enabled`.
10. Smoke-test read commands and mutation commands, especially Cowoncy transfers, daily/claim, hunt/HuntBot, zoo sell/sacrifice, inventory/trade, lootboxes, battle/team operations, rewards/events/giveaways and rankings.
11. Exercise concurrent mutation paths to confirm transaction behavior under duplicate requests/shards.
12. Once the real source data is imported and verified, remove migration-only MySQL/Redis packages.
13. Only after those checks should the migration PR be marked ready for merge and the old database services retired.
