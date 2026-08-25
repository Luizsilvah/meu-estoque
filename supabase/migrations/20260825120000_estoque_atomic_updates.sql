-- Funções atômicas para atualização de estoque — evitam a corrida (TOCTOU) que
-- existia quando a rota lia qtd_atual/qtd_cozinha, calculava em JS e regravava.
-- Cada função faz leitura (com lock de linha via FOR UPDATE), validação e escrita
-- dentro da mesma transação implícita da chamada RPC.

create or replace function public.estoque_aplicar_movimentacao(
  p_produto_id uuid,
  p_delta_atual integer,
  p_delta_cozinha integer default 0
)
returns table (
  qtd_atual estoque.qtd_atual%type,
  qtd_cozinha estoque.qtd_cozinha%type,
  qtd_base estoque.qtd_base%type
)
language plpgsql
as $$
declare
  v_atual estoque.qtd_atual%type;
  v_cozinha estoque.qtd_cozinha%type;
  v_base estoque.qtd_base%type;
begin
  select e.qtd_atual, e.qtd_cozinha, e.qtd_base
    into v_atual, v_cozinha, v_base
    from estoque e
   where e.produto_id = p_produto_id
   for update;

  if not found then
    raise exception 'Produto não encontrado no estoque'
      using errcode = 'ESTK1';
  end if;

  v_atual := greatest(0, v_atual + p_delta_atual);
  v_cozinha := greatest(0, v_cozinha + p_delta_cozinha);

  update estoque e
     set qtd_atual = v_atual,
         qtd_cozinha = v_cozinha,
         atualizado_em = now()
   where e.produto_id = p_produto_id;

  return query select v_atual, v_cozinha, v_base;
end;
$$;

grant execute on function public.estoque_aplicar_movimentacao(uuid, integer, integer) to service_role;


create or replace function public.estoque_transferir(
  p_produto_id uuid,
  p_quantidade integer,
  p_direction text default 'cozinha'
)
returns table (
  qtd_atual estoque.qtd_atual%type,
  qtd_cozinha estoque.qtd_cozinha%type
)
language plpgsql
as $$
declare
  v_atual estoque.qtd_atual%type;
  v_cozinha estoque.qtd_cozinha%type;
  v_principal estoque.qtd_atual%type;
  v_nova_cozinha estoque.qtd_cozinha%type;
begin
  select e.qtd_atual, e.qtd_cozinha
    into v_atual, v_cozinha
    from estoque e
   where e.produto_id = p_produto_id
   for update;

  if not found then
    raise exception 'Produto não encontrado'
      using errcode = 'ESTK1';
  end if;

  v_principal := v_atual - v_cozinha;

  if p_direction = 'cozinha' then
    if p_quantidade > v_principal then
      raise exception 'Estoque principal insuficiente. Disponível: %', v_principal
        using errcode = 'ESTK2';
    end if;
    v_nova_cozinha := v_cozinha + p_quantidade;
  else
    if p_quantidade > v_cozinha then
      raise exception 'Estoque na cozinha insuficiente. Disponível: %', v_cozinha
        using errcode = 'ESTK2';
    end if;
    v_nova_cozinha := v_cozinha - p_quantidade;
  end if;

  update estoque e
     set qtd_cozinha = v_nova_cozinha,
         atualizado_em = now()
   where e.produto_id = p_produto_id;

  return query select v_atual, v_nova_cozinha;
end;
$$;

grant execute on function public.estoque_transferir(uuid, integer, text) to service_role;
