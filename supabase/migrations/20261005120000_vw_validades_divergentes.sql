-- Etapa 3 da correção de sincronia estoque x validades: aba "Validades divergentes".
--
-- Regra do app: para cada produto, soma(validades.quantidade) = estoque.qtd_atual
-- (validades não têm local — qtd_cozinha é só uma parte do total e não entra aqui).
-- Esta view lista os produtos que FUGIRAM dessa regra, para a página
-- /validades-divergentes corrigir os lotes via conferencia_ajustar (com
-- p_tipo = null e p_nova_qtd_atual = qtd atual → mexe só nos lotes, sem mudar
-- a quantidade nem gravar movimentação).
--
-- Schema conferido no banco antes de escrever (OpenAPI do PostgREST):
--   estoque.qtd_atual integer (nullable), validades.quantidade integer,
--   validades.produto_id uuid (nullable), 1 linha de estoque por produto.
--
-- tipo:
--   SOBRA_VALIDADE → lotes somam MAIS que o estoque (inclui estoque 0 com lote)
--   FALTA_VALIDADE → lotes somam MENOS que o estoque, mas existe algum lote
--   SEM_VALIDADE   → tem estoque e nenhum lote cadastrado
-- Produtos que batem (inclui estoque 0 sem lote) ficam de fora pelo where.
--
-- with (security_invoker = on): mesmo padrão de vw_previsao_compras — roda com
-- os privilégios de quem consulta (sempre a service_role neste app).
create or replace view public.vw_validades_divergentes
with (security_invoker = on)
as
with soma_lotes as (
  select v.produto_id, sum(v.quantidade)::int as qtd_validades
  from public.validades v
  where v.produto_id is not null
  group by v.produto_id
),
base as (
  select
    e.produto_id,
    p.nome,
    f.nome as fornecedor,
    coalesce(e.qtd_atual, 0)::int     as qtd_estoque,
    coalesce(s.qtd_validades, 0)::int as qtd_validades
  from public.estoque e
  join public.produtos p on p.id = e.produto_id
  left join public.fornecedores f on f.id = p.fornecedor_id
  left join soma_lotes s on s.produto_id = e.produto_id
)
select
  b.produto_id,
  b.nome,
  b.fornecedor,
  b.qtd_estoque,
  b.qtd_validades,
  (b.qtd_validades - b.qtd_estoque) as diferenca,
  case
    when b.qtd_validades > b.qtd_estoque then 'SOBRA_VALIDADE'
    when b.qtd_validades > 0             then 'FALTA_VALIDADE'
    else 'SEM_VALIDADE'
  end as tipo
from base b
-- Diferente ⇒ ou sobra, ou falta com lote, ou (validades = 0 e estoque > 0)
-- — exatamente os três tipos acima; nada cai num caso não previsto.
where b.qtd_validades <> b.qtd_estoque;

revoke all on public.vw_validades_divergentes from anon, authenticated;
grant select on public.vw_validades_divergentes to service_role;
