-- Tabela de usuários para o sistema de autenticação
-- Execute este comando no SQL Editor do seu projeto Supabase

CREATE TABLE IF NOT EXISTS users (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  senha_hash TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Como o backend é quem gerencia o acesso, precisamos garantir que ele não seja bloqueado.
-- Desabilitamos o RLS para que o backend funcione independente da chave (anon ou service_role)
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- Dropa qualquer política restritiva que tenha sido criada antes
DROP POLICY IF EXISTS "Usuários podem ver seu próprio perfil" ON users;
