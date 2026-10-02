-- Corrige um erro meu na migration anterior (20261001120000): adicionei
-- push_subscriptions.user_id sem checar o schema real da tabela primeiro.
-- O app já tinha push_subscriptions.usuario_id (convenção em português usada
-- em todo o resto do projeto — produtos.usuario_id, movimentacoes.usuario_id
-- etc.) e o resto da tabela guarda a subscription inteira num jsonb chamado
-- `subscription`, não em colunas endpoint/keys separadas. Isso só apareceu
-- quando /api/cron/alerta-compra (e, na verdade, /api/notificacoes/subscribe,
-- /api/notificacoes/enviar e o push de estoque baixo em /api/movimentacao —
-- os quatro lugares que tocam essa tabela) começaram a dar 500 com
-- "column push_subscriptions.endpoint does not exist".
--
-- Como a tabela estava vazia (nunca existiu uma subscription salva com
-- sucesso, porque o INSERT também sempre falhava pelo mesmo motivo), não há
-- nenhum dado para migrar — só corrigir o schema e o código (ver app/api/
-- notificacoes/subscribe, .../enviar, movimentacao e cron/alerta-compra).

drop index if exists public.idx_push_subscriptions_user_id;
alter table public.push_subscriptions drop column if exists user_id;

-- 1 subscription por usuário: o upsert em /api/notificacoes/subscribe usa
-- onConflict: 'usuario_id' para substituir a subscription antiga em vez de
-- acumular uma linha nova a cada vez que o app roda subscribePush() de novo
-- no mesmo usuário (isso já acontece sozinho hoje, ver app/page.tsx).
create unique index if not exists idx_push_subscriptions_usuario_id_unico
  on public.push_subscriptions (usuario_id);
