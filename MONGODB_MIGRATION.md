# MongoDB Migration

This branch is converting OwO Bot from the original MySQL + Redis persistence stack to MongoDB.

## Current migration state

MongoDB is now the runtime backend for:

- shared Mongo connection/index management
- the former Redis hash/set/sorted-set compatibility API
- cross-shard pub/sub
- rules acceptance and the global rules gate
- shared user UID allocation
- shared quest and animal cache helpers
- command bans, timeouts, and disabled-command checks
- disable/enable command configuration
- cowoncy balance reads
- `owo give` balance transfers, transfer limits, and transaction logging

MySQL is intentionally still initialized on this branch because several command domains still contain raw SQL. Do not remove the MySQL dependency or deploy with MySQL disabled until `npm run audit:mongo-cutover -- --strict` passes.

## MongoDB requirements

Use MongoDB Atlas or a MongoDB replica set. Multi-document transactions are required for economy transfers. Change streams are used for pub/sub when available; a polling fallback exists for pub/sub, but transactions still require replica-set/Atlas support.

Required runtime variables:

```text
MONGODB_URI=...
MONGODB_DB=owo
```

See `.env.example` for optional pool settings and temporary source-database variables.

## Data migration

Back up MySQL/MariaDB and Redis before running either migration script.

```bash
npm run migrate:mysql-to-mongo
npm run migrate:redis-to-mongo
```

The MySQL migration is batch-based and idempotent. Existing BIGINT values are imported as strings to prevent JavaScript from rounding Discord snowflakes or large counters. Runtime economy arithmetic uses MongoDB Decimal128 expressions while storing the final integer value as a string.

The Redis migration copies hashes, sorted sets, sets, and TTLs into MongoDB compatibility collections.

## Cutover audit

Run:

```bash
npm run audit:mongo-cutover
```

For a hard gate:

```bash
npm run audit:mongo-cutover -- --strict
```

The migration branch CI also reports remaining files that contain MySQL/SQL markers.

## Final cutover checklist

1. Finish converting every file reported by the MongoDB cutover audit.
2. Run both migration scripts against a recent backup/staging copy.
3. Compare critical record counts and spot-check balances, animals, quests, inventory, marriages, battle state, and guild settings.
4. Smoke-test commands that create or mutate data, especially economy and battle commands.
5. Run the strict cutover audit and the normal lint/circular-dependency checks.
6. Remove the runtime MySQL initialization, SQL command parameters, MySQL dependency, and migration-only Redis dependency.
7. Deploy against MongoDB Atlas/replica set, then remove the old database services only after verification.
