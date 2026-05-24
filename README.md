# Catálogo Web Dinâmico — Villa Vip Country Store

Vitrine digital **leve, rápida e mobile-first** que resolve a falta de e-commerce
sem mudar a operação logística da loja: o cliente navega por categorias, filtra
por marca, escolhe o **modelo e o tamanho** e o botão de compra gera um **link
dinâmico do WhatsApp com a mensagem pronta** — o "gancho de conversão" do produto.

> Desenvolvido pela **Sync Services** · Stack: **Node.js + Express + Supabase**

---

## 1. Stack e arquitetura

- **Backend**: Express servindo API REST. Local: `node server.js`. Produção:
  serverless na Vercel via `api/index.js`.
- **Banco**: Supabase (Postgres) — tabelas `products`, `pedidos`, `profiles`,
  `user_data`.
- **Auth**: Supabase Auth (signUp / signInWithPassword + admin API).
- **Storage de imagens**: Supabase Storage, bucket `product-images`.
- **Front**: HTML/CSS/JS vanilla em `public/` (zero build).

---

## 2. Pré-requisitos

- **Node.js 18+**
- Um projeto Supabase ativo (gratuito serve para começar)
- Conta na Vercel (para deploy)

---

## 3. Setup do Supabase

1. Crie o projeto em [supabase.com](https://supabase.com).
2. **SQL Editor** → cole e execute, na ordem:
   - `db/products.sql`  (tabela de produtos + bucket Storage + função `set_updated_at`)
   - `db/pedidos.sql`   (tabela de pedidos do "Meus Pedidos")
   - `db/profiles.sql`  (espelho de `auth.users` + flag admin + trigger `handle_new_user`)
   - `db/user_data.sql` (carrinho + wishlist persistidos por usuário)
   - `db/stores.sql`    (lojas físicas, estoque, vendas presenciais + bucket `store-images`)
3. **Storage** → confirme que o bucket `product-images` ficou **público**.
4. Copie do painel **Project Settings → API**:
   - `Project URL` → `SUPABASE_URL`
   - `service_role` key → `SUPABASE_KEY`
5. Após criar sua conta pelo `/register.html`, promova-se a admin no SQL Editor:
   ```sql
   update profiles set admin = true where email = 'seu-email@dominio.com';
   ```

---

## 4. Rodar localmente

```bash
git clone https://github.com/ThiagoGwebg/villa_vip.git
cd villa_vip/catalogo-villa-vip
cp .env.example .env       # preencha SUPABASE_URL e SUPABASE_KEY
npm install
npm run seed:products      # importa os 22 produtos iniciais para o Supabase
npm run dev                # http://localhost:3000
```

---

## 5. Deploy na Vercel

1. Faça push do repositório no GitHub.
2. **vercel.com → Add New Project** → importe o repositório.
3. **Configure Project**:
   - **Root Directory**: `catalogo-villa-vip`
   - **Framework Preset**: Other
   - **Build Command**: deixe em branco
   - **Output Directory**: deixe em branco
4. **Environment Variables**: adicione `SUPABASE_URL`, `SUPABASE_KEY`,
   `PRODUCT_IMAGES_BUCKET=product-images`.
5. **Deploy**.

Pronto — a vitrine fica em `https://SEU-PROJETO.vercel.app`, painel admin em
`/dashboard` e editor de produtos em `/editor-produtos`.

---

## 6. O gancho de conversão

Ao escolher tamanho/quantidade e tocar em **"Pedir pelo WhatsApp"**, o app abre:

```
https://wa.me/5519995497415?text=<mensagem pronta e codificada>
```

A sacola monta **um único pedido consolidado** no WhatsApp — a loja segue
fechando a venda como já faz hoje, sem nova plataforma logística.

---

## 7. Estrutura

```
catalogo-villa-vip/
├── api/
│   └── index.js          Entry point serverless (Vercel)
├── server.js             App Express (local dev + export para serverless)
├── vercel.json           Rewrites, headers de cache, função serverless
├── config/
│   └── supabase.js       Client Supabase (service_role)
├── controllers/          authController, orderController, userDataController
├── middlewares/          authMiddleware, adminMiddleware
├── routes/               auth, orders, userData
├── services/
│   ├── adminService.js   Checagem de e-mail admin
│   ├── orderService.js   CRUD de pedidos (Supabase + RLS)
│   ├── productsService.js  CRUD de produtos (Supabase)
│   └── storageService.js   Upload de imagens (Supabase Storage)
├── db/
│   ├── products.sql      Migration: tabela products + bucket
│   ├── pedidos.sql       Migration: tabela pedidos
│   └── seed-products.js  Importa data/products.json → Supabase
├── data/
│   ├── store.json        Metadados da loja (read-only em prod)
│   └── products.json     Dataset inicial (apenas para seed)
└── public/               Vitrine + painéis (HTML/CSS/JS vanilla)
```

---

## 8. API

| Método | Rota                                              | Auth         |
|--------|---------------------------------------------------|--------------|
| GET    | `/api/store`                                      | público      |
| GET    | `/api/products?categoria=&marca=&q=&ordenar=`     | público      |
| GET    | `/api/products/:id`                               | público      |
| GET    | `/api/health`                                     | público      |
| POST   | `/api/auth/register`                              | público      |
| POST   | `/api/auth/login`                                 | público      |
| PUT    | `/api/auth/profile`                               | usuário      |
| GET    | `/api/orders`                                     | usuário      |
| POST   | `/api/orders`                                     | usuário      |
| GET    | `/api/user-data`                                  | usuário      |
| PUT    | `/api/user-data`                                  | usuário      |
| GET    | `/api/analytics`                                  | admin        |
| GET    | `/api/admin/products`                             | admin        |
| POST   | `/api/admin/products`                             | admin        |
| PUT    | `/api/admin/products/:id`                         | admin        |
| DELETE | `/api/admin/products/:id`                         | admin        |
| POST   | `/api/admin/upload`                               | admin        |

---

## 9. Editar o catálogo em produção

Após o deploy, todo o CRUD é feito pelo painel em `/editor-produtos` —
nenhuma edição manual de arquivo é necessária. O `data/products.json` fica
apenas como dataset de seed inicial.
