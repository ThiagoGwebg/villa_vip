-- ============================================================================
--  Villa Vip Country Store — Loja física, estoque e vendas presenciais
--  Rode este script no SQL Editor do Supabase (depois de products.sql,
--  pedidos.sql e profiles.sql).
--
--  Modela MULTI-LOJA desde o começo (mesmo que hoje só exista a Villa Vip
--  Mogi Mirim). Custo zero adicional e evita migration dolorosa quando
--  uma 2ª loja abrir. Toda query carrega store_id.
-- ============================================================================

-- ----------------------------------------------------------------------------
--  1) stores — cadastro de lojas físicas
-- ----------------------------------------------------------------------------
create table if not exists public.stores (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  nome            text not null,
  endereco_linha1 text not null,
  cidade          text not null,
  uf              char(2) not null,
  cep             text,
  telefone        text,
  whatsapp        text,                              -- E.164 sem '+': '5519995497415'
  email           text,
  lat             numeric(10,7),
  lng             numeric(10,7),
  maps_url        text,
  -- horario: {"seg":[["08:00","18:00"]], "ter":[["08:00","18:00"]], ...}
  -- Domingos/fechado: array vazio. Múltiplas faixas para fechar pra almoço.
  horario         jsonb not null default '{}'::jsonb,
  foto_fachada    text,                              -- URL Supabase Storage
  ativo           boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists stores_set_updated_at on public.stores;
create trigger stores_set_updated_at
  before update on public.stores
  for each row execute function public.set_updated_at();

alter table public.stores enable row level security;

-- Leitura pública: a vitrine pode mostrar endereço/horário sem login.
drop policy if exists "stores: leitura pública" on public.stores;
create policy "stores: leitura pública"
  on public.stores for select
  to anon, authenticated
  using (true);

-- Escrita só pelo admin (escrita via service_role do backend já passa).
drop policy if exists "stores: admin escreve" on public.stores;
create policy "stores: admin escreve"
  on public.stores for all
  using (
    exists (select 1 from public.profiles p
             where p.id = auth.uid() and p.admin = true)
  )
  with check (
    exists (select 1 from public.profiles p
             where p.id = auth.uid() and p.admin = true)
  );

-- ----------------------------------------------------------------------------
--  2) estoque — quantidades por (produto, loja)
--     PK composta evita pivot table extra. Coluna `minimo` dispara alerta
--     quando quantidade cai abaixo. Sem coluna `estoque` em `products` para
--     não refatorar a tabela existente.
-- ----------------------------------------------------------------------------
create table if not exists public.estoque (
  product_id    text not null references public.products(id) on delete cascade,
  store_id      uuid not null references public.stores(id)   on delete cascade,
  quantidade    integer not null default 0 check (quantidade >= 0),
  minimo        integer not null default 0 check (minimo >= 0),
  atualizado_em timestamptz not null default now(),
  primary key (product_id, store_id)
);

-- Índice parcial para "ruptura": só linhas em alerta entram no índice.
create index if not exists estoque_baixo_idx
  on public.estoque (store_id, quantidade)
  where quantidade <= minimo;

alter table public.estoque enable row level security;

drop policy if exists "estoque: admin lê" on public.estoque;
create policy "estoque: admin lê"
  on public.estoque for select
  using (
    exists (select 1 from public.profiles p
             where p.id = auth.uid() and p.admin = true)
  );

drop policy if exists "estoque: admin escreve" on public.estoque;
create policy "estoque: admin escreve"
  on public.estoque for all
  using (
    exists (select 1 from public.profiles p
             where p.id = auth.uid() and p.admin = true)
  )
  with check (
    exists (select 1 from public.profiles p
             where p.id = auth.uid() and p.admin = true)
  );

-- ----------------------------------------------------------------------------
--  3) vendas_presenciais — vendas no balcão (lançadas no caixa físico)
-- ----------------------------------------------------------------------------
create table if not exists public.vendas_presenciais (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references public.stores(id) on delete restrict,
  -- itens: [{product_id, nome, size, qty, preco_unit}]
  itens            jsonb not null,
  subtotal         numeric(10,2) not null,
  desconto         numeric(10,2) not null default 0,
  total            numeric(10,2) not null,
  pagamento        text not null
                   check (pagamento in ('dinheiro','pix','credito','debito','crediario','outro')),
  vendedor_id      uuid references auth.users(id),
  vendedor_nome    text,                              -- denormalizado
  cliente_nome     text,                              -- opcional
  cliente_telefone text,                              -- opcional
  observacao       text,
  created_at       timestamptz not null default now()
);

create index if not exists vendas_pres_store_data_idx
  on public.vendas_presenciais (store_id, created_at desc);
create index if not exists vendas_pres_pagamento_idx
  on public.vendas_presenciais (store_id, pagamento, created_at desc);

alter table public.vendas_presenciais enable row level security;

drop policy if exists "vendas_pres: admin lê" on public.vendas_presenciais;
create policy "vendas_pres: admin lê"
  on public.vendas_presenciais for select
  using (
    exists (select 1 from public.profiles p
             where p.id = auth.uid() and p.admin = true)
  );

drop policy if exists "vendas_pres: admin insere" on public.vendas_presenciais;
create policy "vendas_pres: admin insere"
  on public.vendas_presenciais for insert
  with check (
    exists (select 1 from public.profiles p
             where p.id = auth.uid() and p.admin = true)
  );

drop policy if exists "vendas_pres: admin atualiza" on public.vendas_presenciais;
create policy "vendas_pres: admin atualiza"
  on public.vendas_presenciais for update
  using (
    exists (select 1 from public.profiles p
             where p.id = auth.uid() and p.admin = true)
  );

-- ----------------------------------------------------------------------------
--  4) Trigger aplicar_baixa_estoque — toda venda presencial diminui estoque
--     atomicamente, na mesma transação. Idempotente: usa greatest(0, ...)
--     para nunca deixar negativo, e só toca em linhas que existem (caso o
--     produto não tenha estoque cadastrado naquela loja, é ignorado e
--     a venda passa — pode ser ajustado depois para exigir cadastro).
-- ----------------------------------------------------------------------------
create or replace function public.aplicar_baixa_estoque()
returns trigger
language plpgsql
as $$
declare item jsonb;
begin
  for item in select * from jsonb_array_elements(new.itens) loop
    update public.estoque
       set quantidade = greatest(0, quantidade - coalesce((item->>'qty')::int, 0)),
           atualizado_em = now()
     where product_id = item->>'product_id'
       and store_id   = new.store_id;
  end loop;
  return new;
end;
$$;

drop trigger if exists venda_baixa_estoque on public.vendas_presenciais;
create trigger venda_baixa_estoque
  after insert on public.vendas_presenciais
  for each row execute function public.aplicar_baixa_estoque();

-- ----------------------------------------------------------------------------
--  5) Seed: a loja real Villa Vip Mogi Mirim (idempotente)
-- ----------------------------------------------------------------------------
insert into public.stores (
  slug, nome, endereco_linha1, cidade, uf, cep,
  telefone, whatsapp, lat, lng, maps_url, horario
) values (
  'mogi-mirim',
  'Villa Vip Country Store',
  'R. Santa Cruz, 810 — Jardim Santa Cruz',
  'Mogi Mirim', 'SP', '13800-440',
  '(19) 3549-7980', '5519995497415',
  -22.4358495, -46.9734401,
  'https://www.google.com/maps/search/?api=1&query=-22.4358495,-46.9734401',
  '{"seg":[["08:00","18:00"]],"ter":[["08:00","18:00"]],"qua":[["08:00","18:00"]],"qui":[["08:00","18:00"]],"sex":[["08:00","18:00"]],"sab":[["08:00","15:00"]],"dom":[]}'::jsonb
) on conflict (slug) do nothing;

-- ----------------------------------------------------------------------------
--  6) Storage: bucket para foto da fachada (público — mesma estratégia do
--     bucket product-images).
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('store-images', 'store-images', true)
on conflict (id) do nothing;

drop policy if exists "store-images: leitura pública" on storage.objects;
create policy "store-images: leitura pública"
  on storage.objects for select
  using (bucket_id = 'store-images');
