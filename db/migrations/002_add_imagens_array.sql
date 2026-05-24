-- ============================================================================
--  002 — Galeria de fotos por produto
--  Adiciona coluna `imagens text[]` à tabela products.
--  A coluna legada `imagem` (singular) é mantida espelhando imagens[0] para
--  garantir back-compat caso algum cliente antigo ainda consulte por ela.
--  Rode no SQL Editor do Supabase.
-- ============================================================================

alter table public.products
  add column if not exists imagens text[] not null default '{}';

-- Backfill: produtos antigos que já têm `imagem` populam o array com 1 item.
update public.products
   set imagens = array[imagem]
 where imagem is not null
   and imagem <> ''
   and (imagens is null or array_length(imagens, 1) is null);
