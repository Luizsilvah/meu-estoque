import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Em dev, nunca precisar de `npm run build` — o servidor compila sob demanda.
  // IMPORTANTE: variáveis NEXT_PUBLIC_* são inlined em tempo de compilação pelo
  // webpack. Mudar o .env.local exige reiniciar `npm run dev` (Ctrl+C e rodar de novo).
  // Para evitar isso, use variáveis SEM o prefixo NEXT_PUBLIC_ e acesse-as apenas
  // em Route Handlers (app/api/*) — elas são lidas em runtime a cada request.

  reactStrictMode: false,

  // Permite o next/image otimizar as fotos do Supabase Storage (chat e fotos
  // de produto — ver app/api/chat/upload/route.ts e app/api/produto/foto/route.ts).
  // Hostname com wildcard (em vez do ref do projeto fixo) porque o mesmo app
  // roda contra projetos Supabase diferentes em preview/produção. Restrito a
  // /storage/v1/object/public/ para não liberar o resto do domínio do Supabase.
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
        search: '',
      },
    ],
  },
}

export default nextConfig
