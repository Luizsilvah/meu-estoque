-- Corrige o aviso do linter "Function Search Path Mutable" nas funções de
-- estoque atômico (supabase/migrations/20260825120000_estoque_atomic_updates.sql).
-- Sem search_path fixo, uma função SECURITY DEFINER/INVOKER resolve nomes de
-- tabela conforme o search_path de quem chama, o que abre brecha para
-- shadowing malicioso (ex.: criar um schema com uma tabela "estoque" falsa
-- que entre antes de public no search_path). Fixar em "public" remove essa
-- ambiguidade sem alterar nenhuma lógica das funções.

alter function public.estoque_aplicar_movimentacao(uuid, integer, integer)
  set search_path = public;

alter function public.estoque_transferir(uuid, integer, text)
  set search_path = public;
