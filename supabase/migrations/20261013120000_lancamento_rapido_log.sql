-- Aba "Histórico" do Lançamento rápido.
--
-- 1 registro por clique em "Lançar tudo", gravado pela rota
-- /api/lancamento-rapido/lancar DEPOIS de processar os itens, com o status
-- real de cada um. Falha ao gravar aqui nunca desfaz o lançamento.
--
-- itens (jsonb array), cada elemento:
--   { produto_id, nome, tipo, local, quantidade, lotes, status: 'ok'|'erro', erro }
--
-- usuario_id sem FK de propósito (mesmo padrão de movimentacoes.usuario_id):
-- o log precisa sobreviver mesmo que o perfil seja removido; usuario_nome
-- guarda o nome da época.
--
-- Acesso: RLS ligado e sem policies (deny-all para anon/authenticated); toda
-- leitura/escrita passa por createSupabaseAdmin() (service_role, ignora RLS).

create table if not exists public.lancamento_rapido_log (
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid,
  usuario_nome text,
  texto        text,
  itens        jsonb not null default '[]'::jsonb,
  criado_em    timestamptz not null default now()
);

-- Funcionário: só os dele, mais recentes primeiro.
create index if not exists idx_lancamento_rapido_log_usuario_criado
  on public.lancamento_rapido_log (usuario_id, criado_em desc);

-- Admin: todos, mais recentes primeiro.
create index if not exists idx_lancamento_rapido_log_criado
  on public.lancamento_rapido_log (criado_em desc);

alter table public.lancamento_rapido_log enable row level security;

revoke all on public.lancamento_rapido_log from anon, authenticated;
grant select, insert, update, delete on public.lancamento_rapido_log to service_role;
