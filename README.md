# Levorato Prospect

Painel + API para prospecção ativa de leads no Instagram (extensão Opera/Chrome).

## Stack

- Next.js 16 + TypeScript
- Neon Postgres + Drizzle
- Better Auth (e-mail/senha)
- API Key `pik_…` para a extensão

## Setup

```bash
cp .env.example .env.local   # preencha DATABASE_URL e BETTER_AUTH_SECRET
npm install
npm run db:push
npm run db:seed
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

## Scripts

| Comando | Função |
|---------|--------|
| `npm run dev` | Dev server |
| `npm run db:push` | Aplica schema no Neon |
| `npm run db:seed` | Cria usuário admin + API Key |
| `npm run db:studio` | Drizzle Studio |

## Extensão (fluxo fácil)

1. Painel → **Extensão** → **Copiar link da extensão** (`.crx`)
2. Cole no Opera → instala
3. Cole URL do painel + API Key → Testar e salvar
4. Login no Instagram → **Sincronizar sessão**
5. Painel → **Extrações** → cole `@perfil` → Extrair agora

Empacotar de novo após mudar a extensão:

```bash
npm run ext:pack
```

## Testes

```bash
API_KEY=pik_xxx npm run test:api
```

## Status

- [x] Auth + shell do painel
- [x] Schema Neon completo
- [x] API Key + `GET /api/insta/ping`
- [x] APIs de extração (`session_sync`, `extractions_*`)
- [x] Extensão rebrand + `.crx` hospedado
- [x] Fila de extração por `@` no painel
- [x] Telas Extrações + Leads
- [ ] Mensagens + CRM completo (Fase 3)
- [ ] Campanhas + disparo / Play (Fase 4)
- [ ] Agente IA (Fase 5)

