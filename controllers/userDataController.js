const supabase = require('../config/supabase');

const getUserData = async (req, res) => {
  console.log('[getUserData] user_id:', req.user.id);

  const { data, error } = await supabase
    .from('user_data')
    .select('cart, wishlist')
    .eq('user_id', req.user.id)
    .single();

  console.log('[getUserData] data:', JSON.stringify(data));
  console.log('[getUserData] error:', JSON.stringify(error));

  if (error && error.code !== 'PGRST116') {
    return res.status(500).json({ message: error.message, code: error.code });
  }

  res.json({ cart: data?.cart ?? [], wishlist: data?.wishlist ?? [] });
};

const saveUserData = async (req, res) => {
  const { cart, wishlist } = req.body;
  const userId = req.user.id;
  const cartData = Array.isArray(cart) ? cart : [];
  const wishlistData = Array.isArray(wishlist) ? wishlist : [];

  // Verifica se já existe registro para esse usuário
  const { data: existing } = await supabase
    .from('user_data')
    .select('user_id')
    .eq('user_id', userId)
    .single();

  let error;
  if (existing) {
    ({ error } = await supabase
      .from('user_data')
      .update({ cart: cartData, wishlist: wishlistData })
      .eq('user_id', userId));
  } else {
    ({ error } = await supabase
      .from('user_data')
      .insert({ user_id: userId, cart: cartData, wishlist: wishlistData }));
  }

  if (error) {
    console.error('saveUserData error:', JSON.stringify(error));
    return res.status(500).json({ message: error.message, code: error.code });
  }

  res.json({ ok: true });
};

module.exports = { getUserData, saveUserData };
