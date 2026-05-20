# Melhorias - Villa Vip E-Commerce

## Negócio (alto impacto em vendas)
- [-] Adicionar imagens reais dos produtos no catálogo
- [X] Criar editor de produtos no painel admin (CRUD com formulário)

## UX (experiência do usuário)
- [ ] Implementar lista de desejos (wishlist) com localStorage
- [ ] Adicionar sistema de status de pedido (admin atualiza, usuário acompanha)
- [-] Configurar notificações por email (confirmação de cadastro e pedido via Supabase SMTP)

## Segurança
- [ ] Adicionar rate limiting nos endpoints de login, registro e analytics

## Qualidade de código
- [ ] Remover dependência não usada `jsonwebtoken` do package.json
- [ ] Adicionar testes automatizados nos controllers de auth e pedidos
- [ ] Configurar ESLint e Prettier no projeto
- [ ] Corrigir cache sem limite de tamanho em server.js (adicionar TTL ou limite)
