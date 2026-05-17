const supabase = require('../config/supabase');
const { isAdminEmail } = require('../services/adminService');

const register = async (req, res) => {
  const { nome, email, senha } = req.body;

  try {
    // Usando o Auth Nativo do Supabase (que dispara o e-mail de confirmação)
    const { data, error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: {
        data: {
          nome: nome
        }
      }
    });

    if (error) {
      console.error("Supabase Error:", error);
      return res.status(400).json({ message: error.message });
    }
    
    res.status(201).json({ message: 'Usuário criado com sucesso! Verifique seu e-mail.' });
  } catch (error) {
    console.error("Server Error:", error);
    res.status(500).json({ message: 'Erro no servidor' });
  }
};

const login = async (req, res) => {
  const { email, senha } = req.body;

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    });

    if (error) {
      // Traduzindo mensagens comuns para pt-BR no front ou mostrando direto
      let msg = error.message;
      if (msg === 'Email not confirmed') msg = 'Por favor, confirme seu e-mail antes de entrar.';
      if (msg === 'Invalid login credentials') msg = 'E-mail ou senha incorretos.';
      
      return res.status(401).json({ message: msg });
    }

    const { session, user } = data;
    const isAdmin = await isAdminEmail(user.email);

    // Retorna o formato exato que o frontend já espera
    res.json({ 
      token: session.access_token, 
      user: { 
        id: user.id, 
        nome: user.user_metadata?.nome || user.email.split('@')[0], 
        email: user.email,
        isAdmin: isAdmin
      } 
    });
  } catch (error) {
    console.error("Server Error:", error);
    res.status(500).json({ message: 'Erro no servidor' });
  }
};

/**
 * PUT /api/auth/profile — edita o nome e (opcionalmente) a senha.
 *
 * Usa a Admin API (chave service_role) com o `id` que veio da sessão
 * validada no authMiddleware — nunca de um id enviado pelo cliente. Não
 * exige relogar: devolvemos o `user` atualizado para o front regravar o
 * localStorage.
 */
const updateProfile = async (req, res) => {
  const { nome, senha } = req.body;

  const novoNome = typeof nome === 'string' ? nome.trim() : '';
  if (!novoNome) {
    return res.status(400).json({ message: 'O nome não pode ficar vazio.' });
  }
  if (senha != null && String(senha).length > 0 && String(senha).length < 6) {
    return res
      .status(400)
      .json({ message: 'A nova senha precisa ter ao menos 6 caracteres.' });
  }

  try {
    const attrs = { user_metadata: { ...req.user.user_metadata, nome: novoNome } };
    if (senha) attrs.password = String(senha);

    const { data, error } = await supabase.auth.admin.updateUserById(
      req.user.id,
      attrs
    );

    if (error) {
      console.error('Supabase admin.updateUserById error:', error);
      return res.status(400).json({ message: error.message });
    }

    const user = data.user;
    const isAdmin = await isAdminEmail(user.email);

    res.json({
      message: 'Perfil atualizado com sucesso!',
      user: {
        id: user.id,
        nome: user.user_metadata?.nome || user.email.split('@')[0],
        email: user.email,
        isAdmin,
      },
    });
  } catch (error) {
    console.error('Server Error:', error);
    res.status(500).json({ message: 'Erro no servidor' });
  }
};

module.exports = { register, login, updateProfile };
