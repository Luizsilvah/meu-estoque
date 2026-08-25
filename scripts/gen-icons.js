#!/usr/bin/env node
// Generates icon-192.png and icon-512.png — pure Node.js, no deps
const zlib = require('zlib')
const fs   = require('fs')
const path = require('path')

// ── CRC32 ────────────────────────────────────────────────────────────────────
const CRC_TABLE = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let c = i
  for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
  CRC_TABLE[i] = c >>> 0
}
function crc32(buf) {
  let crc = 0xFFFFFFFF
  for (const b of buf) crc = (CRC_TABLE[(crc ^ b) & 0xFF] ^ (crc >>> 8)) >>> 0
  return (crc ^ 0xFFFFFFFF) >>> 0
}
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii')
  const l = Buffer.alloc(4); l.writeUInt32BE(data.length)
  const c = Buffer.alloc(4); c.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([l, t, data, c])
}

// ── Pixel-art bitmaps for F and X (5 cols × 7 rows) ────────────────────────
const LETTER_F = [
  [1,1,1,1,1],
  [1,1,0,0,0],
  [1,1,1,1,0],
  [1,1,0,0,0],
  [1,1,0,0,0],
  [1,1,0,0,0],
  [1,1,0,0,0],
]
const LETTER_X = [
  [1,1,0,1,1],
  [1,1,0,1,1],
  [0,1,1,1,0],
  [0,0,1,0,0],
  [0,1,1,1,0],
  [1,1,0,1,1],
  [1,1,0,1,1],
]

const LETTER_COLS = 5
const LETTER_ROWS = 7

// ── Generate icon at given size ──────────────────────────────────────────────
function generateIcon(size) {
  const PNG_SIG = Buffer.from([137,80,78,71,13,10,26,10])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 2  // 8-bit RGB

  const [RB,GB,BB] = [0x1A, 0x3C, 0x5E]  // background: #1A3C5E
  const [RF,GF,BF] = [0xFF, 0xFF, 0xFF]  // foreground: #FFFFFF

  // Each letter cell = cellSize × cellSize pixels
  // Two letters side by side with a gap of gapCells cell-widths
  const gapCells = 1
  const totalCols = LETTER_COLS * 2 + gapCells
  const cellSize  = Math.max(1, Math.floor(size * 0.58 / totalCols))

  const blockW = LETTER_COLS * cellSize
  const blockH = LETTER_ROWS * cellSize
  const gapPx  = gapCells * cellSize

  const originX_F = Math.round((size - (blockW * 2 + gapPx)) / 2)
  const originX_X = originX_F + blockW + gapPx
  const originY   = Math.round((size - blockH) / 2)

  // Rounded background corners (radius = 20% of size)
  const r = size * 0.20
  function inRoundedRect(x, y) {
    const dx = Math.max(0, Math.max(r - x, x - (size - r)))
    const dy = Math.max(0, Math.max(r - y, y - (size - r)))
    return dx * dx + dy * dy <= r * r
  }

  function isLetterPixel(px, py) {
    // Check F
    const fx = px - originX_F, fy = py - originY
    if (fx >= 0 && fx < blockW && fy >= 0 && fy < blockH) {
      const col = Math.floor(fx / cellSize)
      const row = Math.floor(fy / cellSize)
      if (LETTER_F[row]?.[col]) return true
    }
    // Check X
    const xx = px - originX_X, xy = py - originY
    if (xx >= 0 && xx < blockW && xy >= 0 && xy < blockH) {
      const col = Math.floor(xx / cellSize)
      const row = Math.floor(xy / cellSize)
      if (LETTER_X[row]?.[col]) return true
    }
    return false
  }

  const rows = []
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3)
    row[0] = 0
    for (let x = 0; x < size; x++) {
      const inside = inRoundedRect(x, y)
      const fg     = inside && isLetterPixel(x, y)
      row[1 + x*3]   = fg ? RF : RB
      row[1 + x*3+1] = fg ? GF : GB
      row[1 + x*3+2] = fg ? BF : BB
    }
    rows.push(row)
  }

  const compressed = zlib.deflateSync(Buffer.concat(rows), { level: 9 })

  return Buffer.concat([
    PNG_SIG,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const pub = path.join(__dirname, '..', 'public')
fs.writeFileSync(path.join(pub, 'icon-192.png'), generateIcon(192))
fs.writeFileSync(path.join(pub, 'icon-512.png'), generateIcon(512))
console.log('✓ icon-192.png e icon-512.png gerados em /public')
