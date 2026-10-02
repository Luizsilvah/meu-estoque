// Comprime/redimensiona uma imagem NO CLIENTE antes do upload — roda no celular
// de quem está tirando a foto, não no servidor. Evita subir fotos de câmera de
// vários MB (chat e foto de produto) e não depende de nenhuma lib nativa tipo
// `sharp` (que não funciona bem em ambiente serverless/edge).
//
// Usa Canvas (suporte universal) em vez de WebP — toBlob('image/webp') ainda
// não é confiável em iOS/Safari mais antigos, que é justamente o tipo de
// aparelho usado no dia a dia de uma loja. JPEG com qualidade ~0.75 já reduz
// drasticamente o tamanho sem artefato visível nessa resolução.

const MAX_DIMENSAO = 1280
const QUALIDADE = 0.75

/**
 * Recebe um File (geralmente de <input type="file" accept="image/*">) e devolve
 * um novo File já redimensionado (maior lado <= 1280px, sem ampliar imagem
 * pequena) e recomprimido em JPEG. Se não for imagem, ou se o navegador não
 * suportar Canvas/createImageBitmap, devolve o arquivo original sem mudar nada
 * — upload nunca deveria travar por causa da otimização.
 */
export async function comprimirImagem(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  // SVG não tem o que redimensionar/recomprimir como raster
  if (file.type === 'image/svg+xml') return file

  try {
    const bitmap = await createImageBitmap(file)
    const maiorLado = Math.max(bitmap.width, bitmap.height)
    const escala = maiorLado > MAX_DIMENSAO ? MAX_DIMENSAO / maiorLado : 1
    const largura = Math.round(bitmap.width * escala)
    const altura = Math.round(bitmap.height * escala)

    const canvas = document.createElement('canvas')
    canvas.width = largura
    canvas.height = altura
    const ctx = canvas.getContext('2d')
    if (!ctx) return file

    ctx.drawImage(bitmap, 0, 0, largura, altura)
    bitmap.close?.()

    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALIDADE))
    if (!blob) return file

    // Nome fixo (.jpg) — o resultado é sempre JPEG independente do formato
    // original (heic, png, webp...), então o nome tem que refletir isso.
    const nome = file.name.replace(/\.[a-zA-Z0-9]+$/, '') + '.jpg'
    return new File([blob], nome, { type: 'image/jpeg' })
  } catch {
    // Navegador sem suporte a createImageBitmap/canvas.toBlob, imagem corrompida
    // etc. — melhor subir o original do que bloquear o usuário.
    return file
  }
}
