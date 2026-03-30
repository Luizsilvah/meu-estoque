import { createClient } from '@supabase/supabase-js'

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    return Response.json({ ok: false, erro: 'Variáveis de ambiente não definidas' }, { status: 500 })
  }

  const supabase = createClient(url, key)

  // Busca amostra de cada tabela para revelar colunas disponíveis
  const [estoque, produtos, fornecedores, join] = await Promise.all([
    supabase.from('estoque').select('*').limit(2),
    supabase.from('produtos').select('*').limit(2),
    supabase.from('fornecedores').select('*').limit(2),
    supabase.from('estoque').select('*, produtos(*, fornecedores(*))').limit(2),
  ])

  return Response.json({
    estoque: {
      colunas: estoque.data?.[0] ? Object.keys(estoque.data[0]) : [],
      amostra: estoque.data,
      erro: estoque.error?.message,
    },
    produtos: {
      colunas: produtos.data?.[0] ? Object.keys(produtos.data[0]) : [],
      amostra: produtos.data,
      erro: produtos.error?.message,
    },
    fornecedores: {
      colunas: fornecedores.data?.[0] ? Object.keys(fornecedores.data[0]) : [],
      amostra: fornecedores.data,
      erro: fornecedores.error?.message,
    },
    join_resultado: {
      amostra: join.data,
      erro: join.error?.message,
    },
  })
}
