import { redirect } from 'next/navigation'

// Página antiga: o conteúdo virou as abas Divergentes / Sem validade de /validades.
export default function ValidadesDivergentes() {
  redirect('/validades?aba=divergentes')
}
