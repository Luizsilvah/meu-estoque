import { redirect } from 'next/navigation'

// Página antiga: Checklist e Compras da quinta viraram uma tela só, /compras.
export default function Checklist() {
  redirect('/compras')
}
