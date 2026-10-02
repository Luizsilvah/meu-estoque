'use client'
import Image from 'next/image'
import { D } from '@/app/lib/theme'

type Props = {
  src: string | null
  size?: number
  radius?: number
  style?: React.CSSProperties
}

export default function FotoThumb({ src, size = 40, radius = 10, style }: Props) {
  const base: React.CSSProperties = { width: size, height: size, borderRadius: radius, flexShrink: 0, ...style }
  if (src) {
    return (
      <Image
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        style={{ ...base, objectFit: 'cover' }}
      />
    )
  }
  return (
    <div style={{ ...base, background: D.input, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(size * 0.45) }}>
      📦
    </div>
  )
}
