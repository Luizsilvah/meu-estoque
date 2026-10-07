// Interpretador do Lançamento rápido (app/lancamento-rapido). Transforma o texto
// livre que o funcionário anota durante o dia ("usei 10 leite cozinha, chegou 5
// casquinha 15/01") numa lista de lançamentos. SEM IA: só regras + busca
// aproximada no catálogo. Função pura (sem fetch, sem React, sem imports) —
// roda no navegador e no script scripts/testar-interpretador.js.
//
// Nada aqui grava no banco: o resultado é só uma sugestão que o usuário confere
// na tela antes de lançar.

export type TipoLancamento = 'entrada' | 'saida' | 'transferencia'
export type Local = 'principal' | 'cozinha'

export type ProdutoCatalogo = { produto_id: string; nome: string }
export type Candidato = { produto_id: string; nome: string; score: number }

export type ItemInterpretado = {
  texto_original: string
  /** null = nenhuma palavra-chave → a tela pergunta o tipo. */
  tipo: TipoLancamento | null
  /** Tipo veio do item anterior da mesma linha ("usei 10 leite, 5 casquinha"). */
  tipo_herdado: boolean
  /** null = não reconhecido ou ambíguo (ver candidatos). */
  produto_id: string | null
  produto_nome: string | null
  /** 0 a 1 — nota do melhor candidato. */
  confianca: number
  /** Ambíguo/confiança baixa: até 3 candidatos ("QUAL?"). Vazio quando reconheceu. */
  candidatos: Candidato[]
  /** Texto do produto que sobrou depois de tirar tipo, número, data e ligações. */
  termo: string
  quantidade: number
  /** Saída: de onde sai. Entrada: sempre principal (igual à Movimentação). */
  local: Local
  /** Só na transferência. */
  origem: Local | null
  destino: Local | null
  /** YYYY-MM-DD — usada na entrada. */
  data_validade: string | null
}

// ── Normalização ──

export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function tokenizar(s: string): string[] {
  return normalizar(s).split(/[^a-z0-9]+/).filter(Boolean)
}

/** Plural simples: casquinhas → casquinha, limoes → limao. */
function singular(t: string): string {
  if (t.length > 4 && t.endsWith('oes')) return t.slice(0, -3) + 'ao'
  if (t.length > 4 && t.endsWith('aes')) return t.slice(0, -3) + 'ao'
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') && !/\d/.test(t)) return t.slice(0, -1)
  return t
}

// ── Palavras-chave ──

const PALAVRAS_TIPO: Record<string, TipoLancamento> = {}
function registrar(tipo: TipoLancamento, palavras: string[]) {
  for (const p of palavras) PALAVRAS_TIPO[p] = tipo
}
registrar('saida', ['usei', 'usou', 'usamos', 'peguei', 'pegou', 'pegamos', 'gastei', 'gastou', 'gastamos', 'saiu', 'sairam',
  'saida', 'tirei', 'tirou', 'tiramos', 'baixa', 'perdi', 'perdeu', 'perdemos', 'joguei', 'jogou', 'jogamos', 'vendi', 'vendeu'])
registrar('entrada', ['chegou', 'chegaram', 'chegada', 'recebi', 'recebeu', 'recebemos', 'comprei', 'comprou', 'compramos',
  'entrou', 'entraram', 'entrada'])
registrar('transferencia', ['passei', 'passou', 'passamos', 'transferi', 'transferiu', 'transferimos', 'levei', 'levou',
  'levamos', 'mandei', 'mandou', 'mandamos', 'transferencia', 'transf'])

const NUMEROS_EXTENSO: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
}

// Palavras de ligação/ruído — tiradas do texto do produto (e dos nomes do catálogo).
const LIGACAO = new Set([
  'de', 'da', 'do', 'das', 'dos', 'd', 'pra', 'pro', 'pras', 'pros', 'para', 'p', 'o', 'a', 'os', 'as', 'ao', 'aos',
  'no', 'na', 'nos', 'nas', 'em', 'e', 'com', 'pela', 'pelo', 'mais', 'fora', 'hoje', 'ontem', 'agora', 'usar', 'uso',
  'un', 'und', 'unid', 'uni', 'unidade', 'unidades', 'x', 'validade', 'val', 'vence', 'venc', 'vencimento',
  'cozinha', 'coz', 'principal', 'estoque', 'deposito', 'dar', 'demos', 'dei', 'deu', 'que', 'la', 'ali', 'tb', 'tambem',
  'um', 'uma',
])

// Embalagem/medida: ignoradas na busca quando o nome do produto não tem a palavra.
const EMBALAGEM = new Set(['caixa', 'cx', 'pacote', 'pct', 'pc', 'lata', 'garrafa', 'fardo', 'pote', 'balde', 'kg', 'kilo',
  'quilo', 'litro', 'l', 'g', 'grama'])

const LOCAL_COZINHA =new Set(['cozinha', 'coz'])
const LOCAL_PRINCIPAL = new Set(['principal', 'estoque', 'deposito'])
const PREP_PARA = new Set(['pra', 'para', 'pro', 'p', 'a', 'ao', 'na', 'no'])
const PREP_DE = new Set(['da', 'do', 'de'])

// ── Separação em itens ──

function comecaNovoItem(trecho: string): boolean {
  const primeiro = tokenizar(trecho)[0]
  if (!primeiro) return false
  return primeiro in PALAVRAS_TIPO || /^\d/.test(primeiro) || primeiro in NUMEROS_EXTENSO
}

/** Quebra o texto em itens: linha, vírgula, ";" e " e " (só quando o que vem depois começa outro item). */
export function separarItens(texto: string): { texto: string; linha: number }[] {
  const itens: { texto: string; linha: number }[] = []
  texto.split(/\r?\n/).forEach((linha, idxLinha) => {
    for (const parte of linha.split(/[;,]/)) {
      const pedacos = parte.split(/\s+e\s+/i)
      let atual = pedacos[0]
      for (let i = 1; i < pedacos.length; i++) {
        if (comecaNovoItem(pedacos[i])) {
          if (atual.trim()) itens.push({ texto: atual.trim(), linha: idxLinha })
          atual = pedacos[i]
        } else {
          atual += ' e ' + pedacos[i]
        }
      }
      if (atual.trim()) itens.push({ texto: atual.trim(), linha: idxLinha })
    }
  })
  return itens
}

// ── Datas ──

function dataISO(ano: number, mes: number, dia: number): string | null {
  const d = new Date(ano, mes - 1, dia)
  if (d.getFullYear() !== ano || d.getMonth() !== mes - 1 || d.getDate() !== dia) return null
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

/** dd/mm, dd/mm/aa, dd/mm/aaaa (também com "-"). Sem ano = a próxima data futura (hoje conta). */
function extrairData(texto: string, hoje: Date): { data: string | null; resto: string } {
  let data: string | null = null
  const re = /(^|[^\d])(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}|\d{2}))?(?!\d)/g
  const resto = texto.replace(re, (_m, antes: string, d: string, m: string, a?: string) => {
    if (data == null) {
      const dia = Number(d), mes = Number(m)
      if (a) {
        data = dataISO(a.length === 2 ? 2000 + Number(a) : Number(a), mes, dia)
      } else {
        const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
        const desteAno = dataISO(base.getFullYear(), mes, dia)
        data = desteAno && new Date(desteAno + 'T00:00:00') >= base ? desteAno : dataISO(base.getFullYear() + 1, mes, dia)
      }
    }
    return antes + ' '
  })
  return { data, resto }
}

// ── Busca aproximada ──

function levenshtein(a: string, b: string): number {
  const linha = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let anterior = linha[0]
    linha[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = linha[j]
      linha[j] = Math.min(linha[j] + 1, linha[j - 1] + 1, anterior + (a[i - 1] === b[j - 1] ? 0 : 1))
      anterior = tmp
    }
  }
  return linha[b.length]
}

/** Parecença entre uma palavra digitada (q) e uma palavra do nome do produto (p). */
function similaridade(q: string, p: string): number {
  if (q === p) return 1
  if (q.length >= 3 && p.startsWith(q)) return 0.9 // "choc" → chocolate, "300" → 300ml
  if (p.length >= 3 && q.startsWith(p)) return 0.8
  if (q.length >= 4 && p.length >= 4) {
    const limite = Math.max(q.length, p.length) >= 7 ? 2 : 1
    const d = levenshtein(q, p)
    if (d <= limite) return 0.85 - (d - 1) * 0.05 // erro de digitação: casquina → casquinha
  }
  return 0
}

function palavrasProduto(nome: string): string[] {
  return tokenizar(nome).filter((t) => !LIGACAO.has(t)).map(singular)
}

type Indice = { produto: ProdutoCatalogo; palavras: string[]; junto: string }
const cacheIndice = new WeakMap<ProdutoCatalogo[], Indice[]>()
function indexar(catalogo: ProdutoCatalogo[]): Indice[] {
  let idx = cacheIndice.get(catalogo)
  if (!idx) {
    idx = catalogo.map((produto) => {
      const palavras = palavrasProduto(produto.nome)
      return { produto, palavras, junto: palavras.join(' ') }
    })
    cacheIndice.set(catalogo, idx)
  }
  return idx
}

function pontuar(q: string[], item: Indice): number {
  const { palavras: p } = item
  if (!q.length || !p.length) return 0
  if (q.join(' ') === item.junto) return 1
  let soma = 0, contadas = 0
  const usadas = new Set<number>()
  q.forEach((palavra) => {
    let melhor = 0, melhorIdx = -1
    p.forEach((pp, i) => {
      const s = similaridade(palavra, pp)
      if (s > melhor) { melhor = s; melhorIdx = i }
    })
    // "caixa", "pacote"... só contam quando fazem parte do nome do produto.
    if (melhor === 0 && EMBALAGEM.has(palavra)) return
    soma += melhor
    contadas++
    if (melhorIdx >= 0) usadas.add(melhorIdx)
  })
  if (!contadas) return 0
  const cobertura = soma / contadas // quanto do que foi digitado o produto explica
  const precisao = usadas.size / p.length // quanto do nome foi citado (desempata "leite" x "leite em pó")
  const bonusInicio = similaridade(q[0], p[0]) > 0 ? 0.02 : 0
  return Math.min(1, 0.8 * cobertura + 0.2 * precisao + bonusInicio)
}

/** Produtos mais parecidos com o termo, do melhor para o pior. */
export function buscarProdutos(termo: string, catalogo: ProdutoCatalogo[], opcoes: { limite?: number; minimo?: number } = {}): Candidato[] {
  const { limite = 5, minimo = 0.35 } = opcoes
  const q = tokenizar(termo).filter((t) => !LIGACAO.has(t)).map(singular)
  if (!q.length) return []
  return indexar(catalogo)
    .map((item) => ({ produto_id: item.produto.produto_id, nome: item.produto.nome, score: pontuar(q, item) }))
    .filter((c) => c.score >= minimo)
    .sort((a, b) => b.score - a.score || a.nome.length - b.nome.length || a.nome.localeCompare(b.nome, 'pt-BR'))
    .slice(0, limite)
}

/** Chave usada para lembrar a escolha do usuário ("leite" → Leite líquido). */
export function chaveApelido(termo: string): string {
  return tokenizar(termo).filter((t) => !LIGACAO.has(t)).map(singular).join(' ')
}

const CONFIANCA_MINIMA = 0.7
const MARGEM_EMPATE = 0.05

// ── Interpretação ──

function interpretarItem(texto: string, catalogo: ProdutoCatalogo[], hoje: Date, apelidos: Record<string, string>): Omit<ItemInterpretado, 'tipo_herdado'> {
  const { data, resto } = extrairData(normalizar(texto), hoje)
  let tokens = tokenizar(resto)

  // Tipo: primeira palavra-chave que aparecer.
  let tipo: TipoLancamento | null = null
  for (const t of tokens) {
    if (t in PALAVRAS_TIPO) { tipo = PALAVRAS_TIPO[t]; break }
  }
  tokens = tokens.filter((t) => !(t in PALAVRAS_TIPO))

  // Local / direção — olha a palavra antes de "cozinha"/"principal".
  let paraCozinha = false, deCozinha = false, paraPrincipal = false, temCozinha = false
  tokens.forEach((t, i) => {
    const antes = tokens[i - 1] ?? ''
    if (LOCAL_COZINHA.has(t)) {
      temCozinha = true
      if (PREP_PARA.has(antes)) paraCozinha = true
      if (PREP_DE.has(antes)) deCozinha = true
    }
    if (LOCAL_PRINCIPAL.has(t) && PREP_PARA.has(antes)) paraPrincipal = true
  })

  // Quantidade: primeiro número (10, 10x, x10, 10un); senão um..dez por extenso; senão 1.
  let quantidade = 1
  let idxQtd = tokens.findIndex((t) => /^(\d+)(x|un|und|unid|uni|pct|cx)?$/.test(t) || /^x\d+$/.test(t))
  if (idxQtd >= 0) {
    quantidade = Number(tokens[idxQtd].replace(/\D/g, ''))
  } else {
    idxQtd = tokens.findIndex((t) => t in NUMEROS_EXTENSO)
    if (idxQtd >= 0) quantidade = NUMEROS_EXTENSO[tokens[idxQtd]]
  }
  if (idxQtd >= 0) tokens = tokens.filter((_, i) => i !== idxQtd)
  if (!Number.isFinite(quantidade) || quantidade < 1) quantidade = 1

  let local: Local = 'principal'
  let origem: Local | null = null
  let destino: Local | null = null
  if (tipo === 'transferencia') {
    if (paraCozinha) destino = 'cozinha'
    else if (paraPrincipal || deCozinha) destino = 'principal'
    else destino = 'cozinha' // "levei 2 leite" / "passei 2 leite cozinha": o comum é ir pra cozinha
    origem = destino === 'cozinha' ? 'principal' : 'cozinha'
    local = origem
  } else if (tipo === 'saida' || tipo === null) {
    local = temCozinha ? 'cozinha' : 'principal'
  }

  const palavras = tokens.filter((t) => !LIGACAO.has(t))
  const termo = palavras.join(' ')

  const base = {
    texto_original: texto, tipo, termo, quantidade, local, origem, destino,
    data_validade: data,
  }

  // Escolha lembrada antes ("leite" → Leite líquido).
  const apelido = apelidos[chaveApelido(termo)]
  const produtoApelido = apelido ? catalogo.find((p) => p.produto_id === apelido) : undefined
  if (produtoApelido) {
    return { ...base, produto_id: produtoApelido.produto_id, produto_nome: produtoApelido.nome, confianca: 1, candidatos: [] }
  }

  const achados = buscarProdutos(termo, catalogo, { limite: 10, minimo: 0.35 })
  const [melhor, segundo] = achados
  if (melhor && melhor.score >= CONFIANCA_MINIMA && (!segundo || melhor.score - segundo.score >= MARGEM_EMPATE)) {
    return { ...base, produto_id: melhor.produto_id, produto_nome: melhor.nome, confianca: melhor.score, candidatos: [] }
  }
  // Ambíguo ou fraco: devolve os mais próximos do melhor ("QUAL?").
  const corte = melhor ? Math.max(0.35, melhor.score - 0.15) : 1
  return {
    ...base, produto_id: null, produto_nome: null, confianca: melhor?.score ?? 0,
    candidatos: achados.filter((c) => c.score >= corte).slice(0, 3),
  }
}

/**
 * Interpreta o texto inteiro. Item sem palavra-chave herda o tipo do item
 * anterior da mesma linha ("usei 10 leite, 5 casquinha" → as duas são saída);
 * o primeiro item de cada linha sem palavra fica com tipo null.
 */
export function interpretarLancamento(
  texto: string,
  catalogo: ProdutoCatalogo[],
  opcoes: { hoje?: Date; apelidos?: Record<string, string> } = {},
): ItemInterpretado[] {
  const hoje = opcoes.hoje ?? new Date()
  const apelidos = opcoes.apelidos ?? {}
  const resultado: ItemInterpretado[] = []
  let linhaAnterior = -1
  let tipoAnterior: TipoLancamento | null = null
  for (const { texto: trecho, linha } of separarItens(texto)) {
    if (linha !== linhaAnterior) { tipoAnterior = null; linhaAnterior = linha }
    const item = interpretarItem(trecho, catalogo, hoje, apelidos)
    let tipo_herdado = false
    if (item.tipo === null && tipoAnterior !== null) {
      // Refaz com o tipo herdado para acertar local/direção.
      const comTipo = interpretarItem(`${palavraDoTipo(tipoAnterior)} ${trecho}`, catalogo, hoje, apelidos)
      Object.assign(item, { ...comTipo, texto_original: trecho })
      tipo_herdado = true
    }
    if (item.tipo === 'entrada') item.local = 'principal'
    tipoAnterior = item.tipo
    resultado.push({ ...item, tipo_herdado })
  }
  return resultado
}

function palavraDoTipo(tipo: TipoLancamento): string {
  return tipo === 'saida' ? 'usei' : tipo === 'entrada' ? 'chegou' : 'passei'
}
