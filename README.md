# Catálogo Web Dinâmico — Villa Vip Country Store

Vitrine digital **leve, rápida e mobile-first** que resolve a falta de e-commerce
sem mudar a operação logística da loja: o cliente navega por categorias, filtra
por marca, escolhe o **modelo e o tamanho** e o botão de compra gera um **link
dinâmico do WhatsApp com a mensagem pronta** — exatamente o "gancho de conversão"
da proposta.

> Desenvolvido pela **Sync Services** · Stack: **Node.js + Express + JSON**

---

## 1. Como rodar

Pré-requisito: **Node.js 18+**.

```bash
git clone https://github.com/ThiagoGwebg/villa_vip.git
cd villa_vip
npm install
npm start
```

Acesse: **http://localhost:3000**

Modo desenvolvimento (reinício automático ao salvar):

```bash
npm run dev
```

---

## 2. O gancho de conversão

Ao escolher tamanho/quantidade e tocar em **"Pedir pelo WhatsApp"**, o app abre:

```
https://wa.me/5519995497415?text=<mensagem pronta e codificada>
```

Mensagem gerada (exemplo real):

```
Olá, Villa Vip Country Store! 🤠 Vi no catálogo digital e quero este produto:

• *Bota Texana Couro Legítimo Bico Fino*
• Marca: Eldorado
• Tamanho: 38
• Qtd: 1
• Valor: R$ 599,90
• Ref: #BT-101

Está disponível? Como faço pra garantir o meu? 👢
```

A sacola também monta **um único pedido consolidado** no WhatsApp — a loja segue
fechando a venda como já faz hoje, sem nova plataforma logística.

---

## 3. Estrutura

```
catalogo-villa-vip/
├── server.js            API REST + entrega da vitrine (Express)
├── package.json
├── data/
│   ├── store.json       WhatsApp, marcas, categorias, contatos (fonte única)
│   └── products.json    Catálogo — editável pela loja, sem banco de dados
└── public/
    ├── index.html       Vitrine
    ├── styles.css       Identidade da marca (longhorn laranja + madeira)
    ├── app.js           Filtros, modal, sacola e link do WhatsApp
    └── assets/logo-mark.svg
```

## 4. Como a loja atualiza o catálogo

Basta editar **`data/products.json`** (nome, preço, `precoDe`, tamanhos, marca,
categoria, `tag`, `destaque`) e recarregar a página. Nenhum banco de dados,
nenhum painel complexo — pensado para a realidade de uma ME.

Campos:

| Campo      | Descrição                                          |
|------------|----------------------------------------------------|
| `id`       | Referência única (vai na mensagem do WhatsApp)     |
| `categoria`| `botas`, `chapeus`, `camisas`, `jeans-fem`, `masculino`, `acessorios` |
| `marca`    | Deve bater com uma das marcas em `store.json`      |
| `preco`    | Preço atual (number)                               |
| `precoDe`  | Preço "de" para exibir desconto (ou `null`)        |
| `tamanhos` | Lista de tamanhos disponíveis                      |
| `tag`      | `"Mais vendido"`, `"Novo"` ou `null`               |
| `destaque` | `true` aparece primeiro em "Destaques"             |

## 5. API

| Método | Rota                                   | Descrição                          |
|--------|----------------------------------------|------------------------------------|
| GET    | `/api/store`                           | Metadados da loja                  |
| GET    | `/api/products?categoria=&marca=&q=&ordenar=` | Catálogo com filtros        |
| GET    | `/api/products/:id`                    | Produto único (deep-link)          |
| GET    | `/api/health`                          | Healthcheck                        |

---

### Observações

- As imagens são **placeholders ilustrados por categoria** (gerados em SVG, sem
  dependência externa). Trocar pelas fotos reais da loja é só apontar a `src`.
- Dados de contato/marcas extraídos da coleta `villa_vip.json` (2026-05-16).
