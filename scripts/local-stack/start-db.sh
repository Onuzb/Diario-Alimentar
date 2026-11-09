#!/usr/bin/env bash
# Sobe um Postgres local descartável e aplica as migrações.
# Só para teste: o app de verdade usa o seu projeto Supabase.
#
# Uso: bash scripts/local-stack/start-db.sh        (porta 54329, banco "diario")
# Requer os binários do PostgreSQL 16 (ajuste PG_BIN se estiverem em outro lugar).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
PORT="${PGPORT_LOCAL:-54329}"
DATA="${LOCAL_DB_DIR:-/tmp/diario-local-db}"
RUN_AS=""

# O Postgres não roda como root: usa o usuário "postgres" se necessário.
if [ "$(id -u)" = "0" ]; then
  RUN_AS="runuser -u postgres --"
  mkdir -p "$DATA" && chown postgres:postgres "$DATA"
fi

if [ ! -f "$DATA/PG_VERSION" ]; then
  $RUN_AS "$PG_BIN/initdb" -D "$DATA" -A trust -U postgres >/dev/null
fi

if ! $RUN_AS "$PG_BIN/pg_ctl" -D "$DATA" status >/dev/null 2>&1; then
  $RUN_AS "$PG_BIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp" -l "$DATA/server.log" -w start >/dev/null
fi

PSQL="psql -h /tmp -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
$PSQL -d postgres -c "drop database if exists diario" -c "create database diario"
$PSQL -d diario -f "$ROOT/scripts/local-stack/00_bootstrap.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "aplicando $(basename "$f")"
  $PSQL -d diario -f "$f"
done
echo "Postgres local pronto na porta $PORT (banco diario)."
