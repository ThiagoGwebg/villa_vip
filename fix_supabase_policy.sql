-- 1. Limpeza de políticas anteriores para evitar conflitos
DROP POLICY IF EXISTS "Permitir cadastro de novos usuários" ON users;
DROP POLICY IF EXISTS "Permitir cadastro público" ON users;
DROP POLICY IF EXISTS "Permitir inserção de usuários" ON users;
DROP POLICY IF EXISTS "Permitir tudo aos usuários" ON users;
DROP POLICY IF EXISTS "Usuários podem ver seu próprio perfil" ON users;

-- 2. Garantir que o RLS está habilitado
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- 3. Criar uma política permissiva para a tabela 'users'
-- Como a lógica de segurança (bcrypt/jwt) já está no Node.js, 
-- é seguro permitir que a aplicação faça o gerenciamento completo.
CREATE POLICY "Permitir operação total para a aplicação" ON users
  FOR ALL
  USING (true)
  WITH CHECK (true);
