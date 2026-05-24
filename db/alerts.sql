-- ============================================================================
--  Villa Vip Country Store — Alertas operacionais
--  Rode este script no SQL Editor do Supabase (depois das migrations
--  base: profiles, products, pedidos, stores).
--
--  Alimentado por jobs pg_cron (quando disponível) + faxina best-effort
--  no backend. Consumido pelo sino do topbar do admin.
-- ============================================================================

create table if not exists public.alerts (
  id           bigserial primary key,
  kind         text not null,                  -- 'estoque.baixo','pedido.parado',...
  store_id     uuid references public.stores(id) on delete cascade,
  payload      jsonb not null default '{}'::jsonb,
  lido_em      timestamptz,
  -- "chave de unicidade" para evitar duplicatas: combina kind + alvo
  dedupe_key   text not null,
  created_at   timestamptz not null default now(),
  unique (dedupe_key)
);

create index if not exists alerts_unread_idx
  on public.alerts (created_at desc)
  where lido_em is null;
create index if not exists alerts_store_idx
  on public.alerts (store_id, created_at desc);

alter table public.alerts enable row level security;

drop policy if exists "alerts: admin lê" on public.alerts;
create policy "alerts: admin lê"
  on public.alerts for select
  using (
    exists (select 1 from public.profiles p
             where p.id = auth.uid() and p.admin = true)
  );

drop policy if exists "alerts: admin marca lido" on public.alerts;
create policy "alerts: admin marca lido"
  on public.alerts for update
  using (
    exists (select 1 from public.profiles p
             where p.id = auth.uid() and p.admin = true)
  )
  with check (
    exists (select 1 from public.profiles p
             where p.id = auth.uid() and p.admin = true)
  );

-- ----------------------------------------------------------------------------
--  Função geradora: rastreia estoque <= mínimo e pedidos parados em "enviado"
--  há > 3 dias. Idempotente via dedupe_key + on conflict do nothing.
-- ----------------------------------------------------------------------------
create or replace function public.gerar_alertas()
returns void
language plpgsql
as $$
begin
  -- Estoque baixo: 1 alerta por (loja, produto) enquanto não for marcado lido.
  insert into public.alerts (kind, store_id, payload, dedupe_key)
  select
    'estoque.baixo',
    e.store_id,
    jsonb_build_object(
      'product_id', e.product_id,
      'quantidade', e.quantidade,
      'minimo', e.minimo,
      'nome', p.nome
    ),
    'estoque.baixo:' || e.store_id::text || ':' || e.product_id
  from public.estoque e
  join public.products p on p.id = e.product_id
  where e.quantidade <= e.minimo
  on conflict (dedupe_key) do nothing;

  -- Pedido parado em "enviado" há > 3 dias.
  insert into public.alerts (kind, payload, dedupe_key)
  select
    'pedido.parado',
    jsonb_build_object(
      'pedido_id', id,
      'criado_em', created_at,
      'total', total,
      'cliente', coalesce(user_nome, user_email)
    ),
    'pedido.parado:' || id::text
  from public.pedidos
  where status = 'enviado'
    and created_at < now() - interval '3 days'
  on conflict (dedupe_key) do nothing;
end;
$$;

-- ----------------------------------------------------------------------------
--  pg_cron: roda a geração a cada 6h. Faxina automática a cada dia.
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'gerar-alertas-6h',
      '0 */6 * * *',
      $cron$ select public.gerar_alertas() $cron$
    );
    -- Apaga alertas lidos há > 30 dias e não-lidos resolvidos (>90 dias).
    perform cron.schedule(
      'purge-alerts',
      '30 4 * * *',
      $cron$ delete from public.alerts
              where (lido_em is not null and lido_em < now() - interval '30 days')
                 or (lido_em is null and created_at < now() - interval '90 days') $cron$
    );
  end if;
end $$;
