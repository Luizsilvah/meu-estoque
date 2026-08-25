-- Habilita Row Level Security em todas as tabelas públicas e remove quaisquer
-- policies pré-existentes, deixando o acesso via anon/authenticated bloqueado
-- por padrão (deny-all implícito do Postgres: RLS ligado + zero policies).
--
-- Por que isso é seguro para este app: nenhuma rota em app/api/ nem código
-- client-side consulta estas tabelas com a anon key — toda leitura/escrita
-- real passa por createSupabaseAdmin() (service_role), que sempre ignora
-- RLS. A autorização (login obrigatório, perfil === 'admin' etc.) já é
-- feita no código das rotas, não em policies do banco. RLS aqui existe só
-- para impedir acesso direto via PostgREST usando a anon key, que é pública
-- (embutida no bundle JS do browser).
--
-- O drop dinâmico de policies existentes evita depender de conhecer os
-- nomes/condições das policies já criadas (ex.: a que o linter apontou como
-- "Política existe mas RLS desativado" em estoque) — o resultado final é o
-- mesmo independentemente do que existia antes: RLS ligado, sem policies.

do $$
declare
  tbl text;
  pol record;
begin
  foreach tbl in array array[
    'produtos', 'estoque', 'perfis', 'validades', 'fornecedores',
    'movimentacoes', 'mensagens', 'push_subscriptions', 'grupos', 'grupo_membros'
  ]
  loop
    for pol in
      select policyname from pg_policies
       where schemaname = 'public' and tablename = tbl
    loop
      execute format('drop policy %I on public.%I', pol.policyname, tbl);
    end loop;

    execute format('alter table public.%I enable row level security', tbl);
  end loop;
end $$;
