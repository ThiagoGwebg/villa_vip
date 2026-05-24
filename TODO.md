# Melhorias — Villa Vip Catálogo

Status no momento da última iteração. Itens marcados como pendentes não
bloqueiam a venda do produto — são polimento ou conteúdo do lojista.

## Conteúdo (depende do lojista)
- [ ] Subir fotos reais dos produtos pelo painel `/admin/produtos`
      (o pipeline já faz downscale e sobe para `product-images`)

## Operação avançada (Fase 3 restante — plug-and-play)
- [ ] Webhook do Supabase `pedidos.insert` → WhatsApp Cloud API
      (notificar o lojista quando entra pedido pelo site)
- [ ] View materializada `mv_analytics` + refresh por pg_cron
      (substitui o cálculo a cada GET em `/api/analytics`)
- [ ] Multi-admin com roles granulares (gerente/vendedor/estoquista)
      e tela `/admin/equipe` (só faz sentido com mais de 1 pessoa usando)

## Qualidade de código (não bloqueia venda)
- [ ] ESLint + Prettier
- [ ] Testes automatizados (controllers de auth, pedidos, vendas presenciais)

---

## Entregue

### Fase 1 — Profissionalização
- [X] Schema versionado de `profiles` e `user_data` com RLS (`db/profiles.sql`, `db/user_data.sql`)
- [X] `public/shared.js` (auth, toast, confirm, setBusy, authFetch, guard)
- [X] Toast/loading/confirm padronizados (fim do `alert()`)
- [X] Rate limiting (`express-rate-limit`) em login/upload/analytics/mutations
- [X] Admin enxerga e atualiza pedidos (`/admin/pedidos` + `PATCH /api/admin/orders/:id`)
- [X] Sidebar de navegação (`public/admin-shell.js`)
- [X] Paginação server-side de produtos (`/api/admin/products?limit=&offset=`)
- [X] Downscale de imagem client-side antes do upload

### Fase 2 — Loja física
- [X] Schema multi-loja (`db/stores.sql`: `stores`, `estoque`, `vendas_presenciais` + trigger de baixa)
- [X] Rotas e services (`adminStores`, `adminEstoque`, `adminVendasPresenciais`)
- [X] Card "Loja Física" na dashboard (foto + status aberto/fechado + KPIs + top SKUs)
- [X] Tela `/admin/loja` com 3 abas (Loja · Estoque · Vendas Presenciais)

### Fase 3 — Operação avançada
- [X] Export CSV em 4 relatórios (catálogo, pedidos, vendas presenciais, ruptura)
- [X] Audit log (`db/audit.sql` + `auditMiddleware` + tela `/admin/auditoria`)
- [X] Alertas operacionais (`db/alerts.sql` + sino na sidebar com badge)

### Originalmente em aberto
- [X] CRUD de produtos no painel admin
- [X] Wishlist
- [X] Sistema de status de pedido (admin atualiza, usuário vê)
- [X] Rate limiting em login/registro/analytics
- [X] `jsonwebtoken` removido (não está em `package.json`)
