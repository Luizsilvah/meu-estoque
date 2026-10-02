'use client'

// Cache em memória de /api/estoque, compartilhado entre TODAS as páginas que
// consomem essa rota (é a mais chamada do app — ver diagnóstico de performance).
// Troca de tela no App Router é navegação client-side: este módulo continua
// vivo, então o cache persiste entre páginas (não é por-página).
//
// Por que em memória e não SWR: o projeto não tinha SWR instalado, e um cache
// deste tamanho (1 chave, 1 TTL, invalidação manual) não justifica a dependência
// nova — iria pesar mais no bundle do que resolve.
//
// TTL curto (30s) porque o estoque muda a cada movimentação — não é dado que
// vale a pena cachear por muito tempo, só o suficiente pra não rebuscar a
// lista inteira ao trocar de aba/tela em sequência rápida.

type ItemEstoqueBruto = Record<string, unknown>

const TTL_MS = 30_000

let cache: { dados: ItemEstoqueBruto[]; expiraEm: number } | null = null
let emVoo: Promise<ItemEstoqueBruto[]> | null = null

/**
 * Busca /api/estoque usando o cache de até 30s quando existir um válido.
 * `forcar: true` ignora o cache e busca na hora (usado por quem precisa do
 * dado mais fresco possível, ex.: logo após salvar algo nesta mesma tela).
 */
export async function buscarEstoque(forcar = false): Promise<ItemEstoqueBruto[]> {
  if (!forcar && cache && Date.now() < cache.expiraEm) return cache.dados
  if (!forcar && emVoo) return emVoo // já tem uma busca em andamento — reaproveita em vez de duplicar

  emVoo = fetch('/api/estoque')
    .then(async (res) => {
      const json = await res.json()
      if (!res.ok || !Array.isArray(json)) throw new Error(json?.erro ?? 'Erro ao buscar estoque')
      cache = { dados: json, expiraEm: Date.now() + TTL_MS }
      return json
    })
    .finally(() => { emVoo = null })

  return emVoo
}

/** Chamar depois de qualquer escrita que mude qtd_atual/qtd_base/qtd_max/qtd_cozinha
 *  ou crie/apague um produto — movimentação, nota, transferência, conferência,
 *  zerar estoque, editar/criar/apagar produto. */
export function invalidarEstoqueCache() {
  cache = null
}
