-- Sincronia estoque x validades na Movimentação (entrada/saída manual e scanner).
--
-- Antes: /api/movimentacao fazia insert em movimentacoes + RPC
-- estoque_aplicar_movimentacao (2 chamadas), e a tela ainda fazia 1 chamada a
-- /api/validades por lote (POST/PATCH/DELETE), ignorando falhas. Qualquer
-- falha no meio deixava qtd_atual diferente da soma dos lotes.
--
-- Agora: tudo numa função só (1 transação), no mesmo padrão de
-- conferencia_ajustar (supabase/migrations/20261003120000_conferencia_ajustar.sql).
--
-- p_tipo 'entrada' | 'saida' → vira movimentacoes.tipo; motivo fica null, então
--   continua contando no consumo médio de vw_previsao_compras (só 'correcao'
--   é ignorado lá).
-- p_quantidade > 0 → entrada soma, saída subtrai de qtd_atual.
-- p_delta_cozinha → quanto muda qtd_cozinha (saída da cozinha = -p_quantidade;
--   entrada/saída do principal = 0).
-- p_lotes_add [{"data_validade":"YYYY-MM-DD","quantidade":n}] — só na entrada.
-- p_lotes_remover [{"validade_id":"uuid","quantidade":n}] — só na saída.
--
-- Regras de lote (além das mesmas da conferencia_ajustar — nunca negativo,
-- lote tem que ser do produto, CNF04/05/06):
--   entrada: produto com lote cadastrado → lotes têm que somar a quantidade;
--            produto sem nenhum lote → lote opcional (0 ou soma = quantidade).
--   saída:   lotes removidos têm que somar min(quantidade, soma dos lotes) —
--            se os lotes somam menos que a saída (dado já divergente), tira
--            tudo dos lotes e o resto sai sem lote, igual à conferência.
--
-- #variable_conflict use_column: as colunas de retorno (qtd_atual,
-- qtd_cozinha, qtd_base) têm o mesmo nome das colunas de public.estoque.
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
  if p_tipo = 'entrada' and jsonb_array_length(coalesce(p_lotes_remover, '[]'::jsonb)) > 0 then
    raise exception 'Entrada não remove lotes' using errcode = 'MOV03';
  end if;
  if p_tipo = 'saida' and jsonb_array_length(coalesce(p_lotes_add, '[]'::jsonb)) > 0 then
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

  -- Conferência da soma dos lotes contra a quantidade movimentada.
  select count(*), coalesce(sum(v.quantidade), 0) into v_n_lotes, v_soma_lotes
    from public.validades v
   where v.produto_id = p_produto_id;

  select coalesce(sum(x.quantidade), 0) into v_soma_add
    from jsonb_to_recordset(coalesce(p_lotes_add, '[]'::jsonb)) as x(data_validade date, quantidade integer);
  select coalesce(sum(x.quantidade), 0) into v_soma_rem
    from jsonb_to_recordset(coalesce(p_lotes_remover, '[]'::jsonb)) as x(validade_id uuid, quantidade integer);

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

  -- Quantidade: reaproveita a função atômica já existente.
  select r.qtd_atual, r.qtd_cozinha, r.qtd_base into v_novo_atual, v_novo_cozinha, v_base
    from public.estoque_aplicar_movimentacao(
      p_produto_id,
      case when p_tipo = 'entrada' then p_quantidade else -p_quantidade end,
      v_delta_cozinha
    ) r;

  insert into public.movimentacoes (produto_id, tipo, quantidade, data_hora, usuario_id, usuario_nome, motivo)
  values (p_produto_id, p_tipo, p_quantidade, now(), p_usuario_id, p_usuario_nome, null);

  -- Lotes: mesmas regras e erros de conferencia_ajustar.
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

  return query select v_novo_atual, v_novo_cozinha, v_base;
end;
$$;

alter function public.movimentacao_registrar(uuid, text, integer, integer, jsonb, jsonb, uuid, text)
  set search_path = public;

revoke execute on function public.movimentacao_registrar(uuid, text, integer, integer, jsonb, jsonb, uuid, text)
  from public, anon, authenticated;
grant execute on function public.movimentacao_registrar(uuid, text, integer, integer, jsonb, jsonb, uuid, text)
  to service_role;
