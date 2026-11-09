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
