import Anthropic from '@anthropic-ai/sdk'
import { createSupabaseServer } from '../../lib/supabase-server'
import { createSupabaseAdmin } from '../../lib/supabase-admin'

type MediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

export async function POST(req: Request) {
  const server = await createSupabaseServer()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return Response.json({ erro: 'Não autenticado' }, { status: 401 })
  let body: { imagemBase64: string; mediaType: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ erro: 'Body inválido' }, { status: 400 })
  }

  const { imagemBase64, mediaType } = body
  if (!imagemBase64 || !mediaType) {
    return Response.json({ erro: 'imagemBase64 e mediaType são obrigatórios' }, { status: 400 })
  }

  const tiposValidos: MediaType[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  if (!tiposValidos.includes(mediaType as MediaType)) {
    return Response.json({ erro: `Tipo de imagem inválido: ${mediaType}` }, { status: 400 })
  }

  // Busca produtos cadastrados para ajudar Claude a fazer correspondência
  const admin = createSupabaseAdmin()
  const { data: estoque } = await admin
    .from('estoque')
    .select('produto_id, produtos(nome, unidade, fornecedores(nome))')

  const produtosConhecidos = (estoque ?? []).map((e: Record<string, unknown>) => {
    const p = e.produtos as Record<string, unknown> | null
    const f = p?.fornecedores as Record<string, unknown> | null
    return {
      produto_id: e.produto_id as string,
      nome: (p?.nome as string) ?? '',
      unidade: (p?.unidade as string) ?? '',
      fornecedor: (f?.nome as string) ?? '',
    }
  })

  const listaConhecida = produtosConhecidos.length > 0
    ? produtosConhecidos
        .map((p) => `ID:${p.produto_id} | ${p.nome} | ${p.unidade} | Fornecedor: ${p.fornecedor}`)
        .join('\n')
    : '(nenhum produto cadastrado ainda)'

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType as MediaType,
              data: imagemBase64,
            },
          },
          {
            type: 'text',
            text: `Analise esta nota fiscal ou recibo e extraia todos os produtos com suas quantidades.

Produtos cadastrados no sistema (tente fazer correspondência por nome similar):
${listaConhecida}

Regras:
- Extraia todos os itens que aparecem na nota
- Para cada item, tente encontrar o produto_id correspondente na lista acima (correspondência por nome similar, ignore maiúsculas/minúsculas e acentos)
- Se não encontrar correspondência, defina produto_id como null
- A quantidade deve ser um número inteiro positivo
- Se a nota mostrar peso (kg) ou volume (L), converta para inteiro arredondando

Responda APENAS com JSON válido neste formato exato (sem markdown, sem explicações):
{
  "fornecedor": "nome do fornecedor da nota ou null",
  "produtos": [
    {
      "nome_nota": "nome como aparece na nota",
      "quantidade": 10,
      "produto_id": "uuid correspondente ou null",
      "nome_sistema": "nome do produto no sistema ou null",
      "unidade": "unidade de medida ou null"
    }
  ]
}`,
          },
        ],
      },
    ],
  })

  const texto = message.content[0].type === 'text' ? message.content[0].text : ''

  // Tenta parsear diretamente, depois tenta extrair JSON do texto
  let resultado
  try {
    resultado = JSON.parse(texto)
  } catch {
    const match = texto.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        resultado = JSON.parse(match[0])
      } catch {
        return Response.json({ erro: 'Não foi possível extrair dados da nota', raw: texto }, { status: 422 })
      }
    } else {
      return Response.json({ erro: 'Não foi possível extrair dados da nota', raw: texto }, { status: 422 })
    }
  }

  return Response.json(resultado)
}
