-- =============================================================================
-- Agendador dos lembretes (rode UMA vez no SQL Editor do Supabase)
--
-- Faça isto DEPOIS de publicar a Edge Function "send-reminders" (veja o README,
-- seção "Lembretes de refeição"). A cada 5 minutos o banco chama a função, e ela
-- avisa quem tem refeição sem registro dentro do horário.
--
-- ANTES DE RODAR, troque no texto abaixo:
--   SEU-PROJETO         pelo código do seu projeto (https://SEU-PROJETO.supabase.co)
--   TROQUE-ESTA-SENHA   por uma senha qualquer e longa (a MESMA do segredo
--                       CRON_SECRET da função)
-- Este arquivo NÃO faz parte do setup.sql, porque tem a sua senha.
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'diario-lembretes',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://SEU-PROJETO.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'TROQUE-ESTA-SENHA'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);

-- Para conferir (depois de uns 5 minutos):
--   select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
--   select status_code, content, created from net._http_response order by created desc limit 5;
--   (status_code 200 = função respondeu bem; 401 = senha diferente do CRON_SECRET;
--    401 com "Invalid JWT" = desligue "Verify JWT" na função; 404 = função não publicada)
--
-- Para parar os lembretes:
--   select cron.unschedule('diario-lembretes');
