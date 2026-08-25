import { createSupabaseAdmin } from '../../../lib/supabase-admin'
import { createSupabaseServer } from '../../../lib/supabase-server'

async function autenticar() {
  const s = await createSupabaseServer()
  const { data: { user } } = await s.auth.getUser()
  return user
}

export async function GET() {
  if (!await autenticar()) return Response.json({ erro: 'Não autenticado' }, { status: 401 })

  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase
    .from('fornecedores')
    .select('id, nome')
    .order('nome')

  if (error) return Response.json({ erro: error.message }, { status: 500 })

  // Deduplica por nome (mantém o primeiro id encontrado para cada nome)
  const vistos = new Set<string>()
  const unicos = (data ?? []).filter((f) => {
    const chave = f.nome.trim().toLowerCase()
    if (vistos.has(chave)) return false
    vistos.add(chave)
    return true
  })

  return Response.json(unicos)
}

export async function DELETE(request: Request) {
  if (!await autenticar()) return Response.json({ erro: 'Não autenticado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return Response.json({ erro: 'id obrigatório' }, { status: 400 })

  const supabase = createSupabaseAdmin()
  const { error } = await supabase.from('fornecedores').delete().eq('id', id)
  if (error) return Response.json({ erro: error.message }, { status: 500 })
  return Response.json({ ok: true })
}

export async function PATCH(request: Request) {
  if (!await autenticar()) return Response.json({ erro: 'Não autenticado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const { id, nome } = body ?? {}
  if (!id || !nome?.trim()) return Response.json({ erro: 'id e nome obrigatórios' }, { status: 400 })

  const supabase = createSupabaseAdmin()
  const { error } = await supabase.from('fornecedores').update({ nome: nome.trim() }).eq('id', id)
  if (error) return Response.json({ erro: error.message }, { status: 500 })
  return Response.json({ ok: true })
}

export async function POST(request: Request) {
  if (!await autenticar()) return Response.json({ erro: 'Não autenticado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const nome = body?.nome?.trim()
  if (!nome) return Response.json({ erro: 'Nome é obrigatório' }, { status: 400 })

  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase
    .from('fornecedores')
    .insert({ nome })
    .select('id, nome')
    .single()

  if (error) return Response.json({ erro: error.message }, { status: 500 })
  return Response.json(data, { status: 201 })
}
