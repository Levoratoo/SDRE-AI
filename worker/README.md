# Levorato Prospect — Worker VPS

Worker 24/7 (Playwright) que:

1. Consome extrações `queued` no Neon (mesmo fluxo do painel)
2. Dispara DMs de campanhas `running` com leads `pending`

## Requisitos

- `DATABASE_URL` do Neon
- Sessão IG sincronizada pelo menos uma vez (extensão → Sincronizar sessão)
- Conta de prospecção descartável + delays altos

## Local

```bash
cd worker
npm install
npx playwright install chromium
DATABASE_URL=... npm start
```

## Docker / Hostinger

Na raiz do repo:

```bash
export DATABASE_URL=postgresql://...
docker compose up -d --build
docker compose logs -f
```
