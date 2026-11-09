#!/usr/bin/env bash
# Compila o app apontando para o servidor de teste e roda o teste ponta a ponta.
# Pré-requisitos já rodando: npm run local:db  e  npm run local:api
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT="${E2E_DIST:-/tmp/diario-e2e-dist}"
VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=teste npx vite build --outDir "$OUT" --emptyOutDir >/dev/null
pkill -f "vite preview --outDir $OUT" 2>/dev/null || true
nohup npx vite preview --outDir "$OUT" --port 4173 --host 127.0.0.1 >/tmp/diario-preview.log 2>&1 &
sleep 2
node scripts/local-stack/e2e.cjs "$@"
