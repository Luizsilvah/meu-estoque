import { createClient } from '@supabase/supabase-js'

export async function GET() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY

  if (!url || !key) {
    return Response.json(
      { erro: 'SUPABASE_URL ou SUPABASE_ANON_KEY não definidas no .env.local' },
      { status: 500 }
    )
  }

  const supabase = createClient(url, key)
  const { data, error } = await supabase
    .from('estoque')
    .select('*, produtos(nome, unidade, fornecedores(nome))')

  if (error) {
    return Response.json({ erro: error.message }, { status: 500 })
  }

  return Response.json(data)
}
