# Levorato Prospect — Worker VPS

Playwright + Neon. Consome fila de **extrações** e **disparos** 24/7.

## Env

- `DATABASE_URL` do Neon (mesma do painel)
- `HEADLESS=true`
- `POLL_MS=15000`

## Local

```bash
cd worker
npm install
DATABASE_URL=... npm start
```

## Docker

Na raiz do repo:

```bash
docker compose up -d --build
docker compose logs -f
```

## Fluxo

1. Extensão → sincronizar sessão IG (cookies no Neon)
2. Painel enfileira extração / dá Play na campanha
3. Este worker processa sozinho
