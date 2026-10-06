import { redirect } from 'next/navigation'

// Página antiga: os gráficos viraram a aba Gráficos de /relatorio.
export default function Graficos() {
  redirect('/relatorio?aba=graficos')
}
