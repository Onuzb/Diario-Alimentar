-- =============================================================================
-- Diário Alimentar — segurança (RLS e permissões)
--
-- ATENÇÃO: este app é de uso individual e NÃO tem login. A chave "anon" do
-- Supabase vai embutida no JavaScript do navegador, então quem souber a URL do
-- projeto e a chave consegue ler e alterar estas tabelas. Por isso:
--   * use o app apenas localmente (npm run dev), sem publicá-lo na internet;
--   * antes de publicar, adicione login e troque as políticas abaixo por
--     políticas baseadas em auth.uid() (com coluna user_id nas tabelas).
--
-- O RLS fica LIGADO de propósito: ele deixa a regra de acesso explícita e
-- facilita a troca por políticas por usuário depois.
-- =============================================================================

alter table public.foods             enable row level security;
alter table public.daily_diaries     enable row level security;
alter table public.meals             enable row level security;
alter table public.meal_foods        enable row level security;
alter table public.food_experiences  enable row level security;

create policy "uso_individual_sem_login" on public.foods
  for all to anon, authenticated using (true) with check (true);
create policy "uso_individual_sem_login" on public.daily_diaries
  for all to anon, authenticated using (true) with check (true);
create policy "uso_individual_sem_login" on public.meals
  for all to anon, authenticated using (true) with check (true);
create policy "uso_individual_sem_login" on public.meal_foods
  for all to anon, authenticated using (true) with check (true);
create policy "uso_individual_sem_login" on public.food_experiences
  for all to anon, authenticated using (true) with check (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;
