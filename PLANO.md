# Levorato Prospect — Plano de ação

## Stack

| Camada | Escolha |
|--------|---------|
| Painel + API | Next.js (App Router) + TypeScript |
| Banco | Neon Postgres (`levorato-prospect` / `spring-grass-19542630`) |
| ORM | Drizzle |
| Auth painel | Better Auth (e-mail/senha) |
| Auth extensão | API Key `pik_…` Bearer |
| Extensão | Fork MV3 do CRX Evolua (rebrand) |
| Deploy | Vercel |

## Por onde começar

**Fase 0 → 1 → 2** (fundação → API Key/ping → extração end-to-end).

Sem schema + APIs da extensão, painel e extensão não conversam. A primeira vitória útil é: login no painel → gerar API Key → extensão conectar → extrair seguidores → ver leads no painel.

## Fases

### 0 · Fundação
- Scaffold Next.js
- `.env.local` com Neon
- Schema Drizzle (users, api_keys, ig_sessions, extractions, leads, messages, campaigns, dispatches, agent)
- Migrate + seed admin
- Shell do painel (sidebar)

### 1 · Auth + API Key
- Login / logout / minha conta
- Página Extensão (copiar key, regenerar)
- `GET /api/insta/ping` (Bearer)

### 2 · Extração E2E
- `session_sync`, `extractions_start/batch/pause/finish`
- Extensão rebrand apontando pro painel
- Testar captura real

### 3 · CRM
- Dashboard, Extrações, Leads (+ import), Mensagens (DM/comment/storie)

### 4 · Campanhas + disparo
- UI campanhas (delays, janela, flags)
- `campanhas_callback` (list_active, next_lote, mark_*)
- Tab Disparar na extensão

### 5 · Paridade
- Follow / like / comment / storie
- Agente IA (webhook Meta)

## Neon

- Project: `levorato-prospect` (`spring-grass-19542630`)
- Org: Pedro
- Branch: `main` (`br-broad-cake-afme0vs6`)
- Database: `neondb`
- Credenciais: `.env.local` (não versionar)
