#!/bin/sh
# Prod entrypoint: apply pending migrations, then start the server.
# Idempotent — drizzle's migrator skips already-applied files.
set -e
echo "[entrypoint] running migrations..."
node dist/db/migrate.js
echo "[entrypoint] starting server..."
exec node dist/server.js
