/* ============================================================
   PROSPECT INSTA — Options page logic (v2.0.0)
   ============================================================ */

import { getConfig, setConfig, testPanel } from './lib.js';

const $ = (id) => document.getElementById(id);

document.addEventListener('DOMContentLoaded', async () => {
    // Carrega config atual (se houver)
    try {
        const cfg = await getConfig();
        if (cfg.panelUrl) $('panelUrl').value = cfg.panelUrl;
        if (cfg.apiKey)   $('apiKey').value   = cfg.apiKey;
    } catch (e) {
        console.error('[PI Options] erro ao carregar config:', e);
    }

    // Bind do botão
    $('btnSalvar').addEventListener('click', onSalvar);

    // Permite Enter no input pra salvar
    ['panelUrl', 'apiKey'].forEach(id => {
        $(id).addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') { ev.preventDefault(); onSalvar(); }
        });
    });
});

async function onSalvar() {
    const btn = $('btnSalvar');
    const url = $('panelUrl').value.trim().replace(/\/+$/, '');
    const key = $('apiKey').value.trim();

    // Validações básicas
    if (!url) return showResult('err', 'Informe a URL do painel.');
    if (!/^https?:\/\//.test(url)) return showResult('err', 'A URL deve começar com https:// ou http://');
    if (!key) return showResult('err', 'Informe a API Key.');

    btn.disabled = true;
    btn.textContent = 'Testando…';
    showResult('info', 'Conectando no painel…');

    try {
        const user = await testPanel(url, key);
        await setConfig({ panelUrl: url, apiKey: key });
        const nome  = user?.nome  || user?.name  || '';
        const email = user?.email || '';
        const label = nome || email || 'conta conectada';
        showResult('ok',
            '<strong>✓ Conectado com sucesso.</strong><br>' +
            'Conta: <strong>' + escapeHtml(label) + '</strong>' +
            (nome && email ? '<br><span class="hint">' + escapeHtml(email) + '</span>' : '') +
            '<br>Já pode fechar esta aba e abrir a extensão pra usar.'
        );
    } catch (e) {
        console.error('[PI Options] erro:', e);
        showResult('err',
            '<strong>Falha ao conectar:</strong> ' + escapeHtml(e.message || 'erro desconhecido') + '<br>' +
            '<span class="hint">Verifique: URL sem barra no final, API Key copiada corretamente, e se o painel está online.</span>'
        );
    } finally {
        btn.disabled = false;
        btn.textContent = 'Testar e salvar';
    }
}

function showResult(tipo, html) {
    const el = $('resultado');
    el.className = 'resultado ' + tipo;
    el.innerHTML = html;
    el.classList.remove('hidden');
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c =>
        ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
}
