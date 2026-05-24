-- ============================================================================
--  Villa Vip Country Store — tabela de dados do usuário (cart + wishlist)
--  Rode este script uma vez no SQL Editor do Supabase.
--
--  Substitui o uso de localStorage puro: o carrinho e a lista de desejos
--  persistem por usuário, permitindo continuar a compra de outro dispositivo.
--  Lida pelo backend em controllers/userDataController.js
--  via GET/PUT /api/user-data.
-- ============================================================================

create table if not exists public.user_data (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  cart        jsonb not null default '[]'::jsonb,
  wishlist    jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);

-- Mantém updated_at fresco. Reusa a função criada em db/products.sql.
drop trigger if exists user_data_set_updated_at on public.user_data;
create trigger user_data_set_updated_at
  before update on public.user_data
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
--  Row Level Security: cada usuário só vê / escreve / apaga os próprios dados.
--  Backend usa service_role (ignora RLS) — RLS é a segunda camada de defesa
--  caso alguma rota futura use a chave anon.
-- ----------------------------------------------------------------------------
alter table public.user_data enable row level security;

drop policy if exists "user_data: dono lê" on public.user_data;
create policy "user_data: dono lê"
  on public.user_data for select
  using (auth.uid() = user_id);

drop policy if exists "user_data: dono cria" on public.user_data;
create policy "user_data: dono cria"
  on public.user_data for insert
  with check (auth.uid() = user_id);

drop policy if exists "user_data: dono atualiza" on public.user_data;
create policy "user_data: dono atualiza"
  on public.user_data for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "user_data: dono apaga" on public.user_data;
create policy "user_data: dono apaga"
  on public.user_data for delete
  using (auth.uid() = user_id);
