-- Só para o teste local (Postgres comum). No Supabase estes papéis e o schema
-- "extensions" já existem, então este arquivo NÃO deve ser rodado lá.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end
$$;

create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated;
