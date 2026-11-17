#!/usr/bin/env bash
# Regera supabase/setup.sql juntando, na ordem, os arquivos de supabase/migrations/.
# Rode depois de criar ou editar uma migração: bash scripts/build-setup.sh
set -euo pipefail
cd "$(dirname "$0")/.."
files=(supabase/migrations/*.sql)
{
  echo "-- Diário Alimentar: script único com tudo (tabelas, funções, segurança e lembretes)."
  echo "-- Cole este arquivo inteiro no SQL Editor do Supabase e clique em Run, UMA vez."
  echo "-- É a soma, na ordem, dos ${#files[@]} arquivos de supabase/migrations/. Use este OU os ${#files[@]}, nunca os dois."
  echo "-- Já rodou uma versão anterior? Rode só a migração nova (veja o README)."
  for f in "${files[@]}"; do
    echo
    echo "-- ======================================================================"
    echo "-- $(basename "$f")"
    echo "-- ======================================================================"
    cat "$f"
  done
} > supabase/setup.sql
echo "supabase/setup.sql atualizado (${#files[@]} migrações)."
