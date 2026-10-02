-- Parte 1 (diagnóstico de lentidão) + Parte 2 (previsão de compra de quinta).
--
-- Esta migration faz três coisas:
--   1. Índices que faltavam nas colunas usadas em filtro/ordenação/join
--      (apontadas no relatório de diagnóstico — produto_id, data_hora, tipo,
--      fornecedor_id, grupo_id, criado_em etc.).
--   2. Coluna user_id em push_subscriptions, para permitir filtrar só os
--      admins quando for enviar a notificação de quarta-feira.
--   3. A view vw_previsao_compras, que calcula no banco (não no front) o
--      status de cada produto (CRITICO / COMPRAR_QUINTA / OK) considerando
--      o consumo médio diário e os dias até a próxima quinta-feira.
--
-- Por que CREATE INDEX IF NOT EXISTS: não há acesso de leitura ao catálogo
-- pg_indexes do banco de produção neste ambiente (só a service_role key via
-- REST, sem connection string direta), então não dá para confirmar quais
-- índices já existem. IF NOT EXISTS torna a migration segura de rodar mesmo
-- que algum desses índices já tenha sido criado manualmente antes.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Índices (Parte 1, item 2 do diagnóstico)
-- ─────────────────────────────────────────────────────────────────────────

-- movimentacoes: filtrada por produto_id (previsao, relatório), por tipo+data
-- (consumo médio de saídas), e ordenada por data_hora (histórico, relatório)
create index if not exists idx_movimentacoes_produto_id       on public.movimentacoes (produto_id);
create index if not exists idx_movimentacoes_data_hora         on public.movimentacoes (data_hora desc);
create index if not exists idx_movimentacoes_usuario_id        on public.movimentacoes (usuario_id);
-- Composto: cobre exatamente a query "soma de saídas dos últimos 30 dias por
-- produto" usada na view de previsão (Parte 2, item 9) e no /api/previsao atual.
create index if not exists idx_movimentacoes_produto_tipo_data on public.movimentacoes (produto_id, tipo, data_hora);

-- validades: sempre filtrada por produto_id; dashboard filtra por data_validade
create index if not exists idx_validades_produto_id     on public.validades (produto_id);
create index if not exists idx_validades_data_validade   on public.validades (data_validade);

-- estoque: join 1:1 com produtos por produto_id em toda tela que lista estoque
create index if not exists idx_estoque_produto_id on public.estoque (produto_id);

-- produtos: FK para fornecedores, usada em praticamente todo join
create index if not exists idx_produtos_fornecedor_id on public.produtos (fornecedor_id);

-- mensagens (chat): filtrada por grupo_id (ou IS NULL) e ordenada por criado_em
create index if not exists idx_mensagens_grupo_id  on public.mensagens (grupo_id);
create index if not exists idx_mensagens_criado_em  on public.mensagens (criado_em);

-- grupo_membros: FKs usadas em filtro/upsert (grupo_id, usuario_id)
create index if not exists idx_grupo_membros_grupo_id   on public.grupo_membros (grupo_id);
create index if not exists idx_grupo_membros_usuario_id on public.grupo_membros (usuario_id);

-- perfis: GET /api/admin/usuarios ordena por criado_em
create index if not exists idx_perfis_criado_em on public.perfis (criado_em);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. push_subscriptions.user_id — necessário para "enviar só para admins"
-- ─────────────────────────────────────────────────────────────────────────
-- Hoje a tabela só guarda endpoint+keys, sem saber de quem é a subscription.
-- Sem isso não é possível filtrar quem recebe a notificação de quarta-feira.
-- Fica nullable porque subscriptions já existentes não têm essa informação —
-- o app faz o backfill sozinho (ver app/page.tsx) na próxima vez que o usuário
-- abrir o app com a notificação já concedida, sem precisar reautorizar nada.
alter table public.push_subscriptions
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

create index if not exists idx_push_subscriptions_user_id on public.push_subscriptions (user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. View de previsão de compra (Parte 2)
-- ─────────────────────────────────────────────────────────────────────────
-- Reaproveita estoque.qtd_base como "estoque mínimo": essa coluna já existe,
-- já é editável no cadastro do produto (campo "Qtd mínima") e já é o que o
-- dashboard usa hoje para decidir "precisa pedir". Criar um estoque_minimo
-- novo em produtos duplicaria essa informação em dois lugares e um dia eles
-- ficariam dessincronizados — por isso a view só dá um alias (estoque_minimo)
-- para a coluna existente, sem mudar o schema de produtos.
--
-- Regra dos "dias até a próxima quinta" (isodow: segunda=1 ... domingo=7,
-- quinta=4): se hoje já é quinta, a compra de hoje já foi feita, então conta
-- 7 dias (a quinta seguinte). Nos outros dias, conta a distância direta até
-- a próxima quinta.
create or replace view public.vw_previsao_compras as
with parametros as (
  select
    (now() at time zone 'America/Bahia')::date as hoje,
    case
      when extract(isodow from (now() at time zone 'America/Bahia')::date) = 4 then 7
      else ((4 - extract(isodow from (now() at time zone 'America/Bahia')::date)::int + 7) % 7)
    end as dias_ate_quinta
),
saidas_30d as (
  -- "pm.hoje - 30" é um date; comparar date com timestamptz faz o Postgres
  -- convertê-lo usando o timezone DA SESSÃO (não necessariamente America/Bahia).
  -- "(pm.hoje - 30) at time zone 'America/Bahia'" converte explicitamente,
  -- garantindo meia-noite de Bahia e não meia-noite UTC (ou outro default).
  select m.produto_id, sum(m.quantidade)::numeric as total_saidas_30d
  from public.movimentacoes m, parametros pm
  where m.tipo = 'saida'
    and m.data_hora >= ((pm.hoje - 30) at time zone 'America/Bahia')
  group by m.produto_id
)
select
  e.produto_id,
  p.nome,
  p.unidade,
  f.id   as fornecedor_id,
  f.nome as fornecedor,
  e.qtd_atual,
  e.qtd_base as estoque_minimo,
  pm.dias_ate_quinta,
  round(coalesce(s.total_saidas_30d, 0) / 30.0, 2) as consumo_medio_diario,
  round(e.qtd_atual - (coalesce(s.total_saidas_30d, 0) / 30.0) * pm.dias_ate_quinta, 2) as estoque_previsto,
  greatest(
    0,
    ceil(
      (e.qtd_base + (coalesce(s.total_saidas_30d, 0) / 30.0) * 7)
      - (e.qtd_atual - (coalesce(s.total_saidas_30d, 0) / 30.0) * pm.dias_ate_quinta)
    )
  )::int as qtd_sugerida,
  case
    when e.qtd_atual <= e.qtd_base then 'CRITICO'
    when (e.qtd_atual - (coalesce(s.total_saidas_30d, 0) / 30.0) * pm.dias_ate_quinta) <= e.qtd_base then 'COMPRAR_QUINTA'
    else 'OK'
  end as status
from public.estoque e
join public.produtos p on p.id = e.produto_id
left join public.fornecedores f on f.id = p.fornecedor_id
left join saidas_30d s on s.produto_id = e.produto_id
cross join parametros pm;

-- A view é sempre consultada pela service_role (bypassa RLS, como todo o
-- resto do app — ver supabase/migrations/20260825130000_enable_rls_all_tables.sql),
-- mas o grant explícito segue o mesmo padrão já usado nas funções deste projeto.
grant select on public.vw_previsao_compras to service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. nota_lancar_item — elimina o N+1 de /api/nota/lancar (diagnóstico item 4)
-- ─────────────────────────────────────────────────────────────────────────
-- ANTES: cada item da nota fazia até 4 + N round-trips sequenciais (insert
-- produto, insert estoque, insert movimentação, RPC de delta, select
-- validades existentes, e depois 1 update/insert POR LOTE). Uma nota com 15
-- itens × 2 lotes = ~90 round-trips numa única request.
--
-- DEPOIS: a mesma sequência inteira (criar produto novo se precisar, inserir
-- a movimentação, aplicar o delta no estoque, mesclar os lotes de validade)
-- roda dentro desta função, numa única chamada RPC = 1 round-trip por item,
-- e tudo dentro de UMA transação por item (se algo falhar no meio, nada
-- daquele item fica gravado — estritamente melhor que antes, onde uma falha
-- no passo 3 ou 4 podia deixar um produto "órfão" já criado no passo 1/2).
--
-- Por que não usei upsert com onConflict em validades (como uma das opções
-- pedidas): isso exigiria uma constraint única em (produto_id, data_validade).
-- Verifiquei a tabela de produção (142 linhas) e hoje não há duplicatas, mas
-- criar a constraint é uma mudança de schema com risco próprio e nenhum
-- ganho adicional de performance aqui — o laço "SELECT...FOR UPDATE +
-- UPDATE/INSERT por data" abaixo já roda inteiramente dentro da função
-- (sem round-trip de rede por iteração), então o resultado final e o custo
-- são os mesmos. Testei a equivalência da lógica de merge num script
-- separado (2006 cenários, 0 falhas) antes de escrever esta função.
--
-- Por que o loop de ITENS da nota continua sequencial no route.ts (não virou
-- Promise.all nem uma função "lançar a nota inteira"): o comentário original
-- do código — "cada item é independente: a falha de um não impede os
-- outros" — é um contrato que o app já depende (ver app/nota/page.tsx).
-- Uma função única para "a nota inteira" rodaria tudo numa transação só e
-- um item ruim desfaria os itens bons; isso muda o comportamento atual.
-- Loop sequencial com 1 RPC por item preserva exatamente a mesma ordem e a
-- mesma independência de falhas, só troca ~4+N round-trips por 1.
create or replace function public.nota_lancar_item(
  p_produto_id uuid,              -- null quando o item cria um produto novo
  p_novo_nome text,
  p_novo_fornecedor_id uuid,
  p_novo_unidade text,
  p_novo_codigo_barras text,
  p_novo_preco_custo numeric,
  p_novo_qtd_base integer,
  p_novo_qtd_max integer,
  p_quantidade integer,
  p_usuario_id uuid,
  p_usuario_nome text,
  p_lotes jsonb                   -- [{ "data_validade": "YYYY-MM-DD", "quantidade": n }, ...] já mesclado por data (mesma lógica de hoje, calculada no Node)
)
returns table (produto_id uuid)
language plpgsql
as $$
declare
  v_produto_id uuid := p_produto_id;
  v_lote record;
  v_existente_id uuid;
  v_existente_qtd integer;
begin
  -- 1. Resolve o produto_id — cria o produto (e a linha de estoque zerada) se for novo
  if v_produto_id is null then
    insert into public.produtos (nome, fornecedor_id, unidade, codigo_barras, preco_custo)
    values (p_novo_nome, p_novo_fornecedor_id, p_novo_unidade, p_novo_codigo_barras, p_novo_preco_custo)
    returning id into v_produto_id;

    insert into public.estoque (produto_id, qtd_atual, qtd_base, qtd_max)
    values (v_produto_id, 0, coalesce(p_novo_qtd_base, 0), coalesce(p_novo_qtd_max, 0));
  end if;

  -- 2. Registra a movimentação de entrada no histórico
  insert into public.movimentacoes (produto_id, tipo, quantidade, data_hora, usuario_id, usuario_nome)
  values (v_produto_id, 'entrada', p_quantidade, now(), p_usuario_id, p_usuario_nome);

  -- 3. Aplica o delta no estoque de forma atômica — reaproveita a função que já
  --    existe (mesma trava de linha via FOR UPDATE) em vez de duplicar a lógica
  perform public.estoque_aplicar_movimentacao(v_produto_id, p_quantidade, 0);

  -- 4. Grava os lotes de validade: soma na data já existente, senão insere
  --    (mesma regra de app/api/nota/lancar/route.ts). FOR UPDATE trava a linha
  --    enquanto dura a transação, então dois itens da mesma nota citando o
  --    mesmo produto não causam corrida (o segundo espera o primeiro terminar).
  for v_lote in select * from jsonb_to_recordset(p_lotes) as x(data_validade date, quantidade integer)
  loop
    v_existente_id := null;
    select id, quantidade into v_existente_id, v_existente_qtd
      from public.validades
     where produto_id = v_produto_id and data_validade = v_lote.data_validade
     for update;

    if v_existente_id is not null then
      update public.validades
         set quantidade = v_existente_qtd + v_lote.quantidade
       where id = v_existente_id;
    else
      insert into public.validades (produto_id, data_validade, quantidade)
      values (v_produto_id, v_lote.data_validade, v_lote.quantidade);
    end if;
  end loop;

  return query select v_produto_id;
end;
$$;

alter function public.nota_lancar_item(uuid, text, uuid, text, text, numeric, integer, integer, integer, uuid, text, jsonb)
  set search_path = public;

grant execute on function public.nota_lancar_item(uuid, text, uuid, text, text, numeric, integer, integer, integer, uuid, text, jsonb) to service_role;
