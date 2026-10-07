'use client'
import Image from 'next/image'
import { D } from '@/app/lib/theme'
import Icon from './ui/Icon'

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
    <div style={{ ...base, background: D.input, color: D.text2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Icon nome="box" size={Math.round(size * 0.46)} traco={1.8} />
    </div>
  )
}
