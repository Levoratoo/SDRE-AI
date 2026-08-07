# Deploy do worker na VPS Hostinger

## Status

Worker 24/7 em `31.97.175.147`:

- Path: `/opt/levorato-prospect`
- Container: `levorato-prospect-worker` (`restart: unless-stopped`)
- Log esperado: `[worker] Levorato Prospect worker iniciado`

## O que roda na VPS

- Extrações enfileiradas no painel (`status=queued`)
- Campanhas com **Play** (`status=running` + dispatches `pending`)
- DM + seguir + curtir + comentar + storie (conforme a campanha)

A extensão **não** puxa mais a fila automaticamente. Use-a só para **Sincronizar sessão** (e extração/disparo manual de emergência).

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

## Uso (notebook pode fechar)

1. Extensão → **Sincronizar sessão** (grava cookies no Neon).
2. Painel → Extrações → enfileire um `@`.
3. Painel → Campanhas → Play.
4. Desligue o PC — a VPS continua.

## Observações

- Conta IG descartável + delays altos.
- Sessão expirada → sync de novo na extensão.
- Se o Instagram invalidar a sessão, a campanha pausa com erro `sessao_deslogada`.
