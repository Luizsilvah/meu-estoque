-- Função para "Zerar todo o estoque" — usada pelo botão admin da tela de
-- Conferência via POST /api/estoque/zerar.
--
-- Por que uma função de banco e não duas chamadas na rota: a ação faz DUAS
-- escritas (zerar qtd_atual/qtd_cozinha de todos os produtos + apagar todas as
-- validades). Feitas separadamente pela rota, uma falha no meio deixa o estado
-- inconsistente (estoque zerado, validades ainda lá). O corpo de uma função
-- plpgsql roda dentro da transação da própria chamada RPC: se o DELETE falhar,
-- o UPDATE faz rollback junto. Ou faz tudo, ou não faz nada.
--
-- O que NÃO é tocado: qtd_base / qtd_max (mínimo e máximo) da tabela estoque,
-- e a tabela produtos (nenhum produto é apagado).
--
-- Autorização (login + perfil = 'admin' + conferência da senha de login do
-- admin) é feita na rota, antes de chamar esta função — igual ao resto do app.
-- A função é chamada com a service_role key, que ignora RLS.

create or replace function public.estoque_zerar_tudo()
returns table (
  produtos_zerados integer,
  validades_apagadas integer
)
language plpgsql
as $$
declare
  v_produtos integer;
  v_validades integer;
begin
  update estoque
     set qtd_atual = 0,
         qtd_cozinha = 0,
         atualizado_em = now();
  get diagnostics v_produtos = row_count;

  delete from validades;
  get diagnostics v_validades = row_count;

  return query select v_produtos, v_validades;
end;
$$;

alter function public.estoque_zerar_tudo() set search_path = public;

grant execute on function public.estoque_zerar_tudo() to service_role;
