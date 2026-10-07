import { createSupabaseAdmin } from '../../lib/supabase-admin'
import { createSupabaseServer } from '../../lib/supabase-server'

async function autenticar() {
  const s = await createSupabaseServer()
  const { data: { user } } = await s.auth.getUser()
  return user
}

export async function GET(request: Request) {
  if (!await autenticar()) return Response.json({ erro: 'Não autenticado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const produto_id = searchParams.get('produto_id')
  if (!produto_id) return Response.json({ erro: 'produto_id obrigatório' }, { status: 400 })

  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from('validades')
    .select('id, produto_id, data_validade, quantidade')
    .eq('produto_id', produto_id)
    .order('data_validade', { ascending: true })

  if (error) return Response.json({ erro: error.message }, { status: 500 })
  return Response.json(data)
}

export async function POST(request: Request) {
  if (!await autenticar()) return Response.json({ erro: 'Não autenticado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const { produto_id, data_validade, quantidade } = body ?? {}
  if (!produto_id || !data_validade) {
    return Response.json({ erro: 'produto_id e data_validade são obrigatórios' }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const { data: produto } = await admin.from('produtos').select('controla_validade').eq('id', produto_id).maybeSingle()
  if (produto?.controla_validade === false) {
    return Response.json({ erro: 'Este produto não controla validade' }, { status: 400 })
  }
  const { data, error } = await admin
    .from('validades')
    .insert({ produto_id, data_validade, quantidade: Number(quantidade) || 1 })
    .select()
    .single()

  if (error) return Response.json({ erro: error.message }, { status: 500 })
  return Response.json(data, { status: 201 })
}

export async function PATCH(request: Request) {
  if (!await autenticar()) return Response.json({ erro: 'Não autenticado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const { id, quantidade } = body ?? {}
  if (!id) return Response.json({ erro: 'id obrigatório' }, { status: 400 })

  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from('validades')
    .update({ quantidade: Math.max(1, Number(quantidade) || 1) })
    .eq('id', id)
    .select()
    .single()

  if (error) return Response.json({ erro: error.message }, { status: 500 })
  return Response.json(data)
}

export async function DELETE(request: Request) {
  if (!await autenticar()) return Response.json({ erro: 'Não autenticado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return Response.json({ erro: 'id obrigatório' }, { status: 400 })

  const admin = createSupabaseAdmin()
  const { error } = await admin.from('validades').delete().eq('id', id)
  if (error) return Response.json({ erro: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
