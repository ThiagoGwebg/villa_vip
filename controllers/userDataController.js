const supabase = require('../config/supabase');

const getUserData = async (req, res) => {
  const { data, error } = await supabase
    .from('user_data')
    .select('cart, wishlist')
    .eq('user_id', req.user.id)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('getUserData error:', error);
    return res.status(500).json({ message: 'Erro ao buscar dados do usuário' });
  }

  res.json({ cart: data?.cart ?? [], wishlist: data?.wishlist ?? [] });
};

const saveUserData = async (req, res) => {
  const { cart, wishlist } = req.body;

  const { error } = await supabase
    .from('user_data')
    .upsert(
      {
        user_id: req.user.id,
        cart: Array.isArray(cart) ? cart : [],
        wishlist: Array.isArray(wishlist) ? wishlist : [],
      },
      { onConflict: 'user_id' }
    );

  if (error) {
    console.error('saveUserData error:', error);
    return res.status(500).json({ message: error.message, code: error.code });
  }

  res.json({ ok: true });
};

module.exports = { getUserData, saveUserData };
