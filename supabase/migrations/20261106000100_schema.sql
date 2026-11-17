-- =============================================================================
-- Diário Alimentar — esquema do banco (PostgreSQL / Supabase)
--
-- Versão de uso individual (MVP): sem login e sem user_id. Quando a página de
-- login for adicionada, crie uma migração que inclua user_id nas tabelas e
-- troque as políticas de segurança da migração 20261106000300_security.sql.
--
-- Datas e horários do diário são "relógio de parede" do Brasil: ficam em colunas
-- date e time, sem conversão de fuso. Apenas created_at/updated_at são timestamptz.
-- =============================================================================

-- unaccent permite comparar "Pão" e "pao" como o mesmo alimento.
create schema if not exists extensions;
create extension if not exists unaccent with schema extensions;

-- -----------------------------------------------------------------------------
-- Funções auxiliares
-- -----------------------------------------------------------------------------

-- Chave de comparação de nomes: sem acentos, minúscula, espaços colapsados.
create or replace function public.normalize_food_name(p_name text)
returns text
language sql
stable
parallel safe
set search_path = public, extensions
as $$
  select lower(unaccent(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'))))
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- foods — banco de alimentos
-- -----------------------------------------------------------------------------
create table public.foods (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  name_key    text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint foods_name_length check (char_length(name) between 1 and 80),
  constraint foods_name_key_not_empty check (name_key <> ''),
  constraint foods_name_key_unique unique (name_key)
);

comment on table public.foods is 'Alimentos cadastrados. name_key impede duplicatas ignorando acentos e maiúsculas.';

create or replace function public.foods_prepare()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  new.name := btrim(regexp_replace(coalesce(new.name, ''), '\s+', ' ', 'g'));
  new.name_key := public.normalize_food_name(new.name);
  return new;
end;
$$;

create trigger foods_prepare
  before insert or update on public.foods
  for each row execute function public.foods_prepare();

create trigger foods_set_updated_at
  before update on public.foods
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- daily_diaries — um diário por data
-- -----------------------------------------------------------------------------
create table public.daily_diaries (
  id                    uuid primary key default gen_random_uuid(),
  date                  date not null,
  general_observations  text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint daily_diaries_date_unique unique (date),
  constraint daily_diaries_date_range check (date between date '2000-01-01' and date '2100-12-31'),
  constraint daily_diaries_observations_length check (char_length(general_observations) <= 4000)
);

create trigger daily_diaries_set_updated_at
  before update on public.daily_diaries
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- meals — refeições de um diário (a mesma refeição pode ocorrer mais de uma vez)
-- -----------------------------------------------------------------------------
create table public.meals (
  id            uuid primary key default gen_random_uuid(),
  diary_id      uuid not null references public.daily_diaries (id) on delete cascade,
  meal_type     text not null,
  meal_time     time,
  feelings      text,
  thoughts      text,
  observations  text,
  feeling_tags  text[] not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint meals_type_valid check (
    meal_type in ('breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'supper')
  ),
  constraint meals_text_length check (
    coalesce(char_length(feelings), 0) <= 2000
    and coalesce(char_length(thoughts), 0) <= 2000
    and coalesce(char_length(observations), 0) <= 2000
  ),
  constraint meals_feeling_tags_valid check (
    cardinality(feeling_tags) <= 10
    and feeling_tags <@ array[
      'calm', 'happy', 'curious', 'hungry', 'satisfied',
      'neutral', 'not_hungry', 'anxious', 'uncomfortable', 'tired'
    ]::text[]
  )
);

create trigger meals_set_updated_at
  before update on public.meals
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- meal_foods — alimentos de cada refeição
-- Excluir um alimento remove apenas o vínculo; o texto da refeição permanece.
-- -----------------------------------------------------------------------------
create table public.meal_foods (
  id             uuid primary key default gen_random_uuid(),
  meal_id        uuid not null references public.meals (id) on delete cascade,
  food_id        uuid not null references public.foods (id) on delete cascade,
  quantity       text,
  consumed_time  time,
  observations   text,
  created_at     timestamptz not null default now(),
  constraint meal_foods_quantity_length check (char_length(quantity) <= 80),
  constraint meal_foods_observations_length check (char_length(observations) <= 2000)
);

-- Quando um alimento entra, sai ou muda numa refeição, a refeição também é atualizada.
create or replace function public.touch_meal_from_meal_foods()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    update public.meals set updated_at = now() where id = old.meal_id;
  else
    update public.meals set updated_at = now() where id = new.meal_id;
  end if;
  return null;
end;
$$;

create trigger meal_foods_touch_meal
  after insert or update or delete on public.meal_foods
  for each row execute function public.touch_meal_from_meal_foods();

-- -----------------------------------------------------------------------------
-- food_experiences — experiências com alimentos novos ou substituições
-- food_id usa RESTRICT: um alimento com experiências não pode ser excluído.
-- replaced_food_id (só em substituições) fica vazio se o alimento antigo sumir.
-- -----------------------------------------------------------------------------
create table public.food_experiences (
  id                 uuid primary key default gen_random_uuid(),
  food_id            uuid not null references public.foods (id) on delete restrict,
  experience_type    text not null,
  experience_date    date not null,
  experience_time    time,
  feelings           text,
  thoughts           text,
  after_experience   text,
  observations       text,
  feeling_tags       text[] not null default '{}',
  replaced_food_id   uuid references public.foods (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint food_experiences_type_valid check (experience_type in ('new_food', 'substitution')),
  constraint food_experiences_date_range check (experience_date between date '2000-01-01' and date '2100-12-31'),
  constraint food_experiences_text_length check (
    coalesce(char_length(feelings), 0) <= 2000
    and coalesce(char_length(thoughts), 0) <= 2000
    and coalesce(char_length(after_experience), 0) <= 2000
    and coalesce(char_length(observations), 0) <= 2000
  ),
  constraint food_experiences_feeling_tags_valid check (
    cardinality(feeling_tags) <= 10
    and feeling_tags <@ array[
      'calm', 'happy', 'curious', 'hungry', 'satisfied',
      'neutral', 'not_hungry', 'anxious', 'uncomfortable', 'tired'
    ]::text[]
  ),
  constraint food_experiences_replaced_only_for_substitution check (
    replaced_food_id is null or experience_type = 'substitution'
  ),
  constraint food_experiences_replaced_differs check (
    replaced_food_id is null or replaced_food_id <> food_id
  )
);

create trigger food_experiences_set_updated_at
  before update on public.food_experiences
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Índices (as chaves únicas já criam índices para name_key e date)
-- -----------------------------------------------------------------------------
create index meals_diary_id_idx              on public.meals (diary_id);
create index meal_foods_meal_id_idx          on public.meal_foods (meal_id);
create index meal_foods_food_id_idx          on public.meal_foods (food_id);
create index food_experiences_food_id_idx    on public.food_experiences (food_id);
create index food_experiences_replaced_idx   on public.food_experiences (replaced_food_id);
create index food_experiences_date_idx       on public.food_experiences (experience_date desc);

-- -----------------------------------------------------------------------------
-- foods_overview — alimentos com os números exibidos em "Alimentos registrados"
--   times_consumed     = linhas em meal_foods
--   first_record_date  = data mais antiga entre refeição e experiência
-- -----------------------------------------------------------------------------
create view public.foods_overview
with (security_invoker = true) as
select
  f.id,
  f.name,
  f.created_at,
  coalesce(mf.times_consumed, 0)::int       as times_consumed,
  coalesce(ex.experience_count, 0)::int     as experience_count,
  least(mf.first_meal_date, ex.first_experience_date)       as first_record_date,
  greatest(mf.last_meal_date, ex.last_experience_date)      as last_record_date
from public.foods f
left join (
  select mf.food_id,
         count(*)    as times_consumed,
         min(d.date) as first_meal_date,
         max(d.date) as last_meal_date
  from public.meal_foods mf
  join public.meals m on m.id = mf.meal_id
  join public.daily_diaries d on d.id = m.diary_id
  group by mf.food_id
) mf on mf.food_id = f.id
left join (
  select e.food_id,
         count(*)                 as experience_count,
         min(e.experience_date)   as first_experience_date,
         max(e.experience_date)   as last_experience_date
  from public.food_experiences e
  group by e.food_id
) ex on ex.food_id = f.id;
