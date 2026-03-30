import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Em dev, nunca precisar de `npm run build` — o servidor compila sob demanda.
  // IMPORTANTE: variáveis NEXT_PUBLIC_* são inlined em tempo de compilação pelo
  // webpack. Mudar o .env.local exige reiniciar `npm run dev` (Ctrl+C e rodar de novo).
  // Para evitar isso, use variáveis SEM o prefixo NEXT_PUBLIC_ e acesse-as apenas
  // em Route Handlers (app/api/*) — elas são lidas em runtime a cada request.

  reactStrictMode: false,
}

export default nextConfig
