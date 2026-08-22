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

## MongoDB requirements

Use MongoDB Atlas or another MongoDB replica set. Multi-document transactions are required by economy, inventory, reward, giveaway and other mutation paths. Change streams are used for pub/sub when available; a polling fallback exists for pub/sub, but transactions still require a replica set or Atlas.

Required runtime variables:

```text
MONGODB_URI=...
MONGODB_DB=owo
```

See `.env.example` for optional MongoDB pool settings and temporary source-database variables.

## Data migration

Back up MySQL/MariaDB and Redis before running either source migration.

```bash
npm run migrate:mysql-to-mongo
npm run migrate:redis-to-mongo
```

The MySQL migration is batch-based and idempotent. Existing BIGINT values are imported as strings to prevent JavaScript from rounding Discord snowflakes or large counters. Runtime economy arithmetic uses MongoDB Decimal128 expressions while storing final integer values exactly.

The Redis migration copies hashes, sorted sets, sets and TTLs into the MongoDB compatibility collections used by the runtime Redis-shaped API.

Do not remove the `mysql` or `redis` npm packages until the corresponding one-time source migration is no longer needed.

## Cutover audit

Run the normal report with:

```bash
npm run audit:mongo-cutover
```

Run the hard gate with:

```bash
npm run audit:mongo-cutover -- --strict
```

The migration branch CI uses the strict form and requires zero legacy SQL/MySQL runtime markers.

## Remaining deployment validation

The code cutover is complete, but production migration is not considered finished until it has been validated against a real MongoDB replica-set deployment.

1. Run the MySQL and Redis import scripts against a recent backup or staging copy of the old data.
2. Compare critical collection counts and spot-check balances, animals, quests, inventories, marriages, battle teams, weapons and guild settings.
3. Start the bot against MongoDB Atlas/replica set and verify startup/index creation with no legacy database services configured.
4. Smoke-test read commands and mutation commands, especially Cowoncy transfers, daily/claim, hunt/HuntBot, zoo sell/sacrifice, inventory/trade, lootboxes, battle/team operations, rewards/events/giveaways and rankings.
5. Exercise concurrent mutation paths to confirm transaction behavior under duplicate requests/shards.
6. Once the real source data is imported and verified, remove migration-only MySQL/Redis packages and source migration credentials.
7. Only after those checks should the migration PR be marked ready for merge and the old database services retired.
