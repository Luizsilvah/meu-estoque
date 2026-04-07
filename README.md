# 📦 Meu Estoque

Sistema web de gestão de estoque desenvolvido para uso real em pequeno negócio. Controle completo de produtos, movimentações de entrada e saída, e dashboard com dados em tempo real.

🔗 **Acesse o app:** [meu-estoque-swart.vercel.app](https://meu-estoque-swart.vercel.app)

---

## 🚀 Funcionalidades

- **Dashboard** com visão geral do estoque em tempo real
- **Cadastro de produtos** com categorias e fornecedores
- **Movimentações** de entrada e saída com histórico
- **Filtros avançados** por produto, categoria e data
- **147 produtos reais** cadastrados e em uso
- **Assistente IA** integrado via Claude API (Anthropic)

---

## 🛠️ Tecnologias

| Camada | Tecnologia |
|--------|-----------|
| Frontend | Next.js 16, TypeScript, Tailwind CSS |
| Backend | Next.js API Routes (REST) |
| Banco de Dados | Supabase (PostgreSQL) |
| IA | Anthropic Claude API |
| Deploy | Vercel |
| Versionamento | Git + GitHub |

---

## 📁 Estrutura do Projeto

```
meu-estoque/
├── app/
│   ├── api/          # Rotas da API (server-side)
│   ├── dashboard/    # Página do dashboard
│   ├── estoque/      # Visualização do estoque
│   └── movimentos/   # Entrada e saída
├── components/       # Componentes reutilizáveis
├── lib/              # Configuração do Supabase
└── public/           # Arquivos estáticos
```

---

## ⚙️ Como rodar localmente

### Pré-requisitos
- Node.js 18+
- Conta no [Supabase](https://supabase.com)
- Chave de API da [Anthropic](https://anthropic.com)

### Passo a passo

```bash
# 1. Clone o repositório
git clone https://github.com/Luizsilvach/meu-estoque.git

# 2. Entre na pasta
cd meu-estoque

# 3. Instale as dependências
npm install

# 4. Configure as variáveis de ambiente
cp .env.example .env.local
# Preencha com suas chaves do Supabase e Anthropic

# 5. Rode o projeto
npm run dev
```

Acesse em: `http://localhost:3000`

---

## 🔐 Variáveis de Ambiente

Crie um arquivo `.env.local` na raiz com as seguintes variáveis:

```env
SUPABASE_URL=sua_url_do_supabase
SUPABASE_ANON_KEY=sua_chave_anonima
ANTHROPIC_API_KEY=sua_chave_da_anthropic
```

> ⚠️ Nunca compartilhe suas chaves. O arquivo `.env.local` já está no `.gitignore`.

---

## 👨‍💻 Autor

**Luiz Henrique Silva Ramos Cerqueira**  
Estudante de Engenharia de Software — UNIFAN  
[LinkedIn](https://www.linkedin.com/in/luiz-henrique-0b9474281) • [GitHub](https://github.com/Luizsilvach)
