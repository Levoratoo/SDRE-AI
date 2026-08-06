# Deploy do worker na VPS Hostinger

## Status

**Worker 24/7 já está rodando** em `31.97.175.147`:

- Path: `/opt/levorato-prospect`
- Container: `levorato-prospect-worker` (`restart: unless-stopped`)
- Log esperado: `[worker] Levorato Prospect worker iniciado`

## Redeploy / update

```bash
export VPS_PASSWORD='...'   # root da VPS
export DATABASE_URL='postgresql://...'
export GH_TOKEN="$(gh auth token)"
python scripts/deploy-vps.py
```

Ou na VPS:

```bash
cd /opt/levorato-prospect
git pull
docker compose up -d --build
docker compose logs -f
```

## Uso

1. Extensão → **Sincronizar sessão** (grava cookies no Neon).
2. Painel → Extrações → enfileire um `@`.
3. Worker na VPS processa sozinho — PC pode dormir.

## Disparo 24/7

Motor pronto para `campaign_dispatches` `pending` com campanha `running`.  
UI Play = Fase 4.

## Observações

- Conta IG descartável + delays altos.
- Sessão expirada → sync de novo na extensão.
