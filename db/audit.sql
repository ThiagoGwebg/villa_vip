-- ============================================================================
--  Villa Vip Country Store — Audit Log
--  Rode este script no SQL Editor do Supabase (depois de profiles.sql).
--
--  Captura cada ação relevante feita por um admin: o quê, sobre quem,
--  quem fez, quando e diff (estado anterior vs. novo).
--  Alimentado pelo `middlewares/auditMiddleware.js` em chamadas POST/PUT/
--  PATCH/DELETE das rotas /api/admin/*.
-- ============================================================================

create table if not exists public.audit_log (
  id           bigserial primary key,
  actor_id     uuid references auth.users(id),
  actor_email  text,
  action       text not null,                        -- 'product.create','order.status_change',...
  target_type  text not null,                        -- 'product','order','venda_presencial',...
  target_id    text,
  diff         jsonb,                                -- { before: {...}, after: {...} }
  ip           inet,
  user_agent   text,
  created_at   timestamptz not null default now()
);

create index if not exists audit_actor_idx
  on public.audit_log (actor_id, created_at desc);
create index if not exists audit_target_idx
  on public.audit_log (target_type, target_id, created_at desc);
create index if not exists audit_action_idx
  on public.audit_log (action, created_at desc);

alter table public.audit_log enable row level security;

-- Só admin vê o log. Escrita só via service_role (backend).
drop policy if exists "audit_log: admin lê" on public.audit_log;
create policy "audit_log: admin lê"
  on public.audit_log for select
  using (
    exists (select 1 from public.profiles p
             where p.id = auth.uid() and p.admin = true)
  );

-- Retenção: 180 dias (LGPD-friendly). Roda diariamente via pg_cron quando
-- disponível; caso contrário, o backend pode rodar a faxina sob demanda.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'purge-audit-180d',
      '15 4 * * *',
      $cron$ delete from public.audit_log
              where created_at < now() - interval '180 days' $cron$
    );
  end if;
end $$;
