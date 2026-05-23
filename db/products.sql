-- ============================================================================
--  Villa Vip Country Store — tabela de produtos do catálogo
--  Rode este script uma vez no SQL Editor do Supabase.
--
--  Substitui o antigo data/products.json (que não persiste em serverless).
--  O CRUD admin (POST/PUT/DELETE /api/admin/products) grava aqui.
--  A vitrine pública (GET /api/products) lê daqui.
-- ============================================================================

create table if not exists public.products (
  id          text primary key,
  nome        text not null,
  categoria   text not null,
  marca       text not null,
  preco       numeric(10,2) not null,
  preco_de    numeric(10,2),
  descricao   text not null default '',
  tamanhos    text[] not null default '{}',
  tag         text,
  destaque    boolean not null default false,
  imagem      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists products_categoria_idx on public.products (categoria);
create index if not exists products_marca_idx     on public.products (marca);
create index if not exists products_destaque_idx  on public.products (destaque) where destaque = true;

-- Mantém updated_at sempre fresco em qualquer UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- RLS: leitura pública (vitrine), escrita só pelo backend com service_role
-- (que ignora RLS). Defesa em profundidade.
alter table public.products enable row level security;

drop policy if exists "products: leitura pública" on public.products;
create policy "products: leitura pública"
  on public.products for select
  to anon, authenticated
  using (true);

-- ============================================================================
--  Storage: bucket para imagens de produto
--  Rode também no SQL Editor (ou crie o bucket pela UI: Storage > New bucket).
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "product-images: leitura pública" on storage.objects;
create policy "product-images: leitura pública"
  on storage.objects for select
  using (bucket_id = 'product-images');
