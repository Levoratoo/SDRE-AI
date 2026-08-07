# Onboarding de clientes — Levorato Prospect

Runbook interno para provisionar, orientar e suportar clientes no modelo **convite manual** (sem signup público).

## 1. Provisionar conta (2 min)

```bash
INVITE_EMAIL=cliente@empresa.com \
INVITE_NAME="Cliente Empresa" \
INVITE_PASSWORD="SenhaSegura2026!" \
ACCOUNT_STATUS=trial \
ACCOUNT_NOTES="Plano Pro — cobrança manual WhatsApp" \
npm run db:invite
```

O script cria:

- Usuário Better Auth (email + senha)
- `agent_settings` com webhook/verify únicos
- API key opcional (`pik_...`) para extensão

Envie ao cliente:

1. Link do painel: https://sdre-ai.vercel.app
2. Email e senha (por canal seguro — não WhatsApp se possível)
3. Link do tutorial: `/tutorial`

## 2. Mensagem modelo (WhatsApp/email)

```
Olá! Sua conta no Levorato Prospect está pronta.

Painel: https://sdre-ai.vercel.app
Login: [email]
Senha: [senha]

Primeiros passos no dashboard:
1. Minha Conta → colar sessionid do Instagram
2. Extrações → enfileirar um @
3. Campanhas → criar e dar Play
4. (Opcional) Agente IA → token Meta + webhook no Facebook

Tutoriais: https://sdre-ai.vercel.app/tutorial
```

## 3. Sessão Instagram

- Cliente cola `sessionid` em **Minha Conta** (não precisa da extensão).
- Sessão expira — quando extrações/campanhas falham com AUTH, pedir novo `sessionid`.
- Como obter: DevTools → Application → Cookies → instagram.com → `sessionid`.

## 4. Agente IA (Meta manual)

No painel **Agente IA**:

1. Copiar **Callback URL** e **Verify Token**
2. Facebook Developers → App → Webhooks → Instagram → Editar
3. Colar callback + verify (valores do SDRE, **não** do Evolua)
4. Clicar **Testar verificação** no painel
5. Colar Access Token Meta + Instagram Business Account ID
6. Salvar e ativar o agente

Migrando do Evolua: reconfigurar webhook no Facebook com URLs do SDRE.

## 5. Status da conta

| Status | Efeito |
|--------|--------|
| `active` | Operação normal |
| `trial` | Igual active (cobrança manual) |
| `suspended` | APIs e worker ignoram; campanhas running pausadas |

Suspender:

```bash
USER_EMAIL=cliente@empresa.com ACCOUNT_STATUS=suspended npm run db:account-status
```

Reativar:

```bash
USER_EMAIL=cliente@empresa.com ACCOUNT_STATUS=active npm run db:account-status
```

## 6. Worker VPS

- Container: `levorato-prospect-worker` na VPS
- Fila global Neon — round-robin por `userId`
- Logs estruturados: `[extract]` / `[dispatch]` com `userId`
- Env opcional: `MAX_DISPATCHES_PER_USER_PER_HOUR` (default ilimitado)

Redeploy após mudanças no worker:

```bash
python scripts/deploy-vps.py
```

## 7. Escalar operação

- **1 VPS KVM 8**: dezenas de clientes com delays altos
- Acima disso: segundo worker ou fila dedicada
- Monitorar: container up + logs por `userId` quando cliente reclama

## 8. Fase 2

Ver [PHASE2.md](./PHASE2.md) — Stripe, OAuth Meta, signup/convite link.
