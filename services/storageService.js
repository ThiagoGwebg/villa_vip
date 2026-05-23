const supabase = require('../config/supabase');

/**
 * Upload de imagem de produto para o Supabase Storage (bucket `product-images`).
 * Substitui o multer.diskStorage do servidor original — o disco é read-only em
 * ambientes serverless (Vercel). Devolve a URL pública.
 */

const BUCKET = process.env.PRODUCT_IMAGES_BUCKET || 'product-images';

const EXT_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function pickExt(mimetype, originalname) {
  if (EXT_BY_MIME[mimetype]) return EXT_BY_MIME[mimetype];
  const m = /\.([a-z0-9]+)$/i.exec(originalname || '');
  return m ? m[1].toLowerCase() : 'jpg';
}

async function uploadProductImage({ buffer, mimetype, originalname }) {
  const ext = pickExt(mimetype, originalname);
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filename, buffer, {
      contentType: mimetype,
      cacheControl: '31536000',
      upsert: false,
    });

  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename);
  return data.publicUrl;
}

module.exports = { uploadProductImage, BUCKET };
