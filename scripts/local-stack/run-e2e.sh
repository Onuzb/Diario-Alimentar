#!/usr/bin/env bash
# Compila o app apontando para o servidor de teste e roda o teste ponta a ponta.
# Pré-requisitos já rodando: npm run local:db  e  npm run local:api
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT="${E2E_DIST:-/tmp/diario-e2e-dist}"
# VITE_VAPID_PUBLIC_KEY: chave só de teste (nenhum aviso real sai deste ambiente).
VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=teste VITE_VAPID_PUBLIC_KEY=BFT3X1_lWZmY23_AkhLKSQIxRaRONQ9swR1uFKq1w8TTNP2wusli5iaFevpv6FkM3fulPNH2Aj4RBtDZo5ISt1A npx vite build --outDir "$OUT" --emptyOutDir >/dev/null
pkill -f "vite preview --outDir $OUT" 2>/dev/null || true
nohup npx vite preview --outDir "$OUT" --port 4173 --host 127.0.0.1 >/tmp/diario-preview.log 2>&1 &
sleep 2
node scripts/local-stack/e2e.cjs "$@"
