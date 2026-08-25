import { createSupabaseAdmin } from '@/app/lib/supabase-admin'
import { createSupabaseServer } from '@/app/lib/supabase-server'

const BUCKET = 'produtos'

export async function POST(request: Request) {
  const server = await createSupabaseServer()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return Response.json({ erro: 'Não autenticado' }, { status: 401 })
  let formData: FormData
  try { formData = await request.formData() } catch {
    return Response.json({ erro: 'FormData inválido' }, { status: 400 })
  }

  const file = formData.get('foto') as File | null
  const produto_id = formData.get('produto_id') as string | null
  if (!file || !produto_id) {
    return Response.json({ erro: 'foto e produto_id são obrigatórios' }, { status: 400 })
  }

  const supabase = createSupabaseAdmin()

  // Cria bucket público se ainda não existir; ignora erro de "já existe"
  const { error: erroBucket } = await supabase.storage.createBucket(BUCKET, { public: true })
  if (erroBucket) {
    const { error: erroList } = await supabase.storage.from(BUCKET).list('', { limit: 1 })
    if (erroList) return Response.json({ erro: 'Bucket inacessível: ' + erroBucket.message }, { status: 500 })
  }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const path = `${produto_id}/foto.${ext}`
  const bytes = await file.arrayBuffer()

  const { error: erroUpload } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: true })

  if (erroUpload) return Response.json({ erro: erroUpload.message }, { status: 500 })

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path)

  const { error: erroUpdate } = await supabase
    .from('produtos')
    .update({ foto_url: publicUrl })
    .eq('id', produto_id)

  if (erroUpdate) return Response.json({ erro: erroUpdate.message }, { status: 500 })

  return Response.json({ ok: true, foto_url: publicUrl })
}
