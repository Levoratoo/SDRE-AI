# Fase 2 — Automatização (roadmap)

Itens planejados após o lançamento com convite manual + Meta por colagem.

## Billing (Stripe)

- Planos Starter / Pro / Scale com caps de IA e disparos
- Tabela `subscriptions` + webhook Stripe → `user.account_status`
- Hard limits em `src/lib/openai.ts` e worker (`MAX_DISPATCHES_PER_USER_PER_HOUR` já existe como base)

## Self-serve (opcional)

- Página `/signup` com Better Auth (já habilitado em `src/lib/auth.ts`)
- Ou link de convite com token único (preferido no início)

## Meta OAuth

- App Meta único “Levorato Prospect”
- Fluxo: Conectar Instagram → long-lived token → `agent_settings`
- Webhook unificado no app com routing por `instagram_business_account.id`
- App review Meta: `instagram_manage_messages`, etc.

## Implementação

Não incluída na Fase 1. Prioridade após validar onboarding manual com primeiros clientes.
