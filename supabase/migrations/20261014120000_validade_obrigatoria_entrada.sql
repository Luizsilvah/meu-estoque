-- Validade obrigatória em toda entrada de produto que controla validade.
--
-- Antes, a Movimentação/Scanner só exigiam lotes na entrada quando o produto
-- já tinha algum lote cadastrado, e a nota_lancar_item aceitava qualquer
-- p_lotes (a conferência da soma ficava só no Node). Agora, com
-- produtos.controla_validade = true:
--   movimentacao_registrar (entrada): soma dos p_lotes_add = p_quantidade,
--     sempre — mesmo que o produto ainda não tenha nenhum lote (MOV03).
--   nota_lancar_item: soma dos p_lotes = p_quantidade (NOT01). Vale também
--     para o produto novo criado pela nota (nasce com controla_validade = true).
-- controla_validade = false continua ignorando os lotes e nunca exige nada.
-- conferencia_ajustar NÃO muda (correção de contagem pode mexer só na quantidade).
--
-- Assinaturas e tipos de retorno das funções NÃO mudam (create or replace).

-- ─────────────────────────────────────────────────────────────────────────
-- 1. movimentacao_registrar
-- ─────────────────────────────────────────────────────────────────────────
-- Igual à versão de 20261007120000_produtos_controla_validade.sql, menos a
-- exceção "só exige lote se o produto já tem lotes" na entrada (v_n_lotes
-- saiu, não é mais usado).
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
    select coalesce(sum(v.quantidade), 0) into v_soma_lotes
      from public.validades v
     where v.produto_id = p_produto_id;

    select coalesce(sum(x.quantidade), 0) into v_soma_add
      from jsonb_to_recordset(v_lotes_add) as x(data_validade date, quantidade integer);
    select coalesce(sum(x.quantidade), 0) into v_soma_rem
      from jsonb_to_recordset(v_lotes_remover) as x(validade_id uuid, quantidade integer);

    if p_tipo = 'entrada' then
      -- Toda entrada informa a validade de todas as unidades, mesmo que o
      -- produto ainda não tenha nenhum lote cadastrado.
      if v_soma_add = 0 then
        raise exception 'Informe a validade das % unidades', p_quantidade using errcode = 'MOV03';
      end if;
      if v_soma_add <> p_quantidade then
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
-- 2. nota_lancar_item
-- ─────────────────────────────────────────────────────────────────────────
-- Igual à versão de 20261007120000_produtos_controla_validade.sql, mais: a
-- conferência dos lotes (NOT01) roda ANTES de criar produto/movimentação,
-- com controla_validade = true (produto novo conta como true — é o default
-- da coluna). Cada lote precisa de data e quantidade > 0 e a soma tem que
-- ser exatamente p_quantidade.
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
  v_lotes jsonb := coalesce(p_lotes, '[]'::jsonb);
  v_soma_lotes integer;
  v_lote record;
  v_existente_id uuid;
  v_existente_qtd integer;
begin
  -- 0. Validade obrigatória: produto existente lê controla_validade; produto
  --    novo nasce com o default da coluna (true).
  if v_produto_id is not null then
    select p.controla_validade into v_controla
      from public.produtos p
     where p.id = v_produto_id;
  end if;
  v_controla := coalesce(v_controla, true);

  if v_controla then
    for v_lote in select * from jsonb_to_recordset(v_lotes) as x(data_validade date, quantidade integer)
    loop
      if v_lote.data_validade is null or v_lote.quantidade is null or v_lote.quantidade <= 0 then
        raise exception 'Lote inválido (data e quantidade > 0 são obrigatórios)' using errcode = 'NOT01';
      end if;
    end loop;

    select coalesce(sum(x.quantidade), 0) into v_soma_lotes
      from jsonb_to_recordset(v_lotes) as x(data_validade date, quantidade integer);

    if v_soma_lotes = 0 then
      raise exception 'Informe a validade das % unidades', p_quantidade using errcode = 'NOT01';
    end if;
    if v_soma_lotes <> p_quantidade then
      raise exception 'As validades somam % mas a entrada é de % unidades', v_soma_lotes, p_quantidade using errcode = 'NOT01';
    end if;
  end if;

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
  if v_controla then
    for v_lote in select * from jsonb_to_recordset(v_lotes) as x(data_validade date, quantidade integer)
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
