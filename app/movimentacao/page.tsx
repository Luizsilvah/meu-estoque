'use client'
// A tela está em app/components/MovimentacaoTela.tsx, compartilhada com /saida.
import { Suspense } from 'react'
import MovimentacaoTela from '@/app/components/MovimentacaoTela'

export default function Page() {
  return (
    <Suspense>
      <MovimentacaoTela />
    </Suspense>
  )
}
