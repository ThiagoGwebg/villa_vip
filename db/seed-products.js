/**
 * Seed inicial da tabela `products` a partir de data/products.json.
 *
 * Uso (uma vez, após rodar db/products.sql no Supabase):
 *   node db/seed-products.js
 *
 * Requer SUPABASE_URL e SUPABASE_KEY (service_role) no .env.
 * Idempotente: usa upsert pelo `id`, então rodar várias vezes não duplica.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ SUPABASE_URL e SUPABASE_KEY são obrigatórios no .env.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

const file = path.join(__dirname, '..', 'data', 'products.json');
const produtos = JSON.parse(fs.readFileSync(file, 'utf-8'));

const rows = produtos.map((p) => ({
  id: String(p.id).trim(),
  nome: String(p.nome).trim(),
  categoria: String(p.categoria).trim(),
  marca: String(p.marca).trim(),
  preco: Number(p.preco),
  preco_de: p.precoDe == null ? null : Number(p.precoDe),
  descricao: String(p.descricao || '').trim(),
  tamanhos: Array.isArray(p.tamanhos) ? p.tamanhos.map(String) : [],
  tag: p.tag || null,
  destaque: Boolean(p.destaque),
  imagem: p.imagem ? String(p.imagem).trim() : null,
}));

(async () => {
  console.log(`📦 Importando ${rows.length} produtos para o Supabase…`);

  const { data, error } = await supabase
    .from('products')
    .upsert(rows, { onConflict: 'id' })
    .select('id');

  if (error) {
    console.error('❌ Falha no seed:', error);
    process.exit(1);
  }

  console.log(`✅ ${data.length} produtos sincronizados.`);
})();
