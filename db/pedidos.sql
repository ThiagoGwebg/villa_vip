-- ============================================================================
--  Villa Vip Country Store — tabela de pedidos ("Meus Pedidos")
--  Rode este script uma vez no SQL Editor do Supabase.
--
--  Os pedidos são gravados pelo backend quando o usuário finaliza pelo
--  WhatsApp (estando logado). Histórico expira em 30 dias para não
--  sobrecarregar o banco — limpeza feita por:
--    1) pg_cron (preferencial, abaixo) e
--    2) faxina preguiçosa no orderService.js (fallback, roda no app).
-- ============================================================================

create table if not exists public.pedidos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  itens       jsonb not null,                       -- [{id,nome,marca,size,preco,qty}]
  total       numeric(10,2) not null default 0,
  status      text not null default 'enviado',      -- enviado | em_andamento | concluido | cancelado
  created_at  timestamptz not null default now()
);

create index if not exists pedidos_user_created_idx
  on public.pedidos (user_id, created_at desc);

-- Row Level Security: cada usuário só enxerga / cria os próprios pedidos.
-- (O backend valida a sessão no authMiddleware e ainda filtra por user_id;
--  a RLS é a segunda camada de defesa, caso a chave usada seja a anon.)
alter table public.pedidos enable row level security;

drop policy if exists "pedidos: dono lê" on public.pedidos;
create policy "pedidos: dono lê"
  on public.pedidos for select
  using (auth.uid() = user_id);

drop policy if exists "pedidos: dono cria" on public.pedidos;
create policy "pedidos: dono cria"
  on public.pedidos for insert
  with check (auth.uid() = user_id);

drop policy if exists "pedidos: dono apaga" on public.pedidos;
create policy "pedidos: dono apaga"
  on public.pedidos for delete
  using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
--  Expiração automática: apaga pedidos com mais de 30 dias.
--  Requer a extensão pg_cron (Database > Extensions no painel do Supabase).
--  Se pg_cron não estiver disponível, o fallback no orderService.js cobre.
-- ----------------------------------------------------------------------------
create extension if not exists pg_cron;

select cron.schedule(
  'purge-pedidos-30d',
  '0 4 * * *',                                       -- todo dia às 04:00 UTC
  $$ delete from public.pedidos
       where created_at < now() - interval '30 days' $$
);
