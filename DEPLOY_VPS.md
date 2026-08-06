# Deploy do worker na VPS Hostinger (Easypanel)

A VPS `srv1136081` (KVM 8 · 32 GB · Ubuntu + Easypanel) **aguenta** o worker 24/7.  
A API “Docker Manager” da Hostinger **não** está disponível nesse template — o deploy é pelo **Easypanel**.

## Pré-requisitos

1. Sessão do Instagram sincronizada no painel (extensão → Sincronizar sessão) — grava cookies no Neon.
2. `DATABASE_URL` do Neon (mesma do painel).
3. Repo: https://github.com/Levoratoo/levorato-prospect (privado).

## No Easypanel (recomendado)

1. Abra o Easypanel da VPS (`http://31.97.175.147:3000` ou o domínio que você configurou).
2. **+ New Project** → nome `levorato-prospect`.
3. **App** → tipo **Docker Compose** (ou “App” com Dockerfile).
4. Conecte o GitHub `Levoratoo/levorato-prospect` branch `master`.
5. Compose file: `docker-compose.yml` (raiz).
6. Environment:

```env
DATABASE_URL=postgresql://neondb_owner:...@.../neondb?sslmode=require
HEADLESS=true
POLL_MS=15000
```

7. Deploy / Enable.
8. Logs devem mostrar: `[worker] Levorato Prospect worker iniciado`.

## Teste rápido

1. Painel → Extrações → enfileire um `@`.
2. Com sessão IG válida, o worker pega o job sozinho (status `queued` → `running` → `finished`).
3. PC pode estar desligado.

## Disparo 24/7

O worker já processa `campaign_dispatches` com status `pending` quando a campanha está `running`.  
A UI completa de campanhas (Play) é a Fase 4 — o motor no servidor já está pronto.

## Observações

- Use conta IG descartável.
- IP de VPS pode ser marcado pelo Instagram — delays altos ajudam.
- Se a sessão expirar: abra a extensão no Opera → Sincronizar sessão de novo (1x).
