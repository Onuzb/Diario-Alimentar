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
