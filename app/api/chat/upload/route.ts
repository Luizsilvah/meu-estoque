import { createSupabaseServer } from '../../../lib/supabase-server'
import { createSupabaseAdmin } from '../../../lib/supabase-admin'

export async function POST(request: Request) {
  const server = await createSupabaseServer()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return Response.json({ erro: 'Não autenticado' }, { status: 401 })

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return Response.json({ erro: 'FormData inválido' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file || file.size === 0) return Response.json({ erro: 'Arquivo não encontrado' }, { status: 400 })

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const nome = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)

  const admin = createSupabaseAdmin()
  const { error: uploadError } = await admin.storage
    .from('chat')
    .upload(nome, bytes, { contentType: file.type || 'image/jpeg', upsert: false })

  if (uploadError) {
    console.error('[chat/upload] erro no storage:', JSON.stringify(uploadError))
    return Response.json({ erro: uploadError.message, detalhes: uploadError }, { status: 500 })
  }

  const { data: { publicUrl } } = admin.storage.from('chat').getPublicUrl(nome)
  return Response.json({ url: publicUrl })
}
