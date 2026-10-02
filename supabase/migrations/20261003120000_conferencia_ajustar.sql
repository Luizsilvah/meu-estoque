-- Etapa 1 da correção de sincronia estoque x validades na Conferência.
--
-- Contexto (investigação anterior): /api/estoque/conferencia (PATCH) só grava
-- estoque.qtd_atual/qtd_cozinha. O ajuste de validade, quando o usuário
-- informa um "motivo" depois de salvar, era feito por chamadas separadas
-- (POST /api/movimentacao com skip_stock_update + POST /api/validades) a
-- partir de app/conferencia/page.tsx — e para o motivo "correcao" o código
-- tinha `if (tipo === 'correcao') return` como primeira linha da função,
-- saindo antes de tocar em qualquer lote. Resultado: a UI fecha o modal como
-- se tivesse funcionado, mas a validade nunca é criada/ajustada/removida.
--
-- Esta migration cria uma função única que faz TUDO (estoque + histórico +
-- lotes de validade) numa só transação, chamada 1x por app/api/estoque/
-- conferencia/route.ts (PATCH), eliminando o ponto cego do "correcao" e a
-- gravação em duas chamadas separadas (que já causava o risco apontado no
-- TODO de app/movimentacao/page.tsx: uma falhar no meio deixava estoque e
-- validades dessincronizados).

-- ─────────────────────────────────────────────────────────────────────────
-- 1. movimentacoes.motivo — contexto mais fino que "entrada"/"saida"
-- ─────────────────────────────────────────────────────────────────────────
-- movimentacoes.tipo continua só 'entrada'/'saida' (é o que vw_previsao_compras
-- e o resto do app já filtram com .eq('tipo','saida') para consumo médio —
-- mudar esses valores quebraria aquele cálculo). O motivo específico da
-- conferência ('entrada' | 'saida_uso' | 'descarte_vencido' | 'correcao') vai
-- nesta coluna nova, só para contexto/auditoria — não é filtrado em nenhum
-- lugar hoje. Nullable porque toda movimentação fora da conferência (nota,
-- transferência, scanner, movimentação manual) continua sem motivo.
alter table public.movimentacoes
  add column if not exists motivo text;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. conferencia_ajustar — estoque + histórico + validades numa transação
-- ─────────────────────────────────────────────────────────────────────────
-- p_tipo null → só ajusta qtd_atual/qtd_cozinha (ex.: usuário só corrigiu o
--   split cozinha/principal sem mudar o total), sem logar movimentação nem
--   tocar validades. Usado quando o salvamento simples do modal "Ajustar
--   estoque" não resultou em diferença no total.
-- p_tipo preenchido → sempre loga 1 linha em movimentacoes (tipo derivado do
--   sinal do delta: entrada se aumentou, saida se diminuiu) com o motivo
--   específico em movimentacoes.motivo, e processa os lotes informados.
--
-- p_lotes_add [{"data_validade":"YYYY-MM-DD","quantidade":n}]: soma na
--   validade da mesma data se já existir, senão cria uma nova linha.
-- p_lotes_remover [{"validade_id":"uuid","quantidade":n}]: subtrai da
--   validade indicada; apaga a linha se zerar; erro se faltar quantidade no
--   lote ou se o lote não pertencer ao produto.
--
-- #variable_conflict use_column: os parâmetros de saída desta função
-- (qtd_atual, qtd_cozinha) têm o MESMO NOME das colunas de public.estoque —
-- sem essa diretiva, "select qtd_atual, qtd_cozinha into ... from estoque"
-- vira ambíguo (PL/pgSQL não sabe se é a coluna ou a variável de saída).
create or replace function public.conferencia_ajustar(
  p_produto_id uuid,
  p_nova_qtd_atual integer,
  p_nova_qtd_cozinha integer,   -- null = mantém o valor atual
  p_tipo text,                   -- null | 'entrada' | 'saida_uso' | 'descarte_vencido' | 'correcao'
  p_lotes_add jsonb,              -- [{data_validade, quantidade}, ...] — pode ser '[]'
  p_lotes_remover jsonb,          -- [{validade_id, quantidade}, ...] — pode ser '[]'
  p_usuario_id uuid,
  p_usuario_nome text
)
returns table (
  qtd_atual integer,
  qtd_cozinha integer
)
language plpgsql
as $$
#variable_conflict use_column
declare
  v_qtd_atual_antiga   estoque.qtd_atual%type;
  v_qtd_cozinha_antiga estoque.qtd_cozinha%type;
  v_qtd_cozinha_final  estoque.qtd_cozinha%type;
  v_delta              integer;
  v_tipo_mov           text;
  v_add                record;
  v_rem                record;
  v_existente_id        uuid;
  v_existente_qtd        integer;
  v_qtd_lote             integer;
begin
  if p_produto_id is null or p_nova_qtd_atual is null then
    raise exception 'p_produto_id e p_nova_qtd_atual são obrigatórios' using errcode = 'CNF01';
  end if;
  if p_nova_qtd_atual < 0 then
    raise exception 'Quantidade não pode ser negativa' using errcode = 'CNF01';
  end if;
  if p_tipo is not null and p_tipo not in ('entrada', 'saida_uso', 'descarte_vencido', 'correcao') then
    raise exception 'tipo inválido: %', p_tipo using errcode = 'CNF01';
  end if;

  -- Trava a linha de estoque pela duração da transação — evita corrida com
  -- outra conferência/movimentação no mesmo produto ao mesmo tempo.
  select qtd_atual, qtd_cozinha into v_qtd_atual_antiga, v_qtd_cozinha_antiga
    from public.estoque
   where produto_id = p_produto_id
   for update;

  if not found then
    raise exception 'Produto não encontrado no estoque' using errcode = 'CNF02';
  end if;

  v_delta := p_nova_qtd_atual - v_qtd_atual_antiga;
  v_qtd_cozinha_final := coalesce(p_nova_qtd_cozinha, v_qtd_cozinha_antiga);

  if v_qtd_cozinha_final < 0 or v_qtd_cozinha_final > p_nova_qtd_atual then
    raise exception 'Quantidade na cozinha inválida (% de %)', v_qtd_cozinha_final, p_nova_qtd_atual using errcode = 'CNF01';
  end if;

  update public.estoque
     set qtd_atual = p_nova_qtd_atual,
         qtd_cozinha = v_qtd_cozinha_final,
         atualizado_em = now()
   where produto_id = p_produto_id;

  if p_tipo is not null and v_delta <> 0 then
    v_tipo_mov := case when v_delta > 0 then 'entrada' else 'saida' end;
    insert into public.movimentacoes (produto_id, tipo, quantidade, data_hora, usuario_id, usuario_nome, motivo)
    values (p_produto_id, v_tipo_mov, abs(v_delta), now(), p_usuario_id, p_usuario_nome, p_tipo);
  end if;

  for v_add in select * from jsonb_to_recordset(coalesce(p_lotes_add, '[]'::jsonb)) as x(data_validade date, quantidade integer)
  loop
    if v_add.data_validade is null or v_add.quantidade is null or v_add.quantidade <= 0 then
      raise exception 'Lote a adicionar inválido (data e quantidade > 0 são obrigatórios)' using errcode = 'CNF04';
    end if;

    v_existente_id := null;
    select id, quantidade into v_existente_id, v_existente_qtd
      from public.validades
     where produto_id = p_produto_id and data_validade = v_add.data_validade
     for update;

    if v_existente_id is not null then
      update public.validades set quantidade = v_existente_qtd + v_add.quantidade where id = v_existente_id;
    else
      insert into public.validades (produto_id, data_validade, quantidade)
      values (p_produto_id, v_add.data_validade, v_add.quantidade);
    end if;
  end loop;

  for v_rem in select * from jsonb_to_recordset(coalesce(p_lotes_remover, '[]'::jsonb)) as x(validade_id uuid, quantidade integer)
  loop
    if v_rem.validade_id is null or v_rem.quantidade is null or v_rem.quantidade <= 0 then
      raise exception 'Lote a remover inválido (validade_id e quantidade > 0 são obrigatórios)' using errcode = 'CNF04';
    end if;

    select quantidade into v_qtd_lote
      from public.validades
     where id = v_rem.validade_id and produto_id = p_produto_id
     for update;

    if not found then
      raise exception 'Lote % não encontrado para este produto', v_rem.validade_id using errcode = 'CNF05';
    end if;

    if v_qtd_lote - v_rem.quantidade < 0 then
      raise exception 'Quantidade a remover (%) maior que o lote (%)', v_rem.quantidade, v_qtd_lote using errcode = 'CNF06';
    elsif v_qtd_lote - v_rem.quantidade = 0 then
      delete from public.validades where id = v_rem.validade_id;
    else
      update public.validades set quantidade = v_qtd_lote - v_rem.quantidade where id = v_rem.validade_id;
    end if;
  end loop;

  return query select p_nova_qtd_atual::integer, v_qtd_cozinha_final::integer;
end;
$$;

alter function public.conferencia_ajustar(uuid, integer, integer, text, jsonb, jsonb, uuid, text)
  set search_path = public;

revoke execute on function public.conferencia_ajustar(uuid, integer, integer, text, jsonb, jsonb, uuid, text)
  from public, anon, authenticated;
grant execute on function public.conferencia_ajustar(uuid, integer, integer, text, jsonb, jsonb, uuid, text)
  to service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. vw_previsao_compras — recriada só para ignorar "correcao" no consumo médio
-- ─────────────────────────────────────────────────────────────────────────
-- Idêntica à versão de supabase/migrations/20261001120000_previsao_compra_quinta.sql,
-- com uma única mudança: saidas_30d agora exclui movimentações cujo motivo é
-- 'correcao' (coluna nova em movimentacoes, só existe a partir desta migration).
-- Motivo: uma correção de contagem na conferência não é consumo real — é o
-- usuário ajustando o número pra bater com o que tem na prateleira. Contar
-- isso como "saída" infla artificialmente o consumo médio diário e, por
-- tabela, a previsão de compra de quinta. Movimentações sem motivo (nota,
-- transferência, scanner, movimentação manual) continuam contando normalmente
-- — coalesce(m.motivo, '') trata motivo nulo como "não é correção".
--
-- with (security_invoker = on): a view passa a rodar com os privilégios de
-- QUEM CHAMA (sempre a service_role neste app, que já bypassa RLS mesmo
-- assim) em vez do dono da view — mais correto/explícito, sem mudar o
-- resultado prático aqui.
--
-- Fora o filtro de saidas_30d, a view é a versão já corrigida que está no
-- banco (aplicada manualmente, nunca tinha chegado ao arquivo da migration
-- original): o status COMPRAR_QUINTA usa (pm.dias_ate_quinta + 7) — a mesma
-- folga de 7 dias do cálculo de qtd_sugerida — em vez de só dias_ate_quinta.
create or replace view public.vw_previsao_compras
with (security_invoker = on)
as
with parametros as (
  select
    (now() at time zone 'America/Bahia')::date as hoje,
    case
      when extract(isodow from (now() at time zone 'America/Bahia')::date) = 4 then 7
      else ((4 - extract(isodow from (now() at time zone 'America/Bahia')::date)::int + 7) % 7)
    end as dias_ate_quinta
),
saidas_30d as (
  select m.produto_id, sum(m.quantidade)::numeric as total_saidas_30d
  from public.movimentacoes m, parametros pm
  where m.tipo = 'saida'
    and coalesce(m.motivo, '') <> 'correcao'
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
    when (e.qtd_atual - (coalesce(s.total_saidas_30d, 0) / 30.0) * (pm.dias_ate_quinta + 7)) <= e.qtd_base then 'COMPRAR_QUINTA'
    else 'OK'
  end as status
from public.estoque e
join public.produtos p on p.id = e.produto_id
left join public.fornecedores f on f.id = p.fornecedor_id
left join saidas_30d s on s.produto_id = e.produto_id
cross join parametros pm;

revoke all on public.vw_previsao_compras from anon, authenticated;
grant select on public.vw_previsao_compras to service_role;
