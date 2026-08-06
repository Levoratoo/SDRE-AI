/* ============================================================
   PROSPECT INSTA — Popup logic (v2.0.0)
   ============================================================
   Tabs: Extrair | Disparar
   ============================================================ */

import {
    getConfig, testPanel, extractIgUsername,
    getIgCookies, fetchIgProfileInfoViaTab
} from './lib.js';

const $ = (id) => document.getElementById(id);
const GRANDE_THRESHOLD = 20000;

let currentTab = 'extrair';
let currentProfile = null;
let currentTabId   = null;
let pollTimer = null;

// -----------------------------
// BOOTSTRAP
// -----------------------------

document.addEventListener('DOMContentLoaded', async () => {
    bindEvents();
    await loadPreferencias();
    await refresh();
});

function bindEvents() {
    // Header
    $('btnOpts').addEventListener('click', abrirOptions);
    $('btnAbrirOpts').addEventListener('click', abrirOptions);

    // Tabs
    document.querySelectorAll('.tab').forEach(t => {
        t.addEventListener('click', () => switchTab(t.dataset.tab));
    });

    // Extração
    $('btnSync').addEventListener('click', onSync);
    $('btnExtrair').addEventListener('click', onIniciarExtracao);
    $('btnExtPausar').addEventListener('click',  () => sendBg({ type: 'pause-extraction' }));
    $('btnExtRetomar').addEventListener('click', () => sendBg({ type: 'resume-extraction' }));
    $('btnExtCancelar').addEventListener('click', onCancelarExtracao);
    $('btnExtConcluir').addEventListener('click', onConcluirExtracao);

    // Disparo
    $('btnAbrirCampanhas').addEventListener('click', abrirPainelCampanhas);
    $('btnRecarregarCampanhas').addEventListener('click', renderListaCampanhas);
    $('btnRecarregarLista').addEventListener('click', renderListaCampanhas);
    $('btnDispPausar').addEventListener('click',  () => sendBg({ type: 'pause-dispatch' }));
    $('btnDispRetomar').addEventListener('click', () => sendBg({ type: 'resume-dispatch' }));
    $('btnDispParar').addEventListener('click', onPararDisparo);
    $('btnDispConcluir').addEventListener('click', onConcluirDisparo);

    // Recebe updates de estado do background
    chrome.runtime.onMessage.addListener((msg) => {
        if (['ext-state-updated', 'ext-state-cleared',
             'disp-state-updated', 'disp-state-cleared'].includes(msg.type)) {
            refresh();
        }
    });
}

function abrirOptions() {
    chrome.runtime.openOptionsPage();
    window.close();
}

async function abrirPainelCampanhas() {
    const cfg = await getConfig();
    if (cfg.panelUrl) {
        chrome.tabs.create({ url: cfg.panelUrl + '/campanhas' });
    }
}

function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab').forEach(t => {
        t.classList.toggle('is-active', t.dataset.tab === tab);
    });
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.add('hidden'));
    $('tab' + tab[0].toUpperCase() + tab.slice(1)).classList.remove('hidden');
    // Se foi pra tab disparar e não tem disparo rodando, recarrega lista
    if (tab === 'disparar') {
        refreshTabDispararLazyList();
    }
}

// -----------------------------
// PREFERÊNCIAS SALVAS (extração)
// -----------------------------

async function loadPreferencias() {
    const { extPrefs } = await chrome.storage.local.get('extPrefs');
    const p = extPrefs || {};
    if (p.delayMin != null) $('extDelayMin').value = p.delayMin;
    if (p.delayMax != null) $('extDelayMax').value = p.delayMax;
}

async function savePreferencias(delayMin, delayMax) {
    await chrome.storage.local.set({ extPrefs: { delayMin, delayMax } });
}

// -----------------------------
// REFRESH principal
// -----------------------------

async function refresh() {
    stopPolling();

    const cfg = await getConfig();
    if (!cfg.panelUrl || !cfg.apiKey) {
        showOnly('viewSemConfig');
        $('userBox').classList.add('hidden');
        $('tabs').classList.add('hidden');
        return;
    }

    // UI base — mostra imediatamente pra não ficar branco enquanto carrega
    $('viewSemConfig').classList.add('hidden');
    $('userBox').classList.remove('hidden');
    $('tabs').classList.remove('hidden');
    if (!$('userNome').textContent || $('userNome').textContent === '—') {
        $('userNome').textContent = 'Carregando…';
    }

    // Carrega estados (pode demorar se service worker estava dormindo)
    const [extResp, dispResp] = await Promise.all([
        sendBg({ type: 'get-ext-state' }),
        sendBg({ type: 'get-disp-state' })
    ]);
    const extState  = extResp?.state;
    const dispState = dispResp?.state;

    // User info
    await renderUser(cfg);

    // Renderiza cada tab
    await renderTabExtrair(extState, dispState);
    await renderTabDisparar(extState, dispState);

    // Polling se algo está ativo
    const extActivo  = extState  && ['running', 'paused'].includes(extState.status);
    const dispActivo = dispState && ['running', 'paused'].includes(dispState.status);
    if (extActivo || dispActivo) startPolling();
}

async function renderUser(cfg) {
    try {
        const user = await testPanel(cfg.panelUrl, cfg.apiKey);
        $('userNome').textContent  = user?.nome  || user?.name || '—';
        $('userEmail').textContent = user?.email || '';
    } catch (e) {
        $('userNome').textContent  = 'Falha ao conectar';
        $('userEmail').textContent = e.message;
    }
}

function showOnly(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    $(viewId).classList.remove('hidden');
}

// -----------------------------
// TAB EXTRAIR
// -----------------------------

async function renderTabExtrair(extState, dispState) {
    // Se disparo tá ativo, bloqueia tab extrair
    if (dispState && ['running', 'paused'].includes(dispState.status)) {
        $('extBlockedByDispatch').classList.remove('hidden');
        $('extPronto').classList.add('hidden');
        $('extRodando').classList.add('hidden');
        return;
    }
    $('extBlockedByDispatch').classList.add('hidden');

    // Extração em algum estado ativo/final? mostra rodando
    if (extState && ['running', 'paused', 'error', 'finished'].includes(extState.status)) {
        $('extPronto').classList.add('hidden');
        $('extRodando').classList.remove('hidden');
        renderExtRodando(extState);
        return;
    }

    // Estado pronto
    $('extRodando').classList.add('hidden');
    $('extPronto').classList.remove('hidden');
    await Promise.all([renderSessao(), renderPerfilAtual()]);
}

async function renderSessao() {
    try {
        const c = await getIgCookies();
        if (!c.sessionid) {
            $('sessInfo').textContent = 'Não logado no Instagram.';
            $('sessInfo').style.color = 'var(--err)';
        } else {
            $('sessInfo').textContent = 'Detectada. Clique em "Sincronizar" para enviar ao painel.';
            $('sessInfo').style.color = '';
        }
    } catch {
        $('sessInfo').textContent = 'Não foi possível verificar cookies.';
    }
}

async function renderPerfilAtual() {
    $('warnGrande').classList.add('hidden');
    $('profActions').classList.add('hidden');

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.url) throw new Error();
        const username = extractIgUsername(tab.url);
        if (!username) {
            currentProfile = null; currentTabId = null;
            $('profInfo').textContent = 'Abra o perfil que quer prospectar no Instagram para poder extrair.';
            return;
        }
        currentTabId = tab.id;
        $('profInfo').textContent = 'Carregando dados de @' + username + '…';

        const p = await fetchIgProfileInfoViaTab(tab.id, username);
        currentProfile = p;
        renderProfileCard(p);
        if (p.followers_count > GRANDE_THRESHOLD) {
            // Estimativa: com delay médio de 3s por página de 50 leads = ~15 leads/min
            const minutos = Math.round(p.followers_count / 15);
            let tempoTxt;
            if (minutos < 60) tempoTxt = `~${minutos} min`;
            else if (minutos < 300) tempoTxt = `~${Math.round(minutos / 60)}h`;
            else tempoTxt = `mais de 5h`;

            $('warnGrande').innerHTML =
                `<strong>Perfil grande.</strong> A extração completa vai demorar ${tempoTxt}. ` +
                `Você pode pausar e retomar quando precisar. ` +
                `Recomendo definir um <strong>limite de leads</strong> abaixo pra terminar mais rápido.`;
            $('warnGrande').classList.remove('hidden');
        }
        if (p.is_private) toast('Perfil privado — o IG só retorna seguidores se você seguir ele.', 'err');

        $('extNome').value = '@' + p.username;
        $('extLimite').value = '';
        $('profActions').classList.remove('hidden');
    } catch (e) {
        currentProfile = null;
        $('profInfo').textContent = e.message || 'Erro ao carregar perfil';
        $('profInfo').style.color = 'var(--err)';
    }
}

function renderProfileCard(p) {
    $('profInfo').innerHTML = '';
    $('profInfo').style.color = '';
    const wrap = document.createElement('div');
    wrap.className = 'profile-visual';
    const img = document.createElement('img');
    img.setAttribute('referrerpolicy', 'no-referrer');
    img.alt = '';
    img.addEventListener('error', () => { img.style.visibility = 'hidden'; });
    img.src = p.profile_pic_url || '';
    const info = document.createElement('div');
    info.className = 'profile-visual-info';
    const uname = document.createElement('div');
    uname.className = 'profile-visual-username';
    uname.textContent = '@' + p.username;
    if (p.is_verified) {
        const chk = document.createElement('span');
        chk.textContent = ' ✓';
        chk.style.color = '#75EFFF';
        uname.appendChild(chk);
    }
    const meta = document.createElement('div');
    meta.className = 'profile-visual-meta';
    const bits = [p.followers_count.toLocaleString('pt-BR') + ' seguidores'];
    if (p.is_private)  bits.push('privado');
    if (p.is_business) bits.push('business');
    meta.textContent = bits.join(' · ');
    info.appendChild(uname); info.appendChild(meta);
    wrap.appendChild(img); wrap.appendChild(info);
    $('profInfo').appendChild(wrap);
}

async function onSync() {
    const btn = $('btnSync');
    btn.disabled = true; btn.textContent = 'Sincronizando…';
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const tabId = (tab && /^https:\/\/(www\.)?instagram\.com\//.test(tab.url || '')) ? tab.id : null;
        const r = await sendBg({ type: 'sync-session', tabId });
        if (!r.ok) throw new Error(r.erro);
        const info = r.info || {};
        toast('Sessão sincronizada' + (info.ig_username ? ' (@' + info.ig_username + ')' : ''), 'ok');
        $('sessInfo').textContent = 'Sincronizada' + (info.ig_username ? ' com @' + info.ig_username : '') + '.';
    } catch (e) {
        toast(e.message, 'err');
    } finally {
        btn.disabled = false; btn.textContent = 'Sincronizar sessão';
    }
}

async function onIniciarExtracao() {
    if (!currentProfile) return;
    const nome  = $('extNome').value.trim() || ('@' + currentProfile.username);
    const rawLimite = $('extLimite').value.trim();
    const limite = rawLimite ? parseInt(rawLimite, 10) : null;
    const delayMin = parseFloat($('extDelayMin').value) || 2;
    const delayMax = parseFloat($('extDelayMax').value) || 5;

    if (limite !== null && (isNaN(limite) || limite < 1)) return toast('Limite inválido.', 'err');
    if (delayMin >= delayMax) return toast('Delay mínimo tem que ser menor que o máximo.', 'err');
    if (delayMin < 1) return toast('Delay mínimo muito baixo — mínimo 1 segundo.', 'err');

    await savePreferencias(delayMin, delayMax);

    const btn = $('btnExtrair');
    btn.disabled = true; btn.textContent = 'Iniciando…';
    try {
        const r = await sendBg({
            type: 'start-extraction',
            profile: currentProfile, nome, tabId: currentTabId,
            config: {
                limite,
                delayMinMs: Math.round(delayMin * 1000),
                delayMaxMs: Math.round(delayMax * 1000)
            }
        });
        if (!r.ok) throw new Error(r.erro || 'Falha desconhecida ao iniciar');
        await refresh();
    } catch (e) {
        toast('Erro ao iniciar: ' + e.message, 'err');
        btn.disabled = false; btn.textContent = 'Iniciar extração';
    }
}

async function onCancelarExtracao() {
    if (!confirm('Cancelar a extração em andamento?')) return;
    await sendBg({ type: 'cancel-extraction' });
    await refresh();
}

async function onConcluirExtracao() {
    await sendBg({ type: 'clear-ext-state' });
    await refresh();
}

function renderExtRodando(s) {
    const p = s.profile || {};
    const st = s.status;
    $('runTitle').textContent = (st === 'finished' ? 'Concluída: @' : 'Extraindo @') + p.username;

    const pill = $('runStatus');
    pill.className = 'pill';
    if (st === 'paused')   pill.classList.add('paused');
    if (st === 'error')    pill.classList.add('error');
    if (st === 'finished') pill.classList.add('finished');
    pill.textContent = ({ running:'Rodando', paused:'Pausada', error:'Erro', finished:'Concluída' })[st] || st;

    $('runCap').textContent = (s.capturedCount || 0).toLocaleString('pt-BR');

    const limite = s.config?.limite || null;
    let meta = 0;
    if (limite) { $('runMetaLbl').textContent = 'Meta (limite)'; meta = limite; }
    else        { $('runMetaLbl').textContent = 'Meta'; meta = p.followers_count || 0; }
    $('runMeta').textContent = meta ? meta.toLocaleString('pt-BR') : '—';

    const pct = meta ? Math.min(100, Math.round(s.capturedCount * 100 / meta)) : 0;
    $('runBar').style.width = pct + '%';
    $('runPct').textContent = meta ? (pct + '%') : '';

    if (st === 'error' && s.lastError) {
        $('runError').textContent = s.lastError;
        $('runError').classList.remove('hidden');
        $('runFinished').classList.add('hidden');
    } else if (st === 'finished') {
        $('runError').classList.add('hidden');
        $('runFinishedDetail').textContent = ' Foram capturados ' + (s.capturedCount || 0).toLocaleString('pt-BR') + ' seguidores.';
        $('runFinished').classList.remove('hidden');
    } else {
        $('runError').classList.add('hidden');
        $('runFinished').classList.add('hidden');
    }

    $('btnExtConcluir').style.display = st === 'finished' ? '' : 'none';
    $('btnExtPausar').style.display   = st === 'running'  ? '' : 'none';
    $('btnExtRetomar').style.display  = st === 'paused'   ? '' : 'none';
    $('btnExtCancelar').style.display = (['running','paused','error'].includes(st)) ? '' : 'none';
}

// -----------------------------
// TRADUÇÃO DE MOTIVOS DE ERRO
// -----------------------------

const MOTIVOS_ERRO = {
    'perfil_nao_encontrado':         '❓ Perfil não encontrado ou deletado',
    'sem_botao_mensagem_nem_menu':   '⚠ Botão de mensagem e menu "..." ausentes',
    'menu_sem_enviar_mensagem':      '🔕 Menu "..." não tem "Enviar mensagem" (business restrito)',
    'campo_texto_nao_encontrado':    '⏱ Campo de texto não abriu a tempo',
    'botao_enviar_nao_encontrado':   '⚠ Botão "Enviar" não apareceu',
    'campo_nao_esvaziou':            '⚠ Mensagem pode não ter sido enviada',
    'sessao_invalida_no_perfil':     '🔐 Instagram deslogado — sessão expirou',
    'sessao_deslogada':              '🔐 Instagram deslogado — sessão expirou',
    'sessao_deslogada_url':          '🔐 Instagram redirecionou pra tela de login',
    'sessao_deslogada_redirect':     '🔐 Instagram redirecionou pra tela de login',
    'captcha_detectado':             '🤖 Instagram pediu captcha — pause a campanha',
    'verificacao_seguranca':         '🛡 Instagram pediu verificação de segurança',
    'acao_bloqueada':                '⛔ Ação bloqueada pelo Instagram (aguarde algumas horas)',
    'conta_suspensa':                '⛔ Conta suspensa/desativada pelo Instagram',
    'aba_nao_carregou':              '⏱ Página do Instagram não carregou',
    'nao_abriu_aba':                 '⚠ Não conseguiu abrir aba',
    'sem_resultado':                 '⚠ Sem retorno do script de disparo',
};

/** Códigos que indicam problema fatal de sessão — merece alerta grande */
const CODIGOS_SESSAO_FATAL = new Set([
    'sessao_invalida_no_perfil',
    'sessao_deslogada',
    'sessao_deslogada_url',
    'sessao_deslogada_redirect',
    'captcha_detectado',
    'verificacao_seguranca',
    'acao_bloqueada',
    'conta_suspensa',
]);

function traduzirMotivo(cod) {
    if (!cod) return 'Desconhecido';
    if (MOTIVOS_ERRO[cod]) return MOTIVOS_ERRO[cod];
    // Códigos que começam com prefixo conhecido
    if (cod.startsWith('excecao:'))       return '💥 Erro no script: ' + cod.replace('excecao: ', '');
    if (cod.startsWith('erro_execucao:')) return '💥 Erro de execução';
    if (cod.startsWith('HTTP'))           return '🌐 ' + cod;
    return cod; // fallback: mostra o código cru
}

async function fetchBreakdownErros(campanhaId) {
    try {
        const r = await sendBg({ type: 'get-erros-breakdown', campanhaId });
        if (!r?.ok) return [];
        return r.breakdown || [];
    } catch { return []; }
}

async function renderTabDisparar(extState, dispState) {
    // Se extração ativa, bloqueia
    if (extState && ['running','paused'].includes(extState.status)) {
        $('dispBlockedByExtract').classList.remove('hidden');
        $('dispSemCampanhas').classList.add('hidden');
        $('dispListaCampanhas').classList.add('hidden');
        $('dispRodando').classList.add('hidden');
        return;
    }
    $('dispBlockedByExtract').classList.add('hidden');

    // Disparo ativo? mostra rodando
    if (dispState && ['running','paused','error','finished'].includes(dispState.status)) {
        $('dispSemCampanhas').classList.add('hidden');
        $('dispListaCampanhas').classList.add('hidden');
        $('dispRodando').classList.remove('hidden');
        renderDispRodando(dispState);
        return;
    }

    // Nada rodando — mostra lista de campanhas
    $('dispRodando').classList.add('hidden');
    await renderListaCampanhas();
}

async function refreshTabDispararLazyList() {
    const dispResp = await sendBg({ type: 'get-disp-state' });
    const dispState = dispResp?.state;
    if (dispState && ['running','paused','error','finished'].includes(dispState.status)) return;
    await renderListaCampanhas();
}

async function renderListaCampanhas() {
    $('dispSemCampanhas').classList.add('hidden');
    $('dispListaCampanhas').classList.add('hidden');
    $('dispListaBody').innerHTML = '<p class="mut small">Carregando…</p>';

    let r;
    try {
        r = await sendBg({ type: 'list-active-campaigns' });
    } catch (e) {
        r = { ok: false, erro: e.message };
    }
    if (!r?.ok) {
        $('dispSemCampanhas').classList.remove('hidden');
        $('dispListaBody').innerHTML = '<p class="mut small" style="color:var(--err)">Erro: ' + escapeHtml(r?.erro || 'falha') + '</p>';
        return;
    }

    const camps = r.campanhas || [];
    if (!camps.length) {
        $('dispSemCampanhas').classList.remove('hidden');
        return;
    }

    // Renderiza lista
    $('dispListaCampanhas').classList.remove('hidden');
    $('dispListaBody').innerHTML = '';
    for (const c of camps) {
        const card = document.createElement('div');
        card.className = 'camp-card';

        const info = document.createElement('div');
        info.className = 'camp-info';

        const nome = document.createElement('div');
        nome.className = 'camp-nome';
        nome.textContent = c.nome;

        const meta = document.createElement('div');
        meta.className = 'camp-meta';
        meta.innerHTML =
            '<span>Total: <span class="camp-num">' + (c.total || 0) + '</span></span>' +
            '<span>Enviados: <span class="camp-num">' + (c.enviados || 0) + '</span></span>' +
            '<span>Restam: <span class="camp-num">' + (c.restantes || 0) + '</span></span>';

        info.appendChild(nome); info.appendChild(meta);
        card.appendChild(info);

        const btn = document.createElement('button');
        btn.className = 'btn primary btn-small';
        btn.textContent = 'Iniciar';
        btn.addEventListener('click', () => onIniciarDisparo(c));
        card.appendChild(btn);

        $('dispListaBody').appendChild(card);
    }
}

async function onIniciarDisparo(campanha) {
    if (!confirm('Iniciar disparo da campanha "' + campanha.nome + '"?\n\nO Chrome vai abrir e fechar abas do Instagram em segundo plano. Não feche o navegador durante o disparo.')) return;

    const cookies = await getIgCookies();
    if (!cookies.sessionid) {
        toast('Você precisa estar logado no Instagram.', 'err');
        return;
    }

    const r = await sendBg({ type: 'start-dispatch', campanha });
    if (!r?.ok) {
        toast('Erro: ' + (r?.erro || 'falha'), 'err');
        return;
    }
    await refresh();
}

async function onPararDisparo() {
    if (!confirm('Parar o disparo em andamento?\n\nOs leads que já receberam mensagem não serão desfeitos, mas a campanha voltará ao estado atual para você retomar depois pelo painel.')) return;
    await sendBg({ type: 'stop-dispatch' });
    await refresh();
}

async function onConcluirDisparo() {
    await sendBg({ type: 'clear-disp-state' });
    await refresh();
}

function renderDispRodando(s) {
    const st = s.status;
    $('dispTitle').textContent = (st === 'finished' ? 'Concluído: ' : 'Disparando: ') + (s.campanhaNome || '');

    const pill = $('dispStatus');
    pill.className = 'pill';
    if (st === 'paused')   pill.classList.add('paused');
    if (st === 'error')    pill.classList.add('error');
    if (st === 'finished') pill.classList.add('finished');
    pill.textContent = ({ running:'Rodando', paused:'Pausado', error:'Erro', finished:'Concluído' })[st] || st;

    const enviados = s.enviados || 0;
    const erros    = s.erros || 0;
    const restam   = Math.max(0, s.restam || 0);
    $('dispEnviados').textContent = enviados;
    $('dispErros').textContent    = erros;
    $('dispRestam').textContent   = restam;

    const total = s.total || (enviados + erros + restam) || 0;
    const feitos = enviados + erros;
    const pct = total ? Math.min(100, Math.round(feitos * 100 / total)) : 0;
    $('dispBar').style.width = pct + '%';
    $('dispPct').textContent = total ? (pct + '% de ' + total) : '';

    if (st === 'running' && s.leadAtual) {
        $('dispAtual').textContent = 'Enviando para ' + s.leadAtual + '…';
    } else if (st === 'running' && s.lastError) {
        $('dispAtual').textContent = s.lastError;
    } else {
        $('dispAtual').textContent = '';
    }

    if (st === 'error' && s.lastError) {
        $('dispErrMsg').textContent = s.lastError;
        $('dispErrMsg').classList.remove('hidden');
        $('dispOkMsg').classList.add('hidden');
    } else if (st === 'finished' || (erros > 0 && st !== 'running')) {
        $('dispErrMsg').classList.add('hidden');

        // Só re-renderiza se algo mudou (evita pisca no polling)
        const cacheKey = `${s.campanhaId || ''}|${st}|${enviados}|${erros}`;
        if ($('dispOkMsg').dataset.cacheKey !== cacheKey) {
            let html = '<strong>' + (st === 'finished' ? '✓ Disparo concluído.' : 'Disparo em andamento.') + '</strong> ' +
                       enviados + ' enviados, ' + erros + ' com erro.';
            if (erros > 0 && s.campanhaId) {
                html += '<div id="dispBreakdown" style="margin-top:8px"><span class="hint">Carregando motivos…</span></div>';
            }
            $('dispOkMsg').innerHTML = html;
            $('dispOkMsg').dataset.cacheKey = cacheKey;

            if (erros > 0 && s.campanhaId) {
                carregarBreakdownErros(s.campanhaId);
            }
        }
        $('dispOkMsg').classList.remove('hidden');
    } else {
        $('dispErrMsg').classList.add('hidden');
        $('dispOkMsg').classList.add('hidden');
        $('dispOkMsg').dataset.cacheKey = ''; // limpa cache ao sair desse estado
    }

    $('btnDispConcluir').style.display = st === 'finished' ? '' : 'none';
    $('btnDispPausar').style.display   = st === 'running'  ? '' : 'none';
    $('btnDispRetomar').style.display  = st === 'paused'   ? '' : 'none';
    $('btnDispParar').style.display    = (['running','paused','error'].includes(st)) ? '' : 'none';
}

async function carregarBreakdownErros(campanhaId) {
    const el = $('dispBreakdown');
    if (!el) return;
    const breakdown = await fetchBreakdownErros(campanhaId);
    if (!breakdown.length) {
        el.innerHTML = '';
        return;
    }
    const linhas = breakdown.map(b =>
        '<li><span class="camp-num">' + b.qtd + '×</span> ' + escapeHtml(traduzirMotivo(b.motivo)) + '</li>'
    ).join('');
    el.innerHTML =
        '<div style="font-size:11px;color:var(--text-mute);text-transform:uppercase;letter-spacing:.04em;font-weight:500;margin-bottom:4px">Motivos dos erros</div>' +
        '<ul style="margin:0;padding-left:16px;font-size:12px;line-height:1.6">' + linhas + '</ul>';
}

// -----------------------------
// POLLING
// -----------------------------

function startPolling() {
    stopPolling();
    pollTimer = setInterval(async () => {
        const [e, d] = await Promise.all([
            sendBg({ type: 'get-ext-state' }),
            sendBg({ type: 'get-disp-state' })
        ]);
        const extState  = e?.state;
        const dispState = d?.state;

        if (currentTab === 'extrair') {
            if (extState && ['running','paused','error','finished'].includes(extState.status)) {
                renderExtRodando(extState);
            }
        } else if (currentTab === 'disparar') {
            if (dispState && ['running','paused','error','finished'].includes(dispState.status)) {
                renderDispRodando(dispState);
            }
        }

        // Se ambos ficaram sem estado ativo, para polling
        const extActivo  = extState  && ['running','paused'].includes(extState.status);
        const dispActivo = dispState && ['running','paused'].includes(dispState.status);
        if (!extActivo && !dispActivo) stopPolling();
    }, 900);
}
function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

// -----------------------------
// UTIL
// -----------------------------

async function sendBg(msg) {
    try { return await chrome.runtime.sendMessage(msg); }
    catch (e) { return { ok: false, erro: e.message }; }
}

function toast(text, tipo = '') {
    const t = $('toast');
    t.textContent = text;
    t.className = 'toast ' + tipo;
    setTimeout(() => t.classList.add('hidden'), 4000);
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c =>
        ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
}

window.addEventListener('unload', stopPolling);