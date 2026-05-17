const supabase = require('../config/supabase');

const adminEmails = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

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
    const isAdmin = adminEmails.includes(user.email.toLowerCase());

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

module.exports = { register, login };
