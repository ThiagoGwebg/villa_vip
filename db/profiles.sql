-- ============================================================================
--  Villa Vip Country Store — tabela de perfis (espelho de auth.users)
--  Rode este script uma vez no SQL Editor do Supabase.
--
--  Substitui o legado setup_users.sql (que criava uma tabela `users`
--  desalinhada do código). Esta é a tabela `profiles` que o backend
--  consulta em services/adminService.js#isAdminEmail() para decidir
--  se o e-mail logado tem perfil de admin.
--
--  Cada linha aqui é um espelho de auth.users — criada automaticamente
--  pelo trigger handle_new_user() no signUp, depois mantida em sincronia.
-- ============================================================================

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null unique,
  nome        text,
  admin       boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Migração defensiva: se a tabela já existia em algum ambiente (versão antiga
-- com só email/admin), garante as colunas novas sem perder dados.
alter table public.profiles add column if not exists id         uuid;
alter table public.profiles add column if not exists nome       text;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

-- Backfill: liga linhas órfãs em profiles aos respectivos auth.users por e-mail.
-- Idempotente — só preenche onde id ainda é nulo.
update public.profiles p
   set id = u.id
  from auth.users u
 where p.id is null
   and lower(p.email) = lower(u.email);

create index if not exists profiles_email_lower_idx on public.profiles (lower(email));

-- Mantém updated_at sempre fresco. Reusa a função criada em db/products.sql.
drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
--  Trigger handle_new_user: ao criar usuário em auth.users, espelha em
--  profiles automaticamente. Elimina o passo manual do README anterior.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, nome)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1))
  )
  on conflict (id) do update
     set email = excluded.email,
         nome  = coalesce(excluded.nome, public.profiles.nome);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
--  Row Level Security
--
--  Sem RLS, qualquer usuário autenticado conseguia listar profiles inteiro
--  e descobrir quem é admin. A policy abaixo fecha esse vazamento:
--  cada usuário só lê o próprio perfil. Escrita acontece sempre via
--  service_role (backend), que ignora RLS.
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "profiles: dono lê" on public.profiles;
create policy "profiles: dono lê"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);
