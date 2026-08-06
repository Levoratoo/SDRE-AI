# Levorato Prospect — Extensão

Extrator de seguidores + sincronização de sessão do Instagram para o painel Levorato Prospect.

## Instalação (Opera / Chrome)

1. Abra `opera://extensions` ou `chrome://extensions`.
2. Ative **Modo de desenvolvedor**.
3. **Carregar sem compactação** → selecione esta pasta `extension/`.
4. Clique no ícone da extensão.

## Configuração

1. No painel: **Extensão** → copie URL + API Key.
2. Na extensão: ⚙ → cole URL (`http://localhost:3000` em dev) e a key.
3. **Testar e salvar**.

## Uso

### Sincronizar sessão
1. Login no Instagram (conta de prospecção).
2. Extensão → **Sincronizar sessão**.

### Extrair seguidores
1. Abra o perfil-alvo no Instagram.
2. Extensão → nome da extração → **Iniciar extração**.
3. Acompanhe no popup e em **Extrações** / **Base de leads** no painel.

## Notas

- Delay padrão 2–5s entre páginas; rate limit (429) pausa 15–30 min.
- Disparo de campanhas chega na Fase 4 (aba Disparar já existe, API stub).
