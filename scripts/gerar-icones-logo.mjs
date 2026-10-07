#!/usr/bin/env node
// Gera os ícones do PWA e o favicon a partir do ícone do componente Logo
// (app/components/Logo.tsx): quadrado com degradê + desenho de "fluxo", sem o nome.
//
//   node scripts/gerar-icones-logo.mjs
//
// Saídas: public/icon-192.png, public/icon-512.png, app/favicon.ico
// Usa sharp (já vem em node_modules junto com o Next); não entra no bundle do app.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const logoSrc = fs.readFileSync(path.join(raiz, 'app/components/Logo.tsx'), 'utf8')

// ── Lê do componente os traços do ícone, a espessura e o degradê ────────────
const traços = [...logoSrc.matchAll(/<path d="([^"]+)"/g)].map(m => m[1])
const espessura = Number(logoSrc.match(/strokeWidth=\{([\d.]+)\}/)?.[1])
const degrade = logoSrc.match(/linear-gradient\(135deg,([^)]+)\)/)?.[1]
if (!traços.length || !espessura || !degrade) {
  throw new Error('Não consegui ler o ícone em app/components/Logo.tsx — o formato do componente mudou?')
}
// "#6366F1 0%, #8B5CF6 55%, #22D3EE 130%" → [{ cor, pos }]
const paradas = degrade.split(',').map(p => {
  const [cor, pct] = p.trim().split(/\s+/)
  return { cor, pos: parseFloat(pct) / 100 }
})
const fim = Math.max(...paradas.map(p => p.pos)) // 1.3: o degradê vai além do canto, como no CSS

// Mesmas proporções do LogoIcon: desenho = 56% do lado, cantos = 26% do lado
const ESCALA_DESENHO = 0.56
const RAIO_CANTO = 0.26

/** SVG do ícone. arredondado=false preenche o quadrado todo (o sistema aplica a máscara). */
function svgIcone(lado, { arredondado }) {
  const desenho = lado * ESCALA_DESENHO
  const deslocamento = (lado - desenho) / 2
  const escala = desenho / 24
  const raio = arredondado ? lado * RAIO_CANTO : 0
  const stops = paradas
    .map(p => `<stop offset="${(p.pos / fim).toFixed(4)}" stop-color="${p.cor}"/>`)
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}" viewBox="0 0 ${lado} ${lado}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="${fim}" y2="${fim}">${stops}</linearGradient>
  </defs>
  <rect width="${lado}" height="${lado}" rx="${raio}" ry="${raio}" fill="url(#g)"/>
  <g transform="translate(${deslocamento} ${deslocamento}) scale(${escala})" fill="none" stroke="#fff"
     stroke-width="${espessura}" stroke-linecap="round" stroke-linejoin="round">
    ${traços.map(d => `<path d="${d}"/>`).join('')}
  </g>
</svg>`
}

async function png(lado, opcoes) {
  return sharp(Buffer.from(svgIcone(lado, opcoes))).png().toBuffer()
}

/** Monta um .ico com PNGs embutidos (formato aceito por todos os navegadores atuais). */
function montarIco(imagens) {
  const cabecalho = Buffer.alloc(6)
  cabecalho.writeUInt16LE(0, 0)
  cabecalho.writeUInt16LE(1, 2) // tipo: ícone
  cabecalho.writeUInt16LE(imagens.length, 4)
  const entradas = []
  let offset = 6 + 16 * imagens.length
  for (const { lado, dados } of imagens) {
    const e = Buffer.alloc(16)
    e.writeUInt8(lado >= 256 ? 0 : lado, 0)
    e.writeUInt8(lado >= 256 ? 0 : lado, 1)
    e.writeUInt8(0, 2)   // paleta
    e.writeUInt8(0, 3)
    e.writeUInt16LE(1, 4)  // planos
    e.writeUInt16LE(32, 6) // bits por pixel
    e.writeUInt32LE(dados.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += dados.length
    entradas.push(e)
  }
  return Buffer.concat([cabecalho, ...entradas, ...imagens.map(i => i.dados)])
}

// PWA / apple-touch-icon: sem cantos transparentes — Android (maskable) e iOS recortam
// o formato sozinhos; o desenho (56%) fica dentro da zona segura de 80%.
fs.writeFileSync(path.join(raiz, 'public/icon-192.png'), await png(192, { arredondado: false }))
fs.writeFileSync(path.join(raiz, 'public/icon-512.png'), await png(512, { arredondado: false }))

// Favicon: igual ao componente, com cantos arredondados.
const tamanhosIco = [16, 32, 48]
const imagensIco = await Promise.all(
  tamanhosIco.map(async lado => ({ lado, dados: await png(lado, { arredondado: true }) })),
)
fs.writeFileSync(path.join(raiz, 'app/favicon.ico'), montarIco(imagensIco))

console.log('✓ public/icon-192.png, public/icon-512.png e app/favicon.ico gerados a partir do Logo')
