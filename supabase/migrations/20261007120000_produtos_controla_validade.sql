-- Opção por produto "Controla validade".
--
-- Embalagens (tampa de cumbuca, copo, colher...) não têm validade. Hoje a
-- Movimentação obriga informar lote quando o produto já tem lotes (MOV03).
--
-- produtos.controla_validade = false →
--   movimentacao_registrar: ignora p_lotes_add/p_lotes_remover, não valida
--     MOV03 nem a remoção de lotes na saída; só ajusta a quantidade.
--   conferencia_ajustar: ignora os lotes; só ajusta a quantidade.
--   nota_lancar_item: ignora p_lotes; só lança a quantidade.
--   vw_validades_divergentes: o produto não aparece.
-- Lotes que já existirem para o produto não são apagados aqui — o front
-- pergunta e apaga ao desligar a opção (etapa 2).
--
-- Assinaturas e tipos de retorno das funções NÃO mudam (create or replace).
-- Produto novo criado pela nota usa o default (true).

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Coluna
-- ─────────────────────────────────────────────────────────────────────────
alter table public.produtos
  add column controla_validade boolean not null default true;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. movimentacao_registrar
-- ─────────────────────────────────────────────────────────────────────────
-- Igual à versão de 20261006120000_movimentacao_registrar.sql, mais:
-- v_controla (produtos.controla_validade) e v_lotes_add/v_lotes_remover, que
-- viram '[]' quando o produto não controla validade. Todas as checagens de
-- lote (MOV03 de entrada/saída e a soma dos lotes) só rodam com v_controla.
create or replace function public.movimentacao_registrar(
  p_produto_id uuid,
  p_tipo text,
  p_quantidade integer,
  p_delta_cozinha integer,
  p_lotes_add jsonb,
  p_lotes_remover jsonb,
  p_usuario_id uuid,
  p_usuario_nome text
)
returns table (
  qtd_atual estoque.qtd_atual%type,
  qtd_cozinha estoque.qtd_cozinha%type,
  qtd_base estoque.qtd_base%type
)
language plpgsql
as $$
#variable_conflict use_column
declare
  v_delta_cozinha integer := coalesce(p_delta_cozinha, 0);
  v_controla      boolean;
  v_lotes_add     jsonb;
  v_lotes_remover jsonb;
  v_atual         estoque.qtd_atual%type;
  v_cozinha       estoque.qtd_cozinha%type;
  v_novo_atual    estoque.qtd_atual%type;
  v_novo_cozinha  estoque.qtd_cozinha%type;
  v_base          estoque.qtd_base%type;
  v_n_lotes       integer;
  v_soma_lotes    integer;
  v_soma_add      integer;
  v_soma_rem      integer;
  v_esperado      integer;
  v_add           record;
  v_rem           record;
  v_existente_id  uuid;
  v_existente_qtd integer;
  v_qtd_lote      integer;
begin
  if p_produto_id is null or p_quantidade is null then
    raise exception 'p_produto_id e p_quantidade são obrigatórios' using errcode = 'MOV01';
  end if;
  if p_tipo is null or p_tipo not in ('entrada', 'saida') then
    raise exception 'tipo inválido: %', p_tipo using errcode = 'MOV01';
  end if;
  if p_quantidade <= 0 then
    raise exception 'Quantidade tem que ser maior que zero' using errcode = 'MOV01';
  end if;
  if (p_tipo = 'entrada' and (v_delta_cozinha < 0 or v_delta_cozinha > p_quantidade))
     or (p_tipo = 'saida' and (v_delta_cozinha > 0 or -v_delta_cozinha > p_quantidade)) then
    raise exception 'Quantidade da cozinha inválida (%) para % de %', v_delta_cozinha, p_tipo, p_quantidade using errcode = 'MOV01';
  end if;

  -- Produto sem controle de validade: os lotes recebidos são ignorados.
  select p.controla_validade into v_controla
    from public.produtos p
   where p.id = p_produto_id;
  v_controla := coalesce(v_controla, true);

  if v_controla then
    v_lotes_add     := coalesce(p_lotes_add, '[]'::jsonb);
    v_lotes_remover := coalesce(p_lotes_remover, '[]'::jsonb);
  else
    v_lotes_add     := '[]'::jsonb;
    v_lotes_remover := '[]'::jsonb;
  end if;

  if p_tipo = 'entrada' and jsonb_array_length(v_lotes_remover) > 0 then
    raise exception 'Entrada não remove lotes' using errcode = 'MOV03';
  end if;
  if p_tipo = 'saida' and jsonb_array_length(v_lotes_add) > 0 then
    raise exception 'Saída não adiciona lotes' using errcode = 'MOV03';
  end if;

  -- Trava a linha de estoque pela transação inteira (estoque_aplicar_movimentacao,
  -- abaixo, trava de novo a mesma linha — na mesma transação isso é no-op).
  select e.qtd_atual, e.qtd_cozinha into v_atual, v_cozinha
    from public.estoque e
   where e.produto_id = p_produto_id
   for update;

  if not found then
    raise exception 'Produto não encontrado no estoque' using errcode = 'ESTK1';
  end if;

  -- Saída nunca deixa negativo: a parte do principal não passa do principal,
  -- a parte da cozinha não passa da cozinha.
  if p_tipo = 'saida' then
    if -v_delta_cozinha > v_cozinha then
      raise exception 'Estoque na cozinha insuficiente. Disponível: %', v_cozinha using errcode = 'MOV02';
    end if;
    if p_quantidade + v_delta_cozinha > v_atual - v_cozinha then
      raise exception 'Estoque principal insuficiente. Disponível: %', greatest(0, v_atual - v_cozinha) using errcode = 'MOV02';
    end if;
  end if;

  -- Conferência da soma dos lotes contra a quantidade movimentada
  -- (só para produto que controla validade).
  if v_controla then
    select count(*), coalesce(sum(v.quantidade), 0) into v_n_lotes, v_soma_lotes
      from public.validades v
     where v.produto_id = p_produto_id;

    select coalesce(sum(x.quantidade), 0) into v_soma_add
      from jsonb_to_recordset(v_lotes_add) as x(data_validade date, quantidade integer);
    select coalesce(sum(x.quantidade), 0) into v_soma_rem
      from jsonb_to_recordset(v_lotes_remover) as x(validade_id uuid, quantidade integer);

    if p_tipo = 'entrada' then
      if v_n_lotes > 0 and v_soma_add = 0 then
        raise exception 'Informe a validade das % unidades (o produto tem lotes cadastrados)', p_quantidade using errcode = 'MOV03';
      end if;
      if v_soma_add <> 0 and v_soma_add <> p_quantidade then
        raise exception 'Os lotes somam % mas a entrada é de %', v_soma_add, p_quantidade using errcode = 'MOV03';
      end if;
    else
      v_esperado := least(p_quantidade, v_soma_lotes);
      if v_soma_rem <> v_esperado then
        raise exception 'Os lotes escolhidos somam % mas a saída tem que tirar % dos lotes', v_soma_rem, v_esperado using errcode = 'MOV03';
      end if;
    end if;
  end if;

  -- Quantidade: reaproveita a função atômica já existente.
  select r.qtd_atual, r.qtd_cozinha, r.qtd_base into v_novo_atual, v_novo_cozinha, v_base
    from public.estoque_aplicar_movimentacao(
      p_produto_id,
      case when p_tipo = 'entrada' then p_quantidade else -p_quantidade end,
      v_delta_cozinha
    ) r;

  insert into public.movimentacoes (produto_id, tipo, quantidade, data_hora, usuario_id, usuario_nome, motivo)
  values (p_produto_id, p_tipo, p_quantidade, now(), p_usuario_id, p_usuario_nome, null);

  -- Lotes: mesmas regras e erros de conferencia_ajustar ('[]' sem controle de validade).
  for v_add in select * from jsonb_to_recordset(v_lotes_add) as x(data_validade date, quantidade integer)
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

  for v_rem in select * from jsonb_to_recordset(v_lotes_remover) as x(validade_id uuid, quantidade integer)
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

  return query select v_novo_atual, v_novo_cozinha, v_base;
end;
$$;

alter function public.movimentacao_registrar(uuid, text, integer, integer, jsonb, jsonb, uuid, text)
  set search_path = public;

revoke execute on function public.movimentacao_registrar(uuid, text, integer, integer, jsonb, jsonb, uuid, text)
  from public, anon, authenticated;
grant execute on function public.movimentacao_registrar(uuid, text, integer, integer, jsonb, jsonb, uuid, text)
  to service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. conferencia_ajustar
-- ─────────────────────────────────────────────────────────────────────────
-- Igual à versão de 20261003120000_conferencia_ajustar.sql, mais: os laços
-- de lotes usam v_lotes_add/v_lotes_remover, que viram '[]' quando o produto
-- não controla validade (só a quantidade e o histórico são gravados).
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
  v_controla           boolean;
  v_lotes_add          jsonb;
  v_lotes_remover      jsonb;
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

  -- Produto sem controle de validade: os lotes recebidos são ignorados.
  select p.controla_validade into v_controla
    from public.produtos p
   where p.id = p_produto_id;
  v_controla := coalesce(v_controla, true);

  if v_controla then
    v_lotes_add     := coalesce(p_lotes_add, '[]'::jsonb);
    v_lotes_remover := coalesce(p_lotes_remover, '[]'::jsonb);
  else
    v_lotes_add     := '[]'::jsonb;
    v_lotes_remover := '[]'::jsonb;
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

  for v_add in select * from jsonb_to_recordset(v_lotes_add) as x(data_validade date, quantidade integer)
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

  for v_rem in select * from jsonb_to_recordset(v_lotes_remover) as x(validade_id uuid, quantidade integer)
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
-- 4. nota_lancar_item
-- ─────────────────────────────────────────────────────────────────────────
-- Igual à versão de 20261001120000_previsao_compra_quinta.sql, mais: o laço
-- de lotes (passo 4) só roda se o produto controla validade. Produto novo
-- criado aqui fica com o default (controla_validade = true).
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
#variable_conflict use_column
declare
  v_produto_id uuid := p_produto_id;
  v_controla boolean;
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
  --    Produto sem controle de validade: os lotes recebidos são ignorados.
  select p.controla_validade into v_controla
    from public.produtos p
   where p.id = v_produto_id;

  if coalesce(v_controla, true) then
    for v_lote in select * from jsonb_to_recordset(coalesce(p_lotes, '[]'::jsonb)) as x(data_validade date, quantidade integer)
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
  end if;

  return query select v_produto_id;
end;
$$;

alter function public.nota_lancar_item(uuid, text, uuid, text, text, numeric, integer, integer, integer, uuid, text, jsonb)
  set search_path = public;

grant execute on function public.nota_lancar_item(uuid, text, uuid, text, text, numeric, integer, integer, integer, uuid, text, jsonb) to service_role;
revoke execute on function public.nota_lancar_item(uuid, text, uuid, text, text, numeric, integer, integer, integer, uuid, text, jsonb) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. vw_validades_divergentes — sem os produtos que não controlam validade
-- ─────────────────────────────────────────────────────────────────────────
-- Igual à versão de 20261005120000_vw_validades_divergentes.sql, mais o
-- filtro p.controla_validade no CTE base. Mesmas colunas, mesma ordem.
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
  where p.controla_validade
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
