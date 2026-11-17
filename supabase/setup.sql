-- Diário Alimentar: script único com tudo (tabelas, funções, segurança e lembretes).
-- Cole este arquivo inteiro no SQL Editor do Supabase e clique em Run, UMA vez.
-- É a soma, na ordem, dos 4 arquivos de supabase/migrations/. Use este OU os 4, nunca os dois.
-- Já rodou uma versão anterior? Rode só a migração nova (veja o README).

-- ======================================================================
-- 20261106000100_schema.sql
-- ======================================================================
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

-- ======================================================================
-- 20261106000200_functions.sql
-- ======================================================================
-- =============================================================================
-- Diário Alimentar — funções de negócio (chamadas pelo app via supabase.rpc)
--
-- Cada função que grava vários registros roda dentro de uma única transação,
-- então um erro no meio nunca deixa dados pela metade.
-- Todas usam SECURITY INVOKER: as regras de acesso valem como definido em
-- 20261106000300_security.sql.
--
-- As mensagens de erro lançadas aqui são exibidas ao usuário, por isso estão
-- em português e dizem o que fazer.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Escrita
-- -----------------------------------------------------------------------------

-- Devolve o id do diário da data, criando-o se ainda não existir.
create or replace function public.get_or_create_diary(p_date date)
returns uuid
language plpgsql
set search_path = public, extensions
as $$
declare
  v_id uuid;
begin
  if p_date is null then
    raise exception 'Escolha uma data para o diário.' using errcode = '22023';
  end if;

  insert into public.daily_diaries (date) values (p_date)
  on conflict (date) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.daily_diaries where date = p_date;
  end if;
  return v_id;
end;
$$;

-- Devolve o id do alimento com esse nome (ignorando acentos e maiúsculas),
-- criando-o se não existir. O app já perguntou ao usuário antes de chegar aqui.
create or replace function public.get_or_create_food(p_name text)
returns uuid
language plpgsql
set search_path = public, extensions
as $$
declare
  v_key text := public.normalize_food_name(p_name);
  v_id  uuid;
begin
  if v_key = '' then
    raise exception 'Informe o nome do alimento.' using errcode = '22023';
  end if;

  select id into v_id from public.foods where name_key = v_key;
  if v_id is not null then
    return v_id;
  end if;

  begin
    insert into public.foods (name) values (p_name) returning id into v_id;
  exception when unique_violation then
    select id into v_id from public.foods where name_key = v_key;
  end;
  return v_id;
end;
$$;

-- Cria ou atualiza uma refeição (horário, sentimentos, pensamentos, observações).
-- p_meal_id nulo = criar na data p_date. Tipo e data de uma refeição existente não mudam.
create or replace function public.save_meal(
  p_meal_id       uuid,
  p_date          date,
  p_meal_type     text,
  p_meal_time     time,
  p_feelings      text,
  p_thoughts      text,
  p_observations  text,
  p_feeling_tags  text[]
)
returns uuid
language plpgsql
set search_path = public, extensions
as $$
declare
  v_id        uuid;
  v_diary     uuid;
  v_feelings  text   := nullif(btrim(p_feelings), '');
  v_thoughts  text   := nullif(btrim(p_thoughts), '');
  v_obs       text   := nullif(btrim(p_observations), '');
  v_tags      text[] := coalesce(p_feeling_tags, '{}');
  v_blank     boolean;
begin
  v_blank := p_meal_time is null and v_feelings is null and v_thoughts is null
             and v_obs is null and cardinality(v_tags) = 0;

  if p_meal_id is null then
    if p_date is null or p_meal_type is null then
      raise exception 'Informe a data e o tipo da refeição.' using errcode = '22023';
    end if;
    if v_blank then
      raise exception 'Preencha ao menos um campo ou adicione um alimento.' using errcode = '22023';
    end if;
    v_diary := public.get_or_create_diary(p_date);
    insert into public.meals (diary_id, meal_type, meal_time, feelings, thoughts, observations, feeling_tags)
    values (v_diary, p_meal_type, p_meal_time, v_feelings, v_thoughts, v_obs, v_tags)
    returning id into v_id;
  else
    if v_blank and not exists (select 1 from public.meal_foods where meal_id = p_meal_id) then
      raise exception 'Preencha ao menos um campo ou adicione um alimento.' using errcode = '22023';
    end if;
    update public.meals
       set meal_time = p_meal_time,
           feelings = v_feelings,
           thoughts = v_thoughts,
           observations = v_obs,
           feeling_tags = v_tags
     where id = p_meal_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Essa refeição não existe mais. Atualize a página.' using errcode = 'P0002';
    end if;
  end if;

  return v_id;
end;
$$;

-- Adiciona um alimento a uma refeição. Cria, se preciso, o diário do dia, a
-- refeição (p_meal_id nulo) e o alimento (p_food_id nulo + p_food_name).
create or replace function public.add_food_to_meal(
  p_meal_id         uuid,
  p_date            date,
  p_meal_type       text,
  p_food_id         uuid,
  p_food_name       text,
  p_quantity        text,
  p_consumed_time   time,
  p_observations    text
)
returns jsonb
language plpgsql
set search_path = public, extensions
as $$
declare
  v_food  uuid;
  v_meal  uuid;
  v_diary uuid;
  v_mf    uuid;
begin
  if p_food_id is not null then
    select id into v_food from public.foods where id = p_food_id;
    if v_food is null then
      raise exception 'Esse alimento não existe mais. Atualize a página e escolha outro.' using errcode = 'P0002';
    end if;
  else
    v_food := public.get_or_create_food(p_food_name);
  end if;

  if p_meal_id is not null then
    select id into v_meal from public.meals where id = p_meal_id;
    if v_meal is null then
      raise exception 'Essa refeição não existe mais. Atualize a página.' using errcode = 'P0002';
    end if;
  else
    if p_date is null or p_meal_type is null then
      raise exception 'Informe a data e o tipo da refeição.' using errcode = '22023';
    end if;
    v_diary := public.get_or_create_diary(p_date);
    insert into public.meals (diary_id, meal_type, meal_time)
    values (v_diary, p_meal_type, p_consumed_time)
    returning id into v_meal;
  end if;

  insert into public.meal_foods (meal_id, food_id, quantity, consumed_time, observations)
  values (v_meal, v_food, nullif(btrim(p_quantity), ''), p_consumed_time, nullif(btrim(p_observations), ''))
  returning id into v_mf;

  return jsonb_build_object('meal_id', v_meal, 'meal_food_id', v_mf, 'food_id', v_food);
end;
$$;

-- Tira um alimento de uma refeição. Se a refeição ficar totalmente vazia
-- (sem alimentos, horário, texto nem sentimentos), ela também é removida.
create or replace function public.remove_food_from_meal(p_meal_food_id uuid)
returns jsonb
language plpgsql
set search_path = public, extensions
as $$
declare
  v_meal    uuid;
  v_deleted boolean;
begin
  delete from public.meal_foods where id = p_meal_food_id returning meal_id into v_meal;
  if v_meal is null then
    raise exception 'Esse alimento já foi removido da refeição.' using errcode = 'P0002';
  end if;

  delete from public.meals m
   where m.id = v_meal
     and m.meal_time is null
     and m.feelings is null
     and m.thoughts is null
     and m.observations is null
     and cardinality(m.feeling_tags) = 0
     and not exists (select 1 from public.meal_foods where meal_id = m.id);
  v_deleted := found;

  return jsonb_build_object('meal_id', v_meal, 'meal_deleted', v_deleted);
end;
$$;

-- Grava as observações gerais do dia (texto vazio apaga a observação).
create or replace function public.save_day_notes(p_date date, p_notes text)
returns uuid
language plpgsql
set search_path = public, extensions
as $$
declare
  v_id uuid := public.get_or_create_diary(p_date);
begin
  update public.daily_diaries
     set general_observations = nullif(btrim(p_notes), '')
   where id = v_id;
  return v_id;
end;
$$;

-- Cria (p_id nulo) ou atualiza uma experiência alimentar.
-- O alimento pode vir por id ou por nome (criado se for novo). Em substituições,
-- o alimento substituído é opcional e segue a mesma regra.
create or replace function public.save_food_experience(
  p_id                   uuid,
  p_food_id              uuid,
  p_food_name            text,
  p_type                 text,
  p_date                 date,
  p_time                 time,
  p_feelings             text,
  p_thoughts             text,
  p_after_experience     text,
  p_observations         text,
  p_feeling_tags         text[],
  p_replaced_food_id     uuid,
  p_replaced_food_name   text
)
returns jsonb
language plpgsql
set search_path = public, extensions
as $$
declare
  v_food      uuid;
  v_replaced  uuid;
  v_id        uuid;
begin
  if p_type is null or p_type not in ('new_food', 'substitution') then
    raise exception 'Escolha o tipo da experiência: alimento novo ou substituição.' using errcode = '22023';
  end if;
  if p_date is null then
    raise exception 'Escolha a data da experiência.' using errcode = '22023';
  end if;

  if p_food_id is not null then
    select id into v_food from public.foods where id = p_food_id;
    if v_food is null then
      raise exception 'Esse alimento não existe mais. Atualize a página e escolha outro.' using errcode = 'P0002';
    end if;
  else
    v_food := public.get_or_create_food(p_food_name);
  end if;

  if p_type = 'substitution' then
    if p_replaced_food_id is not null then
      select id into v_replaced from public.foods where id = p_replaced_food_id;
      if v_replaced is null then
        raise exception 'O alimento substituído não existe mais. Escolha outro.' using errcode = 'P0002';
      end if;
    elsif nullif(btrim(p_replaced_food_name), '') is not null then
      v_replaced := public.get_or_create_food(p_replaced_food_name);
    end if;
    if v_replaced = v_food then
      raise exception 'O alimento substituído precisa ser diferente do novo alimento.' using errcode = '22023';
    end if;
  end if;

  if p_id is null then
    insert into public.food_experiences (
      food_id, experience_type, experience_date, experience_time,
      feelings, thoughts, after_experience, observations, feeling_tags, replaced_food_id
    ) values (
      v_food, p_type, p_date, p_time,
      nullif(btrim(p_feelings), ''), nullif(btrim(p_thoughts), ''),
      nullif(btrim(p_after_experience), ''), nullif(btrim(p_observations), ''),
      coalesce(p_feeling_tags, '{}'), v_replaced
    ) returning id into v_id;
  else
    update public.food_experiences set
      food_id = v_food,
      experience_type = p_type,
      experience_date = p_date,
      experience_time = p_time,
      feelings = nullif(btrim(p_feelings), ''),
      thoughts = nullif(btrim(p_thoughts), ''),
      after_experience = nullif(btrim(p_after_experience), ''),
      observations = nullif(btrim(p_observations), ''),
      feeling_tags = coalesce(p_feeling_tags, '{}'),
      replaced_food_id = v_replaced
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Essa experiência não existe mais. Atualize a página.' using errcode = 'P0002';
    end if;
  end if;

  return jsonb_build_object('id', v_id, 'food_id', v_food, 'replaced_food_id', v_replaced);
end;
$$;

-- -----------------------------------------------------------------------------
-- Leitura (devolvem jsonb pronto para a interface)
-- -----------------------------------------------------------------------------

-- Diário completo de uma data: diário, refeições com alimentos e experiências do dia.
create or replace function public.get_day(p_date date)
returns jsonb
language sql
stable
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'date', p_date,
    'diary', (
      select jsonb_build_object(
        'id', d.id, 'date', d.date,
        'general_observations', d.general_observations, 'updated_at', d.updated_at)
      from public.daily_diaries d where d.date = p_date
    ),
    'meals', coalesce((
      select jsonb_agg(
        to_jsonb(m) || jsonb_build_object('foods', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', mf.id, 'food_id', mf.food_id, 'food_name', f.name,
              'quantity', mf.quantity, 'consumed_time', mf.consumed_time,
              'observations', mf.observations)
            order by mf.consumed_time nulls last, mf.created_at, mf.id)
          from public.meal_foods mf
          join public.foods f on f.id = mf.food_id
          where mf.meal_id = m.id
        ), '[]'::jsonb))
        order by m.meal_time nulls last, m.created_at, m.id)
      from public.meals m
      join public.daily_diaries d on d.id = m.diary_id
      where d.date = p_date
    ), '[]'::jsonb),
    'experiences', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', e.id, 'food_id', e.food_id, 'food_name', f.name,
          'experience_type', e.experience_type, 'experience_time', e.experience_time,
          'feeling_tags', e.feeling_tags)
        order by e.experience_time nulls last, e.created_at, e.id)
      from public.food_experiences e
      join public.foods f on f.id = e.food_id
      where e.experience_date = p_date
    ), '[]'::jsonb)
  )
$$;

-- Dias de um mês que têm registro (refeição, experiência ou observação do dia).
create or replace function public.get_calendar_month(p_year int, p_month int)
returns jsonb
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  v_start date;
  v_end   date;
begin
  if p_month is null or p_month < 1 or p_month > 12 or p_year is null or p_year < 2000 or p_year > 2100 then
    raise exception 'Mês inválido.' using errcode = '22023';
  end if;
  v_start := make_date(p_year, p_month, 1);
  v_end   := (v_start + interval '1 month')::date;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'date', t.day, 'meal_count', t.meal_count,
        'experience_count', t.experience_count, 'has_notes', t.has_notes)
      order by t.day)
    from (
      select coalesce(a.day, b.day)             as day,
             coalesce(a.meal_count, 0)          as meal_count,
             coalesce(a.has_notes, false)       as has_notes,
             coalesce(b.experience_count, 0)    as experience_count
      from (
        select d.date as day,
               count(m.id)::int as meal_count,
               coalesce(btrim(d.general_observations), '') <> '' as has_notes
        from public.daily_diaries d
        left join public.meals m on m.diary_id = d.id
        where d.date >= v_start and d.date < v_end
        group by d.id
      ) a
      full join (
        select e.experience_date as day, count(*)::int as experience_count
        from public.food_experiences e
        where e.experience_date >= v_start and e.experience_date < v_end
        group by e.experience_date
      ) b on b.day = a.day
    ) t
    where t.meal_count > 0 or t.experience_count > 0 or t.has_notes
  ), '[]'::jsonb);
end;
$$;

-- Lista de dias com registro, do mais recente ao mais antigo.
-- p_query filtra por alimento (ignora acentos e maiúsculas); p_from/p_to limitam o período.
create or replace function public.search_history(
  p_query   text,
  p_from    date,
  p_to      date,
  p_limit   int,
  p_offset  int
)
returns jsonb
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  v_key     text := public.normalize_food_name(p_query);
  v_pattern text;
begin
  v_pattern := '%' || replace(replace(replace(v_key, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return (
    with candidate as (
      select d.date as day
        from public.daily_diaries d
       where v_key = ''
         and (p_from is null or d.date >= p_from)
         and (p_to is null or d.date <= p_to)
         and (exists (select 1 from public.meals m where m.diary_id = d.id)
              or coalesce(btrim(d.general_observations), '') <> '')
      union
      select e.experience_date
        from public.food_experiences e
       where v_key = ''
         and (p_from is null or e.experience_date >= p_from)
         and (p_to is null or e.experience_date <= p_to)
      union
      select d.date
        from public.daily_diaries d
        join public.meals m on m.diary_id = d.id
        join public.meal_foods mf on mf.meal_id = m.id
        join public.foods f on f.id = mf.food_id
       where v_key <> ''
         and f.name_key like v_pattern
         and (p_from is null or d.date >= p_from)
         and (p_to is null or d.date <= p_to)
      union
      select e.experience_date
        from public.food_experiences e
        join public.foods f on f.id = e.food_id
       where v_key <> ''
         and f.name_key like v_pattern
         and (p_from is null or e.experience_date >= p_from)
         and (p_to is null or e.experience_date <= p_to)
    ),
    page as (
      select day from candidate
       order by day desc
       limit greatest(coalesce(p_limit, 30), 1)
      offset greatest(coalesce(p_offset, 0), 0)
    )
    select jsonb_build_object(
      'total', (select count(*) from candidate),
      'days', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'date', p.day,
            'meals', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id', m.id, 'meal_type', m.meal_type, 'meal_time', m.meal_time,
                  'foods', coalesce((
                    select jsonb_agg(f.name order by mf.consumed_time nulls last, mf.created_at)
                    from public.meal_foods mf
                    join public.foods f on f.id = mf.food_id
                    where mf.meal_id = m.id
                  ), '[]'::jsonb))
                order by m.meal_time nulls last, m.created_at)
              from public.meals m
              join public.daily_diaries d on d.id = m.diary_id
              where d.date = p.day
            ), '[]'::jsonb),
            'experiences', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id', e.id, 'food_name', f.name, 'experience_type', e.experience_type)
                order by e.experience_time nulls last, e.created_at)
              from public.food_experiences e
              join public.foods f on f.id = e.food_id
              where e.experience_date = p.day
            ), '[]'::jsonb))
          order by p.day desc)
        from page p
      ), '[]'::jsonb)
    )
  );
end;
$$;

-- Experiências em ordem cronológica inversa, com filtros opcionais.
create or replace function public.get_experiences(
  p_type     text,
  p_from     date,
  p_to       date,
  p_food_id  uuid,
  p_limit    int,
  p_offset   int
)
returns jsonb
language sql
stable
set search_path = public, extensions
as $$
  with filtered as (
    select e.*
      from public.food_experiences e
     where (p_type is null or e.experience_type = p_type)
       and (p_from is null or e.experience_date >= p_from)
       and (p_to is null or e.experience_date <= p_to)
       and (p_food_id is null or e.food_id = p_food_id)
  ),
  page as (
    select * from filtered
     order by experience_date desc, experience_time desc nulls last, created_at desc, id
     limit greatest(coalesce(p_limit, 30), 1)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'items', coalesce((
      select jsonb_agg(
        to_jsonb(p) || jsonb_build_object('food_name', f.name, 'replaced_food_name', rf.name)
        order by p.experience_date desc, p.experience_time desc nulls last, p.created_at desc, p.id)
      from page p
      join public.foods f on f.id = p.food_id
      left join public.foods rf on rf.id = p.replaced_food_id
    ), '[]'::jsonb)
  )
$$;

-- Uma experiência pelo id (para a página de edição).
create or replace function public.get_experience(p_id uuid)
returns jsonb
language sql
stable
set search_path = public, extensions
as $$
  select to_jsonb(e) || jsonb_build_object('food_name', f.name, 'replaced_food_name', rf.name)
    from public.food_experiences e
    join public.foods f on f.id = e.food_id
    left join public.foods rf on rf.id = e.replaced_food_id
   where e.id = p_id
$$;

-- Página de um alimento: números, refeições em que apareceu e experiências.
create or replace function public.get_food_detail(p_food_id uuid)
returns jsonb
language sql
stable
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'food', (select to_jsonb(o) from public.foods_overview o where o.id = p_food_id),
    'meals', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'meal_food_id', mf.id, 'meal_id', m.id, 'date', d.date,
          'meal_type', m.meal_type, 'meal_time', m.meal_time,
          'consumed_time', mf.consumed_time, 'quantity', mf.quantity,
          'observations', mf.observations)
        order by d.date desc, coalesce(mf.consumed_time, m.meal_time) desc nulls last, mf.created_at desc, mf.id)
      from public.meal_foods mf
      join public.meals m on m.id = mf.meal_id
      join public.daily_diaries d on d.id = m.diary_id
      where mf.food_id = p_food_id
    ), '[]'::jsonb),
    'experiences', coalesce((
      select jsonb_agg(
        to_jsonb(e) || jsonb_build_object('food_name', f.name, 'replaced_food_name', rf.name)
        order by e.experience_date desc, e.experience_time desc nulls last, e.created_at desc, e.id)
      from public.food_experiences e
      join public.foods f on f.id = e.food_id
      left join public.foods rf on rf.id = e.replaced_food_id
      where e.food_id = p_food_id
    ), '[]'::jsonb)
  )
$$;

-- Painel inicial: contagens de hoje e últimas atividades (refeições e experiências).
create or replace function public.get_dashboard(p_today date)
returns jsonb
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  v_today  jsonb;
  v_recent jsonb;
begin
  select jsonb_build_object(
    'meal_count', (
      select count(*)::int from public.meals m
      join public.daily_diaries d on d.id = m.diary_id where d.date = p_today),
    'food_count', (
      select count(*)::int from public.meal_foods mf
      join public.meals m on m.id = mf.meal_id
      join public.daily_diaries d on d.id = m.diary_id where d.date = p_today),
    'experience_count', (
      select count(*)::int from public.food_experiences e where e.experience_date = p_today)
  ) into v_today;

  select coalesce(jsonb_agg(
    jsonb_build_object('kind', r.kind, 'id', r.id, 'date', r.day, 'at', r.at, 'detail', r.detail)
    order by r.at desc), '[]'::jsonb)
  into v_recent
  from (
    select * from (
      select 'meal'::text as kind, m.id, d.date as day, m.updated_at as at,
             jsonb_build_object(
               'meal_type', m.meal_type, 'meal_time', m.meal_time,
               'foods', coalesce((
                 select jsonb_agg(f.name order by mf.created_at)
                 from public.meal_foods mf join public.foods f on f.id = mf.food_id
                 where mf.meal_id = m.id), '[]'::jsonb)) as detail
        from public.meals m
        join public.daily_diaries d on d.id = m.diary_id
      union all
      select 'experience'::text, e.id, e.experience_date, e.updated_at,
             jsonb_build_object('food_name', f.name, 'experience_type', e.experience_type)
        from public.food_experiences e
        join public.foods f on f.id = e.food_id
    ) items
    order by at desc
    limit 8
  ) r;

  return jsonb_build_object('today', v_today, 'recent', v_recent);
end;
$$;

-- Acompanhamento pessoal. Só números e listas: não classifica alimentos nem avalia o usuário.
--   meal_count                  = refeições registradas no período
--   distinct_foods_registered   = alimentos distintos que aparecem em refeições
--   foods_tried                 = alimentos distintos com experiência do tipo "alimento novo"
--   experience_count            = experiências registradas
create or replace function public.get_report(p_from date, p_to date)
returns jsonb
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  v_totals   jsonb;
  v_top      jsonb;
  v_months   jsonb;
  v_timeline jsonb;
begin
  select jsonb_build_object(
    'meal_count', (
      select count(*)::int from public.meals m
      join public.daily_diaries d on d.id = m.diary_id
      where (p_from is null or d.date >= p_from) and (p_to is null or d.date <= p_to)),
    'distinct_foods_registered', (
      select count(distinct mf.food_id)::int from public.meal_foods mf
      join public.meals m on m.id = mf.meal_id
      join public.daily_diaries d on d.id = m.diary_id
      where (p_from is null or d.date >= p_from) and (p_to is null or d.date <= p_to)),
    'foods_tried', (
      select count(distinct e.food_id)::int from public.food_experiences e
      where e.experience_type = 'new_food'
        and (p_from is null or e.experience_date >= p_from) and (p_to is null or e.experience_date <= p_to)),
    'experience_count', (
      select count(*)::int from public.food_experiences e
      where (p_from is null or e.experience_date >= p_from) and (p_to is null or e.experience_date <= p_to))
  ) into v_totals;

  select coalesce(jsonb_agg(
    jsonb_build_object('food_id', t.food_id, 'name', t.name, 'times', t.times)
    order by t.times desc, t.name), '[]'::jsonb)
  into v_top
  from (
    select f.id as food_id, f.name, count(*)::int as times
      from public.meal_foods mf
      join public.meals m on m.id = mf.meal_id
      join public.daily_diaries d on d.id = m.diary_id
      join public.foods f on f.id = mf.food_id
     where (p_from is null or d.date >= p_from) and (p_to is null or d.date <= p_to)
     group by f.id, f.name
     order by count(*) desc, f.name
     limit 10
  ) t;

  select coalesce(jsonb_agg(
    jsonb_build_object('month', t.month, 'new_food', t.new_food, 'substitution', t.substitution)
    order by t.month), '[]'::jsonb)
  into v_months
  from (
    select to_char(e.experience_date, 'YYYY-MM') as month,
           count(*) filter (where e.experience_type = 'new_food')::int as new_food,
           count(*) filter (where e.experience_type = 'substitution')::int as substitution
      from public.food_experiences e
     where (p_from is null or e.experience_date >= p_from) and (p_to is null or e.experience_date <= p_to)
     group by 1
  ) t;

  select coalesce(jsonb_agg(
    to_jsonb(t.e) || jsonb_build_object('food_name', t.food_name, 'replaced_food_name', t.replaced_food_name)
    order by t.e_date desc, t.e_time desc nulls last, t.e_created desc), '[]'::jsonb)
  into v_timeline
  from (
    select e as e, f.name as food_name, rf.name as replaced_food_name,
           e.experience_date as e_date, e.experience_time as e_time, e.created_at as e_created
      from public.food_experiences e
      join public.foods f on f.id = e.food_id
      left join public.foods rf on rf.id = e.replaced_food_id
     where (p_from is null or e.experience_date >= p_from) and (p_to is null or e.experience_date <= p_to)
     order by e.experience_date desc, e.experience_time desc nulls last, e.created_at desc
     limit 100
  ) t;

  return jsonb_build_object(
    'totals', v_totals, 'top_foods', v_top,
    'experiences_by_month', v_months, 'timeline', v_timeline);
end;
$$;

-- Cópia de todos os dados, para a opção "Exportar meus dados".
create or replace function public.export_all()
returns jsonb
language sql
stable
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'version', 1,
    'exported_at', now(),
    'foods',            coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at, t.id) from public.foods t), '[]'::jsonb),
    'daily_diaries',    coalesce((select jsonb_agg(to_jsonb(t) order by t.date, t.id) from public.daily_diaries t), '[]'::jsonb),
    'meals',            coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at, t.id) from public.meals t), '[]'::jsonb),
    'meal_foods',       coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at, t.id) from public.meal_foods t), '[]'::jsonb),
    'food_experiences', coalesce((select jsonb_agg(to_jsonb(t) order by t.experience_date, t.created_at, t.id) from public.food_experiences t), '[]'::jsonb)
  )
$$;

-- ======================================================================
-- 20261106000300_security.sql
-- ======================================================================
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

-- ======================================================================
-- 20261112000100_reminders.sql
-- ======================================================================
-- =============================================================================
-- Diário Alimentar — lembretes de refeição
--
-- Acrescenta:
--   * meal_schedule       horário (início e fim) de cada refeição, editável no app
--   * meal_skips          "Não fiz": refeição do dia marcada como não realizada
--   * push_subscriptions  aparelhos que aceitaram receber notificações
--   * reminder_log        lembretes já enviados (evita avisar duas vezes)
--   * claim_due_reminders função que a Edge Function "send-reminders" chama a cada
--                         poucos minutos para saber quem avisar agora
--
-- Para quem já rodou as migrações anteriores: rode só este arquivo, uma vez.
-- Em um projeto novo, o supabase/setup.sql já inclui tudo.
--
-- Horários são "relógio de parede" do Brasil (America/Sao_Paulo), como no resto
-- do app. A ceia pode cruzar a meia-noite (23:00 até 01:00): o fim menor que o
-- início significa "até a madrugada do dia seguinte".
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Horários das refeições
-- -----------------------------------------------------------------------------
create table public.meal_schedule (
  meal_type   text primary key,
  start_time  time not null,
  end_time    time not null,
  enabled     boolean not null default true,
  updated_at  timestamptz not null default now(),
  constraint meal_schedule_type_valid check (
    meal_type in ('breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'supper')
  ),
  -- duração de pelo menos 20 minutos (contando a volta pela meia-noite)
  constraint meal_schedule_window check (
    mod(extract(epoch from (end_time - start_time))::int + 86400, 86400) >= 1200
  )
);

create trigger meal_schedule_set_updated_at
  before update on public.meal_schedule
  for each row execute function public.set_updated_at();

insert into public.meal_schedule (meal_type, start_time, end_time) values
  ('breakfast',       '08:00', '09:00'),
  ('morning_snack',   '09:00', '10:00'),
  ('lunch',           '12:00', '13:00'),
  ('afternoon_snack', '16:00', '17:00'),
  ('dinner',          '21:00', '22:00'),
  ('supper',          '23:00', '01:00');

-- -----------------------------------------------------------------------------
-- "Não fiz": refeição do dia que não aconteceu
-- -----------------------------------------------------------------------------
create table public.meal_skips (
  skip_date   date not null,
  meal_type   text not null,
  created_at  timestamptz not null default now(),
  primary key (skip_date, meal_type),
  constraint meal_skips_type_valid check (
    meal_type in ('breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'supper')
  )
);

-- Registrar uma refeição desfaz o "Não fiz" daquele dia e tipo.
create or replace function public.clear_meal_skip()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  delete from public.meal_skips s
   using public.daily_diaries d
   where d.id = new.diary_id
     and s.skip_date = d.date
     and s.meal_type = new.meal_type;
  return new;
end;
$$;

create trigger meals_clear_skip
  after insert on public.meals
  for each row execute function public.clear_meal_skip();

-- -----------------------------------------------------------------------------
-- Notificações: aparelhos inscritos e lembretes já enviados
-- Só as funções abaixo mexem nestas tabelas (nenhuma política para anon).
-- -----------------------------------------------------------------------------
create table public.push_subscriptions (
  endpoint      text primary key,
  p256dh        text not null,
  auth          text not null,
  user_agent    text,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  constraint push_endpoint_valid check (endpoint like 'https://%' and char_length(endpoint) <= 2000),
  constraint push_keys_valid check (
    char_length(p256dh) between 10 and 300 and char_length(auth) between 4 and 300
  )
);

create table public.reminder_log (
  reminder_date  date not null,
  meal_type      text not null,
  kind           text not null,
  sent_at        timestamptz not null default now(),
  primary key (reminder_date, meal_type, kind),
  constraint reminder_log_kind_valid check (kind in ('mid', 'end'))
);

-- -----------------------------------------------------------------------------
-- Segurança
-- -----------------------------------------------------------------------------
alter table public.meal_schedule       enable row level security;
alter table public.meal_skips          enable row level security;
alter table public.push_subscriptions  enable row level security;
alter table public.reminder_log        enable row level security;

create policy "uso_individual_sem_login" on public.meal_schedule
  for all to anon, authenticated using (true) with check (true);
create policy "uso_individual_sem_login" on public.meal_skips
  for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on public.meal_schedule, public.meal_skips to anon, authenticated;
revoke all on public.push_subscriptions, public.reminder_log from anon, authenticated;
grant select, insert, update, delete on public.push_subscriptions, public.reminder_log to service_role;

-- -----------------------------------------------------------------------------
-- Horários: ler, salvar, restaurar
-- -----------------------------------------------------------------------------
create or replace function public.get_meal_schedule()
returns jsonb
language sql
stable
set search_path = public, extensions
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'meal_type', s.meal_type,
      'start_time', to_char(s.start_time, 'HH24:MI'),
      'end_time', to_char(s.end_time, 'HH24:MI'),
      'enabled', s.enabled)
    order by array_position(
      array['breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'supper'], s.meal_type)),
    '[]'::jsonb)
  from public.meal_schedule s
$$;

-- Recebe uma lista [{meal_type, start_time "HH:MM", end_time "HH:MM", enabled}] e
-- grava tudo ou nada. Devolve os horários já atualizados.
create or replace function public.save_meal_schedule(p_items jsonb)
returns jsonb
language plpgsql
set search_path = public, extensions
as $$
declare
  v_item     jsonb;
  v_type     text;
  v_label    text;
  v_start    time;
  v_end      time;
  v_enabled  boolean;
  v_labels   constant jsonb := '{
    "breakfast": "café da manhã", "morning_snack": "lanche da manhã", "lunch": "almoço",
    "afternoon_snack": "lanche da tarde", "dinner": "jantar", "supper": "ceia"}';
  v_hhmm     constant text := '^([01][0-9]|2[0-3]):[0-5][0-9]$';
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Informe os horários das refeições.' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_type  := v_item ->> 'meal_type';
    v_label := v_labels ->> v_type;
    if v_label is null then
      raise exception 'Refeição desconhecida.' using errcode = '22023';
    end if;
    if coalesce(v_item ->> 'start_time', '') !~ v_hhmm or coalesce(v_item ->> 'end_time', '') !~ v_hhmm then
      raise exception 'Informe o início e o fim do % com hora e minutos (por exemplo, 08:30).', v_label
        using errcode = '22023';
    end if;
    v_start   := (v_item ->> 'start_time')::time;
    v_end     := (v_item ->> 'end_time')::time;
    v_enabled := coalesce((v_item ->> 'enabled')::boolean, true);

    if mod(extract(epoch from (v_end - v_start))::int + 86400, 86400) < 1200 then
      raise exception 'O horário do % precisa ter pelo menos 20 minutos entre o início e o fim.', v_label
        using errcode = '22023';
    end if;

    insert into public.meal_schedule (meal_type, start_time, end_time, enabled)
    values (v_type, v_start, v_end, v_enabled)
    on conflict (meal_type) do update
      set start_time = excluded.start_time,
          end_time = excluded.end_time,
          enabled = excluded.enabled;
  end loop;

  return public.get_meal_schedule();
end;
$$;

create or replace function public.reset_meal_schedule()
returns jsonb
language sql
set search_path = public, extensions
as $$
  insert into public.meal_schedule (meal_type, start_time, end_time, enabled)
  values
    ('breakfast',       '08:00', '09:00', true),
    ('morning_snack',   '09:00', '10:00', true),
    ('lunch',           '12:00', '13:00', true),
    ('afternoon_snack', '16:00', '17:00', true),
    ('dinner',          '21:00', '22:00', true),
    ('supper',          '23:00', '01:00', true)
  on conflict (meal_type) do update
    set start_time = excluded.start_time, end_time = excluded.end_time, enabled = excluded.enabled;
  select public.get_meal_schedule()
$$;

-- -----------------------------------------------------------------------------
-- "Não fiz"
-- -----------------------------------------------------------------------------

-- Marca a refeição do dia como não realizada. Devolve false (sem erro) quando a
-- refeição já tem registro: assim o botão "Não fiz" da notificação nunca apaga
-- nem contradiz o que você acabou de anotar.
create or replace function public.mark_meal_skipped(p_date date, p_meal_type text)
returns boolean
language plpgsql
set search_path = public, extensions
as $$
begin
  if p_date is null then
    raise exception 'Escolha uma data.' using errcode = '22023';
  end if;
  if p_meal_type is null or p_meal_type not in
     ('breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'supper') then
    raise exception 'Refeição desconhecida.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.meals m
    join public.daily_diaries d on d.id = m.diary_id
    where d.date = p_date and m.meal_type = p_meal_type
  ) then
    return false;
  end if;

  insert into public.meal_skips (skip_date, meal_type) values (p_date, p_meal_type)
  on conflict do nothing;
  return true;
end;
$$;

create or replace function public.unmark_meal_skipped(p_date date, p_meal_type text)
returns boolean
language plpgsql
set search_path = public, extensions
as $$
declare
  v_count int;
begin
  delete from public.meal_skips where skip_date = p_date and meal_type = p_meal_type;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

-- -----------------------------------------------------------------------------
-- Inscrição de notificações deste aparelho (security definer: a tabela é fechada)
-- -----------------------------------------------------------------------------
create or replace function public.save_push_subscription(
  p_endpoint   text,
  p_p256dh     text,
  p_auth       text,
  p_user_agent text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_endpoint is null or p_endpoint not like 'https://%' or char_length(p_endpoint) > 2000 then
    raise exception 'Este navegador não enviou um endereço de notificação válido.' using errcode = '22023';
  end if;
  if coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'Este navegador não enviou as chaves de notificação.' using errcode = '22023';
  end if;

  insert into public.push_subscriptions (endpoint, p256dh, auth, user_agent)
  values (p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent,
        last_seen_at = now();
  return true;
end;
$$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_count int;
begin
  delete from public.push_subscriptions where endpoint = p_endpoint;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

create or replace function public.has_push_subscription(p_endpoint text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (select 1 from public.push_subscriptions where endpoint = p_endpoint)
$$;

-- Dados de uma inscrição (para o aviso de teste). Só a Edge Function chama.
create or replace function public.get_push_subscription(p_endpoint text)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  select jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)
  from public.push_subscriptions s
  where s.endpoint = p_endpoint
$$;

-- -----------------------------------------------------------------------------
-- Quem avisar agora (chamada só pela Edge Function, com a chave de serviço)
--
-- Regras:
--   * só refeições ativas, dentro do horário, sem registro e sem "Não fiz";
--   * dois momentos por horário: no meio ("mid") e 10 minutos antes do fim ("end");
--   * se os dois já venceram (por exemplo, a função ficou parada), manda só o último;
--   * cada momento é avisado uma única vez (reminder_log); se o envio falhar, a
--     função chama release_reminders e o aviso é tentado de novo;
--   * sem aparelhos inscritos, nada é marcado como enviado.
-- A ceia que cruza a meia-noite pertence ao dia em que ela começa.
-- -----------------------------------------------------------------------------
create or replace function public.claim_due_reminders(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_now    timestamp := p_now at time zone 'America/Sao_Paulo';
  v_subs   jsonb;
  v_notes  jsonb := '[]'::jsonb;
  r        record;
  v_start  timestamp;
  v_len    interval;
  v_end    timestamp;
  v_kind   text;
  v_rows   int;
  v_arts   constant jsonb := '{
    "breakfast": "do café da manhã", "morning_snack": "do lanche da manhã", "lunch": "do almoço",
    "afternoon_snack": "do lanche da tarde", "dinner": "do jantar", "supper": "da ceia"}';
  v_labels constant jsonb := '{
    "breakfast": "Café da manhã", "morning_snack": "Lanche da manhã", "lunch": "Almoço",
    "afternoon_snack": "Lanche da tarde", "dinner": "Jantar", "supper": "Ceia"}';
begin
  select coalesce(jsonb_agg(
           jsonb_build_object('endpoint', endpoint, 'p256dh', p256dh, 'auth', auth)
           order by created_at), '[]'::jsonb)
    into v_subs
    from public.push_subscriptions;

  if jsonb_array_length(v_subs) = 0 then
    return jsonb_build_object('subscriptions', v_subs, 'notifications', v_notes);
  end if;

  delete from public.reminder_log where reminder_date < v_now::date - 7;

  for r in
    select s.meal_type, s.start_time, s.end_time, days.d as day
      from public.meal_schedule s
     cross join lateral (values (v_now::date), (v_now::date - 1)) as days(d)
     where s.enabled
     order by days.d, s.start_time
  loop
    v_start := r.day + r.start_time;
    v_len   := make_interval(secs => mod(extract(epoch from (r.end_time - r.start_time))::int + 86400, 86400));
    v_end   := v_start + v_len;

    continue when v_now < v_start or v_now >= v_end;
    continue when exists (
        select 1 from public.meals m
        join public.daily_diaries d on d.id = m.diary_id
        where d.date = r.day and m.meal_type = r.meal_type)
      or exists (
        select 1 from public.meal_skips k
        where k.skip_date = r.day and k.meal_type = r.meal_type);

    if v_now >= v_end - interval '10 minutes' then
      v_kind := 'end';
    elsif v_now >= v_start + v_len / 2 then
      v_kind := 'mid';
    else
      continue;
    end if;

    -- o momento do meio fica registrado também quando já passamos do fim
    if v_kind = 'end' then
      insert into public.reminder_log (reminder_date, meal_type, kind)
      values (r.day, r.meal_type, 'mid') on conflict do nothing;
    end if;
    insert into public.reminder_log (reminder_date, meal_type, kind)
    values (r.day, r.meal_type, v_kind) on conflict do nothing;
    get diagnostics v_rows = row_count;
    continue when v_rows = 0;

    v_notes := v_notes || jsonb_build_object(
      'date', r.day,
      'meal_type', r.meal_type,
      'kind', v_kind,
      'title', 'Falta registrar: ' || (v_labels ->> r.meal_type),
      'body', case v_kind
        when 'end' then format('O horário %s termina às %s. Toque para anotar ou escolha “Não fiz”.',
                               v_arts ->> r.meal_type, to_char(r.end_time, 'HH24:MI'))
        else 'Toque para anotar o que você comeu ou escolha “Não fiz”.'
      end,
      'url', '/diario/' || r.day || '?refeicao=' || r.meal_type,
      'tag', 'refeicao-' || r.day || '-' || r.meal_type,
      'ttl_seconds', greatest(60, extract(epoch from (v_end - v_now))::int));
  end loop;

  return jsonb_build_object('subscriptions', v_subs, 'notifications', v_notes);
end;
$$;

-- Desfaz o registro de um aviso cujo envio falhou, para ele ser tentado de novo.
-- p_items: [{date, meal_type, kind}]
create or replace function public.release_reminders(p_items jsonb)
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_count int;
begin
  delete from public.reminder_log l
   using jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as x("date" date, meal_type text, kind text)
   where l.reminder_date = x."date" and l.meal_type = x.meal_type and l.kind = x.kind;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- Funções existentes que passam a incluir os novos dados
-- -----------------------------------------------------------------------------

-- get_day: acrescenta "skipped_meals" (tipos de refeição marcados como "Não fiz").
create or replace function public.get_day(p_date date)
returns jsonb
language sql
stable
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'date', p_date,
    'diary', (
      select jsonb_build_object(
        'id', d.id, 'date', d.date,
        'general_observations', d.general_observations, 'updated_at', d.updated_at)
      from public.daily_diaries d where d.date = p_date
    ),
    'meals', coalesce((
      select jsonb_agg(
        to_jsonb(m) || jsonb_build_object('foods', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', mf.id, 'food_id', mf.food_id, 'food_name', f.name,
              'quantity', mf.quantity, 'consumed_time', mf.consumed_time,
              'observations', mf.observations)
            order by mf.consumed_time nulls last, mf.created_at, mf.id)
          from public.meal_foods mf
          join public.foods f on f.id = mf.food_id
          where mf.meal_id = m.id
        ), '[]'::jsonb))
        order by m.meal_time nulls last, m.created_at, m.id)
      from public.meals m
      join public.daily_diaries d on d.id = m.diary_id
      where d.date = p_date
    ), '[]'::jsonb),
    'experiences', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', e.id, 'food_id', e.food_id, 'food_name', f.name,
          'experience_type', e.experience_type, 'experience_time', e.experience_time,
          'feeling_tags', e.feeling_tags)
        order by e.experience_time nulls last, e.created_at, e.id)
      from public.food_experiences e
      join public.foods f on f.id = e.food_id
      where e.experience_date = p_date
    ), '[]'::jsonb),
    'skipped_meals', coalesce((
      select jsonb_agg(k.meal_type order by k.meal_type)
      from public.meal_skips k
      where k.skip_date = p_date
    ), '[]'::jsonb)
  )
$$;

-- export_all: inclui horários e "Não fiz".
create or replace function public.export_all()
returns jsonb
language sql
stable
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'version', 1,
    'exported_at', now(),
    'foods',            coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at, t.id) from public.foods t), '[]'::jsonb),
    'daily_diaries',    coalesce((select jsonb_agg(to_jsonb(t) order by t.date, t.id) from public.daily_diaries t), '[]'::jsonb),
    'meals',            coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at, t.id) from public.meals t), '[]'::jsonb),
    'meal_foods',       coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at, t.id) from public.meal_foods t), '[]'::jsonb),
    'food_experiences', coalesce((select jsonb_agg(to_jsonb(t) order by t.experience_date, t.created_at, t.id) from public.food_experiences t), '[]'::jsonb),
    'meal_skips',       coalesce((select jsonb_agg(to_jsonb(t) order by t.skip_date, t.meal_type) from public.meal_skips t), '[]'::jsonb),
    'meal_schedule',    public.get_meal_schedule()
  )
$$;

-- -----------------------------------------------------------------------------
-- Permissões de execução
-- -----------------------------------------------------------------------------
revoke all on function public.claim_due_reminders(timestamptz) from public, anon, authenticated;
revoke all on function public.release_reminders(jsonb) from public, anon, authenticated;
revoke all on function public.get_push_subscription(text) from public, anon, authenticated;
grant execute on function public.claim_due_reminders(timestamptz) to service_role;
grant execute on function public.release_reminders(jsonb) to service_role;
grant execute on function public.get_push_subscription(text) to service_role;

revoke all on function public.save_push_subscription(text, text, text, text) from public;
revoke all on function public.delete_push_subscription(text) from public;
revoke all on function public.has_push_subscription(text) from public;
grant execute on function
  public.get_meal_schedule(),
  public.save_meal_schedule(jsonb),
  public.reset_meal_schedule(),
  public.mark_meal_skipped(date, text),
  public.unmark_meal_skipped(date, text),
  public.save_push_subscription(text, text, text, text),
  public.delete_push_subscription(text),
  public.has_push_subscription(text),
  public.get_day(date),
  public.export_all()
  to anon, authenticated;
grant execute on function public.delete_push_subscription(text) to service_role;
