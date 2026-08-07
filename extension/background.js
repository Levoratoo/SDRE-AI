/* ============================================================
   PROSPECT INSTA — Background Service Worker (v2.0.0)
   ============================================================
   Módulos:
   - EXTRAÇÃO: coleta seguidores de um perfil (mantido do v1.x)
   - DISPARO:  automação DOM que abre abas do IG e envia Direct
   ============================================================ */

import {
    getConfig, panelCall, getIgCookies,
    findInstagramTab,
    fetchFollowersPageViaTab, fetchCurrentIgUserViaTab,
    fetchIgProfileInfoViaTab
} from './lib.js';

const STORAGE_EXT  = 'extractionState';
const STORAGE_DISP = 'dispatchState';
const ALARM_EXT    = 'pi_ext_wake';
const ALARM_DISP   = 'pi_disp_wake';
const ALARM_QUEUE  = 'pi_queue_poll';
const BATCH_SMALL  = 50; // 1 página IG ≈ 50 leads → envia lote inteiro
const DEFAULT_DELAY_MIN = 700;
const DEFAULT_DELAY_MAX = 1600;

const log  = (...args) => console.log('[PI]', ...args);
const logD = (...args) => console.log('[PI-Disp]', ...args);

// -----------------------------
// STATE HELPERS
// -----------------------------

async function getExtState()  { return (await chrome.storage.local.get(STORAGE_EXT))[STORAGE_EXT]  || null; }
async function getDispState() { return (await chrome.storage.local.get(STORAGE_DISP))[STORAGE_DISP] || null; }

async function setExtState(s)  { await chrome.storage.local.set({ [STORAGE_EXT]: s });
    chrome.runtime.sendMessage({ type: 'ext-state-updated', state: s }).catch(() => {}); }

async function setDispState(s) { await chrome.storage.local.set({ [STORAGE_DISP]: s });
    chrome.runtime.sendMessage({ type: 'disp-state-updated', state: s }).catch(() => {}); }

async function updateDispState(patch) {
    const s = await getDispState();
    if (!s) return null;
    const next = { ...s, ...patch };
    await setDispState(next);
    return next;
}

async function clearExtState()  { await chrome.storage.local.remove(STORAGE_EXT);
    chrome.runtime.sendMessage({ type: 'ext-state-cleared' }).catch(() => {}); }
async function clearDispState() { await chrome.storage.local.remove(STORAGE_DISP);
    chrome.runtime.sendMessage({ type: 'disp-state-cleared' }).catch(() => {}); }

// -----------------------------
// MESSAGE ROUTER
// -----------------------------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    (async () => {
        try {
            switch (msg.type) {
                // --- extração ---
                case 'start-extraction':
                    await handleStartExtraction(msg.profile, msg.nome, msg.tabId, msg.config || {});
                    return sendResponse({ ok: true });
                case 'pause-extraction':
                    await handlePauseExt();
                    return sendResponse({ ok: true });
                case 'resume-extraction':
                    await handleResumeExt();
                    return sendResponse({ ok: true });
                case 'cancel-extraction':
                    await handleCancelExt();
                    return sendResponse({ ok: true });
                case 'clear-ext-state':
                    await chrome.alarms.clear(ALARM_EXT);
                    await clearExtState();
                    return sendResponse({ ok: true });
                case 'get-ext-state':
                    return sendResponse({ ok: true, state: await getExtState() });

                // --- sessão ---
                case 'sync-session': {
                    const info = await handleSyncSession(msg.tabId);
                    return sendResponse({ ok: true, info });
                }

                // --- disparo ---
                case 'list-active-campaigns': {
                    const r = await panelCall('/api/insta/campanhas_callback.php?action=list_active');
                    return sendResponse({ ok: true, campanhas: r.campanhas || [] });
                }
                case 'get-erros-breakdown': {
                    const r = await panelCall('/api/insta/campanhas_callback.php?action=stats_erros&campanha_id=' + msg.campanhaId);
                    return sendResponse({ ok: true, breakdown: r.erros_por_motivo || [] });
                }
                case 'get-disp-state':
                    return sendResponse({ ok: true, state: await getDispState() });
                case 'start-dispatch':
                    await handleStartDispatch(msg.campanha);
                    return sendResponse({ ok: true });
                case 'pause-dispatch':
                    await handlePauseDispatch();
                    return sendResponse({ ok: true });
                case 'resume-dispatch':
                    await handleResumeDispatch();
                    return sendResponse({ ok: true });
                case 'stop-dispatch':
                    await handleStopDispatch();
                    return sendResponse({ ok: true });
                case 'clear-disp-state':
                    await chrome.alarms.clear(ALARM_DISP);
                    await clearDispState();
                    return sendResponse({ ok: true });

                default:
                    return sendResponse({ ok: false, erro: 'msg desconhecida: ' + msg.type });
            }
        } catch (e) {
            log('handler error:', e);
            return sendResponse({ ok: false, erro: e.message });
        }
    })();
    return true;
});

// -----------------------------
// TAB HELPERS
// -----------------------------

async function pegarAbaIg(preferTabId = null) {
    if (preferTabId) {
        try {
            const t = await chrome.tabs.get(preferTabId);
            if (t && /^https:\/\/(www\.)?instagram\.com\//.test(t.url || '')) return t;
        } catch { }
    }
    return findInstagramTab();
}

function waitForTabComplete(tabId, timeoutMs = 30000) {
    return new Promise((resolve) => {
        const t0 = Date.now();
        const timer = setInterval(async () => {
            if (Date.now() - t0 > timeoutMs) { clearInterval(timer); resolve(false); return; }
            try {
                const t = await chrome.tabs.get(tabId);
                if (t?.status === 'complete') { clearInterval(timer); resolve(true); }
            } catch { clearInterval(timer); resolve(false); }
        }, 300);
    });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ============================================================
// ============ MÓDULO EXTRAÇÃO (mantido do v1.x) =============
// ============================================================

function sanitizeForPayload(user) {
    return {
        pk: user.pk,
        username: user.username,
        full_name: (user.full_name || '').substring(0, 100),
        is_private:  !!user.is_private,
        is_verified: !!user.is_verified,
        is_business: !!user.is_business
    };
}

function delayExtFromConfig(config) {
    const min = (config?.delayMinMs && config.delayMinMs >= 400) ? config.delayMinMs : DEFAULT_DELAY_MIN;
    const max = (config?.delayMaxMs && config.delayMaxMs > min) ? config.delayMaxMs : DEFAULT_DELAY_MAX;
    return Math.floor(min + Math.random() * (max - min));
}

async function handleStartExtraction(profile, nome, tabId, config, existingExtractionId = null) {
    // Mutex: não permite se disparo tá rodando
    const disp = await getDispState();
    if (disp && disp.status === 'running') {
        throw new Error('Disparo em andamento — pause antes de extrair.');
    }
    log('start-extraction', profile.username, 'tabId=', tabId, 'config=', config, 'existing=', existingExtractionId);

    const cfg = {
        limite:     (config.limite && config.limite > 0) ? Math.floor(config.limite) : null,
        delayMinMs: config.delayMinMs || DEFAULT_DELAY_MIN,
        delayMaxMs: config.delayMaxMs || DEFAULT_DELAY_MAX
    };

    let extractionId = existingExtractionId;
    if (extractionId) {
        const resp = await panelCall('/api/insta/extractions_activate.php', {
            method: 'POST',
            body: {
                extraction_id: extractionId,
                perfil_alvo_pk: profile.pk,
                perfil_alvo_full_name: (profile.full_name || '').substring(0, 100),
                perfil_alvo_is_private: profile.is_private,
                perfil_alvo_seguidores: profile.followers_count,
            }
        });
        extractionId = resp.extraction.id;
        if (resp.extraction.limite) cfg.limite = resp.extraction.limite;
        if (resp.extraction.delay_min_ms) cfg.delayMinMs = resp.extraction.delay_min_ms;
        if (resp.extraction.delay_max_ms) cfg.delayMaxMs = resp.extraction.delay_max_ms;
    } else {
        const resp = await panelCall('/api/insta/extractions_start.php', {
            method: 'POST',
            body: {
                perfil_alvo_username: profile.username,
                perfil_alvo_pk: profile.pk,
                perfil_alvo_full_name: (profile.full_name || '').substring(0, 100),
                perfil_alvo_is_private: profile.is_private,
                perfil_alvo_seguidores: profile.followers_count,
                nome: nome || ('@' + profile.username)
            }
        });
        extractionId = resp.extraction.id;
    }

    await setExtState({
        status: 'running',
        extractionId,
        profile, tabId: tabId || null, config: cfg,
        capturedCount: 0, newSinceLastBatch: 0, lastMaxId: null,
        batchBuffer: [], startedAt: Date.now(),
        lastError: null, lastRequestAt: null,
        errorCount: 0, rateLimitedUntil: 0
    });

    scheduleExtNext(100);
}

async function handlePauseExt() {
    const s = await getExtState();
    if (!s || s.status !== 'running') return;
    s.status = 'paused';
    await setExtState(s);
    await chrome.alarms.clear(ALARM_EXT);
    await panelCall('/api/insta/extractions_pause.php', {
        method: 'POST', body: { extraction_id: s.extractionId, max_id: s.lastMaxId }
    }).catch(() => {});
}

async function handleResumeExt() {
    const s = await getExtState();
    if (!s || s.status !== 'paused') return;
    s.status = 'running';
    s.errorCount = 0; s.rateLimitedUntil = 0; s.lastError = null;
    await setExtState(s);
    scheduleExtNext(300);
}

async function handleCancelExt() {
    const s = await getExtState();
    if (!s) return;
    await chrome.alarms.clear(ALARM_EXT);
    if (s.batchBuffer && s.batchBuffer.length) await sendBatchExt(s).catch(() => {});
    await panelCall('/api/insta/extractions_finish.php', {
        method: 'POST', body: { extraction_id: s.extractionId, status: 'cancelled' }
    }).catch(() => {});
    await clearExtState();
}

async function handleSyncSession(tabId) {
    const cookies = await getIgCookies();
    if (!cookies.sessionid) throw new Error('Não logado no Instagram — abra www.instagram.com e faça login primeiro.');
    let ig_username = null;
    let ig_user_pk  = cookies.ds_user_id ? Number(cookies.ds_user_id) : null;
    const tab = await pegarAbaIg(tabId);
    if (tab) {
        try {
            const u = await fetchCurrentIgUserViaTab(tab.id);
            if (u && !u.__error) { ig_username = u.username; if (u.pk) ig_user_pk = u.pk; }
        } catch { }
    }
    const payload = { ...cookies, user_agent: navigator.userAgent, ig_username, ig_user_pk };
    const r = await panelCall('/api/insta/session_sync.php', { method: 'POST', body: payload });
    return { ig_username: r.ig_username, ig_user_pk: r.ig_user_pk };
}

async function scheduleExtNext(delayMs) {
    log('scheduleExtNext:', delayMs, 'ms (' + Math.round(delayMs/1000) + 's)');
    await chrome.alarms.clear(ALARM_EXT);

    // Alarms tem resolução mínima de 30s (0.5min) em MV3.
    // Para delays curtos usa setTimeout (mais preciso).
    // Para delays longos usa alarms (sobrevive à morte do service worker).
    if (delayMs < 30000) {
        setTimeout(() => { runExtIteration().catch(e => log('ext iter err:', e)); }, delayMs);
        // Backup alarm em 30s caso o SW morra durante o setTimeout curto
        chrome.alarms.create(ALARM_EXT, { delayInMinutes: 0.5 });
    } else {
        // Alarm como timer principal — sobrevive a morte do SW
        chrome.alarms.create(ALARM_EXT, { delayInMinutes: Math.max(0.5, delayMs / 60000) });
    }
}

async function runExtIteration() {
    if (_extRunning) { log('ext iteration já em execução, pulando'); return; }
    _extRunning = true;
    try {
        await _runExtIterationInner();
    } finally {
        _extRunning = false;
    }
}

async function _runExtIterationInner() {
    const s = await getExtState();
    if (!s || s.status !== 'running') return;
    if (s.rateLimitedUntil && Date.now() < s.rateLimitedUntil) {
        scheduleExtNext(s.rateLimitedUntil - Date.now()); return;
    }
    if (s.config?.limite && s.capturedCount >= s.config.limite) {
        while (s.batchBuffer && s.batchBuffer.length > 0) {
            try { await sendBatchExt(s, BATCH_SMALL); } catch { break; }
        }
        s.status = 'finished'; await setExtState(s);
        await finishExtOnPanel(s, 'finished');
        return;
    }
    const cookies = await getIgCookies();
    if (!cookies.sessionid) {
        s.status = 'error'; s.lastError = 'Você não está logado no Instagram.';
        await setExtState(s); await finishExtOnPanel(s, 'error', s.lastError);
        return;
    }
    const tab = await pegarAbaIg(s.tabId);
    if (!tab) {
        s.status = 'paused';
        s.lastError = 'Nenhuma aba do Instagram aberta. Abra www.instagram.com e clique em Retomar.';
        await setExtState(s); await chrome.alarms.clear(ALARM_EXT);
        return;
    }
    s.tabId = tab.id;

    let page;
    try {
        page = await fetchFollowersPageViaTab(tab.id, s.profile.pk, s.lastMaxId);
    } catch (e) {
        s.errorCount = (s.errorCount || 0) + 1;
        s.lastError = e.message;
        if (e.code === 'RATE') {
            s.rateLimitedUntil = Date.now() + (15 + Math.random() * 15) * 60 * 1000;
            await setExtState(s); scheduleExtNext(s.rateLimitedUntil - Date.now()); return;
        }
        if (e.code === 'AUTH') {
            s.status = 'error'; await setExtState(s);
            await finishExtOnPanel(s, 'error', 'Sessão do IG inválida.'); return;
        }
        if (s.errorCount >= 5) {
            s.status = 'error'; await setExtState(s);
            await finishExtOnPanel(s, 'error', 'Muitos erros: ' + s.lastError); return;
        }
        await setExtState(s); scheduleExtNext(3000 * s.errorCount); return;
    }

    s.errorCount = 0; s.lastError = null; s.lastRequestAt = Date.now();

    for (const u of page.users) {
        if (s.config?.limite && s.capturedCount >= s.config.limite) break;
        s.batchBuffer.push(u); s.capturedCount++; s.newSinceLastBatch++;
    }
    s.lastMaxId = page.next_max_id;

    const limiteAtingido = s.config?.limite && s.capturedCount >= s.config.limite;
    const acabou = !page.next_max_id || limiteAtingido;

    while (s.batchBuffer.length >= BATCH_SMALL || (acabou && s.batchBuffer.length > 0)) {
        await sendBatchExt(s, BATCH_SMALL);
    }

    if (acabou) {
        s.status = 'finished'; await setExtState(s);
        await finishExtOnPanel(s, 'finished'); return;
    }
    await setExtState(s);
    scheduleExtNext(delayExtFromConfig(s.config));
}

async function sendBatchExt(s, maxItems = BATCH_SMALL) {
    if (!s.batchBuffer || s.batchBuffer.length === 0) return;
    const take = Math.min(maxItems, s.batchBuffer.length);
    const raw = s.batchBuffer.splice(0, take);
    const leadsToSend = raw.map(sanitizeForPayload);
    try {
        const r = await panelCall('/api/insta/extractions_batch.php', {
            method: 'POST',
            body: { extraction_id: s.extractionId, leads: leadsToSend, max_id: s.lastMaxId }
        });
        s.newSinceLastBatch = 0;
        log('batch sent:', r.novos, 'novos,', r.reprocessados, 'repro,', r.total_capturado, 'total');
    } catch (e) {
        s.batchBuffer.unshift(...raw);
        s.lastError = 'Falha ao enviar batch: ' + e.message;
        throw e;
    }
}

async function finishExtOnPanel(s, status, erro = null) {
    while (s.batchBuffer && s.batchBuffer.length > 0) {
        try { await sendBatchExt(s); } catch { break; }
    }
    await panelCall('/api/insta/extractions_finish.php', {
        method: 'POST', body: { extraction_id: s.extractionId, status, erro_mensagem: erro }
    }).catch(() => {});
}

// ============================================================
// ============ MÓDULO DISPARO (novo v2.0.0) ==================
// ============================================================

async function handleStartDispatch(campanha) {
    // Mutex: não permite se extração está rodando
    const ext = await getExtState();
    if (ext && ext.status === 'running') {
        throw new Error('Extração em andamento — pause antes de disparar.');
    }

    const cookies = await getIgCookies();
    if (!cookies.sessionid) throw new Error('Não logado no Instagram. Faça login em instagram.com primeiro.');

    logD('start-dispatch:', campanha.nome, campanha.id);

    await setDispState({
        status: 'running',
        campanhaId: campanha.id,
        campanhaNome: campanha.nome,
        total: Number(campanha.total || 0),
        enviados: Number(campanha.enviados || 0),
        erros: Number(campanha.erros || 0),
        restam: Number(campanha.restantes || (campanha.total - campanha.enviados - campanha.erros)),
        minDelayMin: Number(campanha.min_delay_min || 3),
        maxDelayMin: Number(campanha.max_delay_min || 8),
        leadAtual: null,
        lastError: null,
        startedAt: Date.now()
    });

    scheduleDispNext(1000);
}

async function handlePauseDispatch() {
    const s = await getDispState();
    if (!s || s.status !== 'running') return;
    await updateDispState({ status: 'paused' });
    await chrome.alarms.clear(ALARM_DISP);
}

async function handleResumeDispatch() {
    const s = await getDispState();
    if (!s || s.status !== 'paused') return;
    const cookies = await getIgCookies();
    if (!cookies.sessionid) throw new Error('Não logado no Instagram.');
    await updateDispState({ status: 'running', lastError: null });
    scheduleDispNext(1000);
}

async function handleStopDispatch() {
    await chrome.alarms.clear(ALARM_DISP);
    await clearDispState();
}

async function scheduleDispNext(delayMs) {
    logD('scheduleDispNext:', delayMs, 'ms (' + Math.round(delayMs/1000) + 's ≈ ' + (delayMs/60000).toFixed(1) + 'min)');
    await chrome.alarms.clear(ALARM_DISP);

    // Alarms tem resolução mínima de 30s (0.5min) em MV3.
    // Para delays curtos usa setTimeout (mais preciso).
    // Para delays longos usa alarms (sobrevive à morte do service worker).
    if (delayMs < 30000) {
        setTimeout(() => {
            runDispIteration().catch(e => logD('disp iter err:', e));
        }, delayMs);
        chrome.alarms.create(ALARM_DISP, { delayInMinutes: 0.5 });
    } else {
        // Alarm como timer principal — sobrevive a morte do SW
        chrome.alarms.create(ALARM_DISP, { delayInMinutes: Math.max(0.5, delayMs / 60000) });
    }
}

// Mutex simples pra prevenir dupla execução (alarm + setTimeout podem competir)
let _dispRunning = false;
let _extRunning = false;

async function runDispIteration() {
    if (_dispRunning) { logD('disp iteration já em execução, pulando'); return; }
    _dispRunning = true;
    try {
        await _runDispIterationInner();
    } finally {
        _dispRunning = false;
    }
}

async function _runDispIterationInner() {
    const s = await getDispState();
    if (!s) { logD('sem estado'); return; }
    if (s.status !== 'running') { logD('status:', s.status); return; }

    // 1. Verifica status da campanha
    let check;
    try {
        check = await panelCall('/api/insta/campanhas_callback.php?action=check_status&campanha_id=' + s.campanhaId);
    } catch (e) {
        logD('check err:', e.message);
        await updateDispState({ lastError: 'Falha ao verificar status: ' + e.message });
        scheduleDispNext(30000);
        return;
    }

    if (!check.executavel) {
        if (check.motivo?.startsWith('status_')) {
            // campanha pausada/cancelada externamente
            await updateDispState({
                status: 'paused',
                lastError: 'Campanha foi ' + check.motivo.replace('status_', '') + ' no painel.'
            });
            return;
        }
        // Fora de janela / bloqueado — aguarda 5 min
        await updateDispState({ lastError: 'Aguardando janela: ' + check.motivo });
        scheduleDispNext(5 * 60 * 1000);
        return;
    }

    // 2. Pega próximo lead
    let lote;
    try {
        lote = await panelCall('/api/insta/campanhas_callback.php?action=next_lote&campanha_id=' + s.campanhaId + '&limit=1');
    } catch (e) {
        logD('next_lote err:', e.message);
        await updateDispState({ lastError: 'Erro ao pegar próximo: ' + e.message });
        scheduleDispNext(30000);
        return;
    }

    if (lote.fim_da_fila) {
        await updateDispState({ status: 'finished', lastError: null });
        return;
    }
    if (!lote.leads?.length) {
        scheduleDispNext(15000);
        return;
    }

    const lead = lote.leads[0];
    await updateDispState({ leadAtual: '@' + lead.lead_username, lastError: null });

    // 3. Dispara
    let result;
    try {
        result = await dispatchOneLead(lead);
    } catch (e) {
        logD('dispatch err:', e);
        result = { success: false, error: 'erro_execucao: ' + e.message, fatal: false };
    }
    logD('lead:', lead.lead_username, '=>', result);

    // 4. Callback
    const state = await getDispState();
    if (!state) return;

    try {
        if (result.success) {
            // Monta body com status de todas as ações de engajamento
            const body = { disparo_id: lead.id };

            // Helper pra mapear resultado individual em status/erro
            const mapStatus = (r, defaultOk = 'sent') => {
                if (!r) return null;
                if (r.success) return { status: defaultOk, erro: null };
                if (r.error && r.error.startsWith('skipped_')) return { status: r.error, erro: null };
                return { status: 'error', erro: r.error || 'erro desconhecido' };
            };

            const c = mapStatus(result.comment);
            if (c) { body.comentario_status = c.status; body.comentario_erro = c.erro; }

            const f = mapStatus(result.follow);
            if (f) { body.follow_status = f.status; body.follow_erro = f.erro; }

            const l = mapStatus(result.like);
            if (l) { body.like_status = l.status; body.like_erro = l.erro; }

            const s = mapStatus(result.storie);
            if (s) { body.storie_status = s.status; body.storie_erro = s.erro; }

            await panelCall('/api/insta/campanhas_callback.php?action=mark_sent', {
                method: 'POST', body
            });
            state.enviados = (state.enviados || 0) + 1;
            state.restam = Math.max(0, state.restam - 1);
        } else {
            await panelCall('/api/insta/campanhas_callback.php?action=mark_error', {
                method: 'POST',
                body: {
                    disparo_id: lead.id,
                    erro_mensagem: result.error,
                    sessao_invalida: !!result.fatal
                }
            });
            state.erros = (state.erros || 0) + 1;
            state.restam = Math.max(0, state.restam - 1);
        }
    } catch (e) {
        logD('callback err:', e.message);
    }

    // 5. Se sessão inválida, para tudo
    if (result.fatal) {
        state.status = 'error';
        state.lastError = 'Sessão do Instagram inválida. Reconecte pela extensão.';
        await setDispState(state);
        return;
    }

    await setDispState(state);

    // 6. Delay randomizado (em minutos)
    const min = (lote.min_delay_min || state.minDelayMin || 3) * 60 * 1000;
    const max = (lote.max_delay_min || state.maxDelayMin || 8) * 60 * 1000;
    const waitMs = Math.floor(min + Math.random() * Math.max(0, max - min));
    logD('waiting', Math.round(waitMs / 1000), 'seconds');
    scheduleDispNext(waitMs);
}

/** Abre uma NOVA JANELA, executa DM (digitação humana) + fecha chat + follow + extras */
async function dispatchOneLead(lead) {
    let tab;
    let windowId = null;
    try {
        const win = await chrome.windows.create({
            url: 'https://www.instagram.com/' + encodeURIComponent(lead.lead_username) + '/',
            focused: true,
            type: 'normal',
            width: 1100,
            height: 860,
        });
        windowId = win?.id ?? null;
        tab = win?.tabs?.[0];
        if (!tab?.id) throw new Error('sem_tab_na_janela');
    } catch (e) {
        return { success: false, error: 'nao_abriu_janela: ' + e.message, fatal: false };
    }

    const results = {
        dm: null,
        follow: null,
        storie: null,
        like: null,
        comment: null,
    };

    try {
        // Aguarda a página carregar
        const loaded = await waitForTabComplete(tab.id, 30000);
        if (!loaded) {
            return { success: false, error: 'aba_nao_carregou', fatal: false, ...results };
        }
        await sleep(2500);

        // Verifica URL — se redirecionou pra login/challenge, sessão está inválida
        try {
            const tabInfo = await chrome.tabs.get(tab.id);
            const url = tabInfo?.url || '';
            if (/\/accounts\/login|\/login\/|\/accounts\/onetap|\/challenge\/|\/accounts\/suspended/i.test(url)) {
                logD('URL redirecionou pra:', url);
                return { success: false, error: 'sessao_deslogada_redirect', fatal: true, ...results };
            }
        } catch (e) {
            logD('erro checando url tab:', e.message);
        }

        // ============ 1. ENVIA DM ============
        logD('[1/5] Enviando DM...');
        const dmResults = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: 'MAIN',
            args: [lead.mensagem_render],
            func: dispatchInIG
        });
        results.dm = dmResults?.[0]?.result || { success: false, error: 'sem_resultado', fatal: false };

        // Se DM falhou, retorna sem tentar mais nada
        if (!results.dm.success) {
            logD('DM falhou — abortando resto');
            return { ...results.dm, ...results };
        }
        logD('DM ok');

        // Fecha o chat (Escape) para voltar ao perfil — comportamento humano
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                world: 'MAIN',
                func: closeDirectChatInIG
            });
            logD('Chat fechado');
        } catch (e) {
            logD('erro fechando chat:', e.message);
        }
        await sleep(1200 + Math.random() * 800);

        // Marca DM como enviado no painel IMEDIATAMENTE (pra anti-loop funcionar)
        try {
            await panelCall('/api/insta/campanhas_callback.php?action=mark_dm_sent', {
                method: 'POST',
                body: { disparo_id: lead.id }
            });
            logD('mark_dm_sent ok — enviado_em registrado');
        } catch (e) {
            logD('erro mark_dm_sent:', e.message);
        }

        // Voltar pro perfil se o chat ainda estiver aberto / URL mudou
        const backToProfile = async () => {
            await chrome.tabs.update(tab.id, {
                url: 'https://www.instagram.com/' + encodeURIComponent(lead.lead_username) + '/'
            });
            const reloaded = await waitForTabComplete(tab.id, 20000);
            if (!reloaded) return false;
            await sleep(2500);
            return true;
        };

        // ============ 2. SEGUIR PERFIL ============
        if (lead.follow_status === 'pending' || lead.seguir_perfil) {
            const delayMs = 8000 + Math.random() * 7000;
            logD('[2/5] Aguardando', Math.round(delayMs/1000), 's antes de seguir');
            await sleep(delayMs);

            logD('Tentando seguir no perfil atual');
            let followResults = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                world: 'MAIN',
                func: followProfileInIG
            });
            results.follow = followResults?.[0]?.result || { success: false, error: 'sem_resultado' };

            // Se o botão não apareceu (ainda no chat), recarrega perfil e tenta de novo
            if (!results.follow.success && !/skipped_already_following/i.test(results.follow.error || '')) {
                logD('Follow falhou no perfil atual — recarregando');
                if (await backToProfile()) {
                    followResults = await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        world: 'MAIN',
                        func: followProfileInIG
                    });
                    results.follow = followResults?.[0]?.result || { success: false, error: 'sem_resultado' };
                } else {
                    results.follow = { success: false, error: 'perfil_nao_recarregou' };
                }
            }
            logD('Follow: ' + (results.follow.success ? 'ok' : results.follow.error));
        }

        // ============ 3. RESPONDER STORIE (se tiver ativo) ============
        if (lead.storie_render) {
            const delayMs = 10000 + Math.random() * 10000;
            logD('[3/5] Aguardando', Math.round(delayMs/1000), 's antes de checar storie');
            await sleep(delayMs);

            if (!(await backToProfile())) {
                results.storie = { success: false, error: 'perfil_nao_recarregou' };
            } else {
                // Primeiro verifica se tem storie ativo
                const checkResults = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    world: 'MAIN',
                    args: [lead.lead_username],
                    func: checkHasActiveStorieInIG
                });
                const hasStorie = !!checkResults?.[0]?.result?.hasStorie;

                if (!hasStorie) {
                    logD('Sem storie ativo — skipping');
                    results.storie = { success: false, error: 'skipped_no_storie' };
                } else {
                    logD('Tem storie — tentando responder via debugger');
                    results.storie = await replyStorieViaDebugger(tab.id, lead.lead_username, lead.storie_render);
                    logD('Storie: ' + (results.storie.success ? 'ok' : results.storie.error));
                }
            }
        }

        // ============ 4+5. NAVEGA PRO POST (se precisar curtir OU comentar) ============
        if (lead.like_status === 'pending' || lead.curtir_ultimo_post || lead.comentario_render) {
            const delayMs = 15000 + Math.random() * 15000;
            logD('[4/5] Aguardando', Math.round(delayMs/1000), 's antes de ir ao post');
            await sleep(delayMs);

            if (!(await backToProfile())) {
                if (lead.like_status === 'pending' || lead.curtir_ultimo_post) results.like = { success: false, error: 'perfil_nao_recarregou' };
                if (lead.comentario_render) results.comment = { success: false, error: 'perfil_nao_recarregou' };
            } else {
                // Localiza URL do primeiro post
                const urlResults = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    world: 'MAIN',
                    func: findFirstPostUrl
                });
                const postUrl = urlResults?.[0]?.result;

                if (!postUrl) {
                    logD('sem posts no perfil');
                    if (lead.like_status === 'pending' || lead.curtir_ultimo_post) results.like = { success: false, error: 'skipped_no_posts' };
                    if (lead.comentario_render) results.comment = { success: false, error: 'skipped_no_posts' };
                } else {
                    // Navega pro post
                    await chrome.tabs.update(tab.id, { url: postUrl });
                    const postLoaded = await waitForTabComplete(tab.id, 20000);
                    if (!postLoaded) {
                        if (lead.like_status === 'pending' || lead.curtir_ultimo_post) results.like = { success: false, error: 'post_nao_carregou' };
                        if (lead.comentario_render) results.comment = { success: false, error: 'post_nao_carregou' };
                    } else {
                        await sleep(3000);

                        // === 4. CURTIR ===
                        if (lead.like_status === 'pending' || lead.curtir_ultimo_post) {
                            logD('Curtindo post');
                            const likeResults = await chrome.scripting.executeScript({
                                target: { tabId: tab.id },
                                world: 'MAIN',
                                func: likePostInIG
                            });
                            results.like = likeResults?.[0]?.result || { success: false, error: 'sem_resultado' };
                            logD('Like: ' + (results.like.success ? 'ok' : results.like.error));

                            // Pequeno delay antes de comentar
                            if (lead.comentario_render) await sleep(5000 + Math.random() * 5000);
                        }

                        // === 5. COMENTAR (via debugger) ===
                        if (lead.comentario_render) {
                            logD('[5/5] Comentando via debugger');
                            results.comment = await commentViaDebugger(tab.id, lead.comentario_render);
                            if (results.comment.debug) {
                                logD('COMMENT trail:');
                                for (const l of results.comment.debug) logD('  ' + l);
                            }
                            logD('Comment: ' + (results.comment.success ? 'ok' : results.comment.error));
                        }
                    }
                }
            }
        }

        return { ...results.dm, ...results };

    } catch (e) {
        logD('excecao dispatchOneLead:', e.message);
        return { success: false, error: 'excecao: ' + e.message, fatal: false, ...results };
    } finally {
        // Fecha a janela inteira (não só a aba)
        try {
            if (windowId != null) await chrome.windows.remove(windowId);
            else if (tab?.id) await chrome.tabs.remove(tab.id);
        } catch {}
    }
}

/** Fecha o modal/aba de Direct com Escape (volta pro perfil). */
async function closeDirectChatInIG() {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 3; i++) {
        document.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true,
        }));
        document.body?.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true,
        }));
        await sleep(400);
    }
    // Fecha botão X do direct se ainda estiver aberto
    const closeBtn = [...document.querySelectorAll('svg[aria-label], button, [role="button"]')]
        .find((el) => {
            const label = (el.getAttribute?.('aria-label') || el.textContent || '').trim();
            return /^(fechar|close)$/i.test(label);
        });
    if (closeBtn) {
        const clickable = closeBtn.closest?.('button, [role="button"]') || closeBtn;
        try { clickable.click(); } catch {}
    }
    return true;
}

/**
 * Segue o perfil que está aberto na aba. Retorna { success, error? }
 * Detecta se já segue e pula com skipped_already_following.
 */
async function followProfileInIG() {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const isVisible = (el) => {
        if (!el) return false;
        try {
            const st = window.getComputedStyle(el);
            return el.offsetParent !== null && st.visibility !== 'hidden' && st.display !== 'none'
                && el.offsetWidth > 0 && el.offsetHeight > 0;
        } catch { return false; }
    };
    const waitFor = async (fn, ms = 8000) => {
        const s = Date.now();
        while (Date.now() - s < ms) {
            const r = fn();
            if (r) return r;
            await sleep(250);
        }
        return null;
    };

    // Textos que indicam que JÁ está seguindo (todas variações)
    const jaSegueRegex = /^(seguindo|following|solicitado|requested|pendente|pending|amigos|friends)$/i;
    // Textos que indicam botão de seguir (todas variações)
    const seguirRegex = /^(seguir|follow|seguir de volta|follow back)$/i;

    const acharBotaoTexto = (regex) => {
        const btns = [...document.querySelectorAll('button, [role="button"], div[role="button"], header button')];
        for (const b of btns) {
            const txt = (b.textContent || '').trim();
            if (regex.test(txt) && isVisible(b)) return b;
        }
        return null;
    };

    try {
        await sleep(1500);

        // Antes de tudo, verifica se JÁ está seguindo (sem clicar)
        if (acharBotaoTexto(jaSegueRegex)) {
            return { success: false, error: 'skipped_already_following' };
        }

        // Localiza botão Seguir
        const btnSeguir = await waitFor(() => acharBotaoTexto(seguirRegex), 8000);
        if (!btnSeguir) {
            // Talvez esteja no meio de re-render, checa novamente já-seguindo
            if (acharBotaoTexto(jaSegueRegex)) {
                return { success: false, error: 'skipped_already_following' };
            }
            return { success: false, error: 'botao_seguir_nao_encontrado' };
        }

        // Salva referência do texto do botão pra verificar depois
        const textoAntes = (btnSeguir.textContent || '').trim();
        btnSeguir.click();
        await sleep(1500);

        // Loop de verificação: aguarda até 5s pra detectar sucesso
        // Sucesso = qualquer um destes:
        //   1. Botão agora diz "Seguindo/Solicitado/etc"
        //   2. Botão sumiu (Instagram fez re-render após follow)
        //   3. Texto do botão MUDOU pra qualquer coisa diferente do texto antes do click
        const confirmou = await waitFor(() => {
            // Cenário 1: acha botão "Seguindo/Solicitado/..."
            if (acharBotaoTexto(jaSegueRegex)) return 'ja_segue';

            // Cenário 2: botão original sumiu do DOM (Instagram fez re-render)
            if (!document.contains(btnSeguir)) return 'sumiu';

            // Cenário 3: texto mudou pra algo diferente (não é mais "Seguir")
            const textoAgora = (btnSeguir.textContent || '').trim();
            if (textoAgora !== textoAntes && !seguirRegex.test(textoAgora)) return 'texto_mudou:' + textoAgora;

            return null;
        }, 5000);

        if (confirmou) return { success: true };

        // Última verificação — talvez apareceu modal do Instagram
        // (ex: "Ative notificações pra @user")
        const temModalNotif = /notificaç(ões|oes)|notifications|ativar/i.test((document.body?.innerText || '').substring(0, 500));
        if (temModalNotif) {
            // Instagram frequentemente mostra modal — significa que o follow deu certo
            return { success: true };
        }

        return { success: false, error: 'follow_nao_confirmou' };

    } catch (e) {
        return { success: false, error: 'excecao: ' + (e?.message || 'erro') };
    }
}

/**
 * Curte o post da página atual. Retorna { success, error? }
 * Detecta se já curtiu e pula com skipped_already_liked.
 */
async function likePostInIG() {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const isVisible = (el) => {
        if (!el) return false;
        try {
            const st = window.getComputedStyle(el);
            return el.offsetParent !== null && st.visibility !== 'hidden' && st.display !== 'none';
        } catch { return false; }
    };
    const waitFor = async (fn, ms = 8000) => {
        const s = Date.now();
        while (Date.now() - s < ms) {
            const r = fn();
            if (r) return r;
            await sleep(250);
        }
        return null;
    };

    try {
        await sleep(1500);

        // Localiza SVG com aria-label "Curtir" / "Like" / "Descurtir" / "Unlike"
        // Sobe até o botão pai clicável
        const findHeartBtn = () => {
            const svgs = [...document.querySelectorAll('svg[aria-label]')];
            for (const svg of svgs) {
                const label = svg.getAttribute('aria-label') || '';
                if (/^(curtir|like|descurtir|unlike)$/i.test(label)) {
                    const btn = svg.closest('button, [role="button"], div[role="button"], span[role="button"]');
                    if (btn && isVisible(btn)) return { btn, label };
                }
            }
            return null;
        };

        const heart = await waitFor(findHeartBtn, 8000);
        if (!heart) {
            return { success: false, error: 'botao_curtir_nao_encontrado' };
        }

        // Se já está curtido (label = Descurtir/Unlike), pula
        if (/^(descurtir|unlike)$/i.test(heart.label)) {
            return { success: false, error: 'skipped_already_liked' };
        }

        heart.btn.click();
        await sleep(1500);

        // Verifica que virou "Descurtir" (indicando que curtiu)
        const virouCurtido = findHeartBtn();
        if (virouCurtido && /^(descurtir|unlike)$/i.test(virouCurtido.label)) {
            return { success: true };
        }
        return { success: false, error: 'like_nao_confirmou' };

    } catch (e) {
        return { success: false, error: 'excecao: ' + (e?.message || 'erro') };
    }
}

/**
 * Verifica se o perfil tem storie ativo (círculo colorido na foto).
 * Retorna { hasStorie: bool }
 */
function checkHasActiveStorieInIG(username) {
    try {
        // Estratégia 1: aria-label do link do avatar
        // Instagram usa "Ver story de {username}" ou "Story de {username}"
        const links = [...document.querySelectorAll('a[role="link"], header a, div[role="button"]')];
        for (const link of links) {
            const aria = (link.getAttribute('aria-label') || '').toLowerCase();
            if (/story|storie|hist[óo]ria/i.test(aria) && (aria.includes(username.toLowerCase()) || aria.length < 60)) {
                return { hasStorie: true, source: 'aria: ' + aria.substring(0, 40) };
            }
        }

        // Estratégia 2: canvas colorido em volta do avatar (indica anel de storie)
        const canvases = [...document.querySelectorAll('header canvas')];
        for (const c of canvases) {
            if (c.width > 100 && c.height > 100 && c.offsetParent !== null) {
                return { hasStorie: true, source: 'canvas' };
            }
        }

        return { hasStorie: false };
    } catch (e) {
        return { hasStorie: false, error: e.message };
    }
}

/**
 * Abre storie do perfil e responde via debugger (mesmo trick do comment).
 * Retorna { success, error?, debug? }
 */
async function replyStorieViaDebugger(tabId, username, texto) {
    const debuggee = { tabId };
    const debug = [];
    const log = (msg) => {
        debug.push(msg);
        try { console.log('[PI-StorieDbg]', msg); } catch {}
    };
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    let attached = false;

    try {
        log('inicio. texto len: ' + texto.length);

        // 1. Attach debugger no tab
        try {
            await chrome.debugger.attach(debuggee, "1.3");
            attached = true;
            log('debugger attached');
        } catch (e) {
            log('attach err: ' + e.message);
            try {
                await chrome.debugger.detach(debuggee);
                await sleep(500);
                await chrome.debugger.attach(debuggee, "1.3");
                attached = true;
                log('attached na 2a tentativa');
            } catch (e2) {
                return { success: false, error: 'debugger_attach_falhou', debug };
            }
        }

        await sleep(800);

        // 2. Clica na foto do perfil pra abrir stories
        const openResults = await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            args: [username],
            func: (uname) => {
                const isVisible = (el) => {
                    if (!el) return false;
                    try {
                        const st = window.getComputedStyle(el);
                        return el.offsetParent !== null && st.visibility !== 'hidden' && st.display !== 'none';
                    } catch { return false; }
                };

                // Tenta clicar no link/botão do storie
                const candidates = [...document.querySelectorAll('a[role="link"], header a, div[role="button"], header button')];
                for (const el of candidates) {
                    const aria = (el.getAttribute('aria-label') || '').toLowerCase();
                    if (/story|storie|hist[óo]ria/i.test(aria) && isVisible(el)) {
                        el.click();
                        return { clicked: true, source: 'aria' };
                    }
                }

                // Fallback: clica na imagem do perfil no header
                const img = document.querySelector('header img[alt*="perfil"], header img[alt*="profile"]');
                if (img && isVisible(img)) {
                    const btn = img.closest('a, button, [role="button"]');
                    if (btn) {
                        btn.click();
                        return { clicked: true, source: 'imagem' };
                    }
                }
                return { clicked: false };
            }
        });

        if (!openResults?.[0]?.result?.clicked) {
            log('nao conseguiu abrir storie');
            return { success: false, error: 'nao_abriu_storie', debug };
        }
        log('storie aberto');

        // 3. Aguarda modal do storie carregar
        await sleep(3500);

        // 4. Pausa o auto-play (space bar) e/ou aguarda mais um pouco
        await chrome.debugger.sendCommand(debuggee, "Input.dispatchKeyEvent", {
            type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32
        });
        await sleep(100);
        await chrome.debugger.sendCommand(debuggee, "Input.dispatchKeyEvent", {
            type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32
        });
        log('space pra pausar auto-play');

        await sleep(1000);

        // 5. Localiza o campo "Responder ao..." e foca
        const focusResults = await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: () => {
                const isVisible = (el) => {
                    if (!el) return false;
                    try {
                        const st = window.getComputedStyle(el);
                        return el.offsetParent !== null && st.visibility !== 'hidden' && st.display !== 'none';
                    } catch { return false; }
                };

                const replyRegex = /responder|reply|enviar mensagem|send message/i;

                for (const el of document.querySelectorAll('textarea')) {
                    const aria = el.getAttribute('aria-label') || '';
                    const ph = el.getAttribute('placeholder') || '';
                    if (replyRegex.test(aria + ' ' + ph) && isVisible(el)) {
                        el.click();
                        el.focus();
                        return { ok: true, tipo: 'textarea', label: (aria || ph).substring(0, 30) };
                    }
                }

                // Contenteditable
                for (const el of document.querySelectorAll('[contenteditable="true"]')) {
                    const aria = el.getAttribute('aria-label') || '';
                    if (replyRegex.test(aria) && isVisible(el)) {
                        el.click();
                        el.focus();
                        return { ok: true, tipo: 'contenteditable', label: aria.substring(0, 30) };
                    }
                }

                return { ok: false };
            }
        });

        if (!focusResults?.[0]?.result?.ok) {
            log('campo responder nao encontrado');
            return { success: false, error: 'campo_responder_nao_encontrado', debug };
        }
        log('campo focado: ' + focusResults[0].result.label);

        await sleep(700);

        // 6. Digita via debugger
        await chrome.debugger.sendCommand(debuggee, "Input.insertText", { text: texto });
        log('texto enviado');

        await sleep(1500);

        // 7. Envia com Enter
        await chrome.debugger.sendCommand(debuggee, "Input.dispatchKeyEvent", {
            type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r"
        });
        await sleep(100);
        await chrome.debugger.sendCommand(debuggee, "Input.dispatchKeyEvent", {
            type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13
        });
        log('Enter enviado');

        await sleep(3000);

        // 8. Fecha o storie (Escape)
        await chrome.debugger.sendCommand(debuggee, "Input.dispatchKeyEvent", {
            type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27
        });
        await sleep(100);
        await chrome.debugger.sendCommand(debuggee, "Input.dispatchKeyEvent", {
            type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27
        });
        log('storie fechado com Esc');

        return { success: true, debug };

    } catch (e) {
        log('excecao: ' + (e?.message || 'erro'));
        return { success: false, error: 'excecao: ' + (e?.message || 'erro'), debug };
    } finally {
        if (attached) {
            try { await chrome.debugger.detach(debuggee); log('detached'); } catch {}
        }
    }
}

/**
 * Executada dentro da tab do perfil. Retorna a URL do primeiro post visível.
 */
function findFirstPostUrl() {
    try {
        const isVisible = (el) => {
            if (!el) return false;
            const st = window.getComputedStyle(el);
            return el.offsetParent !== null
                && st.visibility !== 'hidden'
                && st.display !== 'none'
                && el.offsetWidth > 0;
        };

        // Aceita posts (/p/) e reels (/reel/)
        const links = [...document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]')];
        for (const a of links) {
            if (isVisible(a) && a.href.includes('instagram.com')) {
                return a.href;
            }
        }
        return null;
    } catch { return null; }
}

/**
 * Comenta no post usando chrome.debugger API — única forma de gerar
 * eventos de teclado com isTrusted:true que enganam o React do Instagram.
 *
 * Atenção: attach mostra barra amarela "Prospect Insta iniciou a depuração"
 * no Chrome enquanto está ativo. Detach ao final some.
 */
async function commentViaDebugger(tabId, texto) {
    const debuggee = { tabId };
    const debug = [];
    const log = (msg) => {
        debug.push(msg);
        try { console.log('[PI-CommentDbg]', msg); } catch {}
    };

    let attached = false;

    try {
        log('inicio. texto len: ' + texto.length);

        // 1. Attach debugger no tab
        try {
            await chrome.debugger.attach(debuggee, "1.3");
            attached = true;
            log('debugger attached');
        } catch (e) {
            log('attach err: ' + e.message);
            try {
                await chrome.debugger.detach(debuggee);
                await new Promise(r => setTimeout(r, 500));
                await chrome.debugger.attach(debuggee, "1.3");
                attached = true;
                log('attached na 2a tentativa');
            } catch (e2) {
                log('attach falhou definitivo: ' + e2.message);
                return { success: false, error: 'debugger_attach_falhou', debug };
            }
        }

        await new Promise(r => setTimeout(r, 800));

        // 2. Localiza campo + foca via executeScript
        const focusResults = await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: () => {
                const isVisible = (el) => {
                    if (!el) return false;
                    try {
                        const st = window.getComputedStyle(el);
                        return el.offsetParent !== null
                            && st.visibility !== 'hidden'
                            && st.display !== 'none'
                            && el.offsetWidth > 0
                            && el.offsetHeight > 0;
                    } catch { return false; }
                };

                const commentRegex = /adicione um coment|adicionar coment|add a comment|comentário|comment/i;

                const bodyLower = (document.body?.innerText || '').toLowerCase();
                if (/coment[áa]rios? (foram )?desativad|comments (are|have been) turned off|has limited/i.test(bodyLower)) {
                    return { ok: false, motivo: 'comentarios_desativados' };
                }

                for (const el of document.querySelectorAll('textarea')) {
                    const aria = el.getAttribute('aria-label') || '';
                    const ph = el.getAttribute('placeholder') || '';
                    if (commentRegex.test(aria + ' ' + ph) && isVisible(el)) {
                        try { el.scrollIntoView({ block: 'center' }); } catch {}
                        el.click();
                        el.focus();
                        return { ok: true, tipo: 'textarea', label: (aria || ph).substring(0, 30) };
                    }
                }

                for (const el of document.querySelectorAll('[contenteditable="true"], div[contenteditable="true"]')) {
                    const aria = el.getAttribute('aria-label') || '';
                    if (commentRegex.test(aria) && isVisible(el)) {
                        try { el.scrollIntoView({ block: 'center' }); } catch {}
                        el.click();
                        el.focus();
                        return { ok: true, tipo: 'contenteditable', label: aria.substring(0, 30) };
                    }
                }

                return { ok: false, motivo: 'campo_nao_encontrado' };
            }
        });

        const focusResult = focusResults?.[0]?.result;
        if (!focusResult?.ok) {
            log('foco falhou: ' + (focusResult?.motivo || 'desconhecido'));
            return { success: false, error: focusResult?.motivo || 'campo_nao_encontrado', debug };
        }
        log('campo focado. tipo: ' + focusResult.tipo + ' | ' + focusResult.label);

        await new Promise(r => setTimeout(r, 700));

        // 3. Digita via debugger — Input.insertText simula digitação real (isTrusted=true)
        log('digitando via debugger.Input.insertText');
        await chrome.debugger.sendCommand(debuggee, "Input.insertText", { text: texto });
        log('texto enviado');

        await new Promise(r => setTimeout(r, 1500));

        // 4. Verifica se botão publicar apareceu e clica; senão envia Enter
        const publishResults = await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: () => {
                const isVisible = (el) => {
                    if (!el) return false;
                    try {
                        const st = window.getComputedStyle(el);
                        return el.offsetParent !== null
                            && st.visibility !== 'hidden'
                            && st.display !== 'none';
                    } catch { return false; }
                };

                const publishRegex = /^(publicar|post|postar|enviar|share)$/i;
                for (const el of document.querySelectorAll('button, [role="button"], div[role="button"]')) {
                    const txt = (el.textContent || '').trim();
                    const aria = el.getAttribute('aria-label') || '';
                    const disabled = el.disabled || el.getAttribute('aria-disabled') === 'true';
                    if ((publishRegex.test(txt) || publishRegex.test(aria)) && isVisible(el) && !disabled) {
                        el.click();
                        return { clicked: true };
                    }
                }
                return { clicked: false };
            }
        });

        if (publishResults?.[0]?.result?.clicked) {
            log('botao publicar clicado');
        } else {
            log('sem botao publicar visivel — enviando Enter via debugger');
            await chrome.debugger.sendCommand(debuggee, "Input.dispatchKeyEvent", {
                type: "keyDown",
                key: "Enter",
                code: "Enter",
                windowsVirtualKeyCode: 13,
                nativeVirtualKeyCode: 13,
                text: "\r"
            });
            await new Promise(r => setTimeout(r, 100));
            await chrome.debugger.sendCommand(debuggee, "Input.dispatchKeyEvent", {
                type: "keyUp",
                key: "Enter",
                code: "Enter",
                windowsVirtualKeyCode: 13,
                nativeVirtualKeyCode: 13
            });
            log('Enter enviado');
        }

        await new Promise(r => setTimeout(r, 3000));

        // 5. Verifica se publicou (campo vazio)
        const checkResults = await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            args: [focusResult.tipo],
            func: (tipo) => {
                const commentRegex = /adicione um coment|adicionar coment|add a comment|comentário|comment/i;
                const isVisible = (el) => el && el.offsetParent !== null;

                if (tipo === 'textarea') {
                    for (const el of document.querySelectorAll('textarea')) {
                        const aria = el.getAttribute('aria-label') || '';
                        const ph = el.getAttribute('placeholder') || '';
                        if (commentRegex.test(aria + ' ' + ph) && isVisible(el)) {
                            return { restante: (el.value || '').trim() };
                        }
                    }
                } else {
                    for (const el of document.querySelectorAll('[contenteditable="true"]')) {
                        const aria = el.getAttribute('aria-label') || '';
                        if (commentRegex.test(aria) && isVisible(el)) {
                            return { restante: (el.textContent || '').trim() };
                        }
                    }
                }
                return { restante: '' };
            }
        });

        const restante = checkResults?.[0]?.result?.restante || '';
        if (restante === '') {
            log('publicado! campo esvaziou');
            return { success: true, debug };
        } else {
            log('campo ainda tem texto: ' + restante.substring(0, 30));
            return { success: false, error: 'comentario_nao_publicou', debug };
        }

    } catch (e) {
        log('excecao: ' + (e?.message || 'erro'));
        return { success: false, error: 'excecao: ' + (e?.message || 'erro'), debug };
    } finally {
        if (attached) {
            try {
                await chrome.debugger.detach(debuggee);
                log('detached');
            } catch (e) { /* ignora */ }
        }
    }
}

/**
 * Executada dentro da página do post. Digita comentário e publica.
 * Retorna { success, error?, debug? }
 * IMPORTANTE: Instagram moderno usa <div contenteditable="true"> em vez de <textarea>.
 * Precisa detectar os dois e usar métodos de digitação apropriados.
 */
async function commentOnPostInIG(texto) {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const debug = [];
    const log = (msg) => {
        debug.push(msg);
        try { console.log('[PI-Comment]', msg); } catch {}
    };

    const isVisible = (el) => {
        if (!el) return false;
        try {
            const st = window.getComputedStyle(el);
            return el.offsetParent !== null
                && st.visibility !== 'hidden'
                && st.display !== 'none'
                && el.offsetWidth > 0
                && el.offsetHeight > 0;
        } catch { return false; }
    };

    const waitFor = async (predicate, timeoutMs = 15000, intervalMs = 300) => {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            try {
                const r = predicate();
                if (r) return r;
            } catch { }
            await sleep(intervalMs);
        }
        return null;
    };

    const findClickable = (regex) => {
        const els = [...document.querySelectorAll('button, [role="button"], div[role="button"]')];
        for (const el of els) {
            const txt = (el.textContent || '').trim();
            const aria = el.getAttribute('aria-label') || '';
            if ((regex.test(txt) || regex.test(aria)) && isVisible(el)) return el;
        }
        return null;
    };

    try {
        await sleep(1500);
        log('inicio. texto len: ' + texto.length);

        // Verifica se o post carregou
        const bodyText = (document.body?.innerText || '').substring(0, 2000);
        if (/página não disponível|not available|sorry, this page/i.test(bodyText.substring(0, 500))) {
            log('página indisponível');
            return { success: false, error: 'post_nao_encontrado', debug };
        }

        // 1. Localiza o campo de comentário
        // Instagram usa: <textarea> OU <div contenteditable="true" role="textbox">
        const commentRegex = /adicione um coment|add a comment|comentário|comment/i;

        const commentBox = await waitFor(() => {
            // Estratégia 1: textarea com aria/placeholder de comentário
            const textareas = [...document.querySelectorAll('textarea')];
            for (const el of textareas) {
                const aria = el.getAttribute('aria-label') || '';
                const ph = el.getAttribute('placeholder') || '';
                if (commentRegex.test(aria + ' ' + ph) && isVisible(el)) {
                    return { el, tipo: 'textarea', label: (aria || ph).substring(0, 30) };
                }
            }

            // Estratégia 2: div contenteditable com aria/role de textbox
            const editables = [...document.querySelectorAll(
                '[contenteditable="true"][role="textbox"], ' +
                'div[contenteditable="true"], ' +
                '[contenteditable="plaintext-only"]'
            )];
            for (const el of editables) {
                const aria = el.getAttribute('aria-label') || '';
                const ph = el.getAttribute('placeholder') || '';
                if (commentRegex.test(aria + ' ' + ph) && isVisible(el)) {
                    return { el, tipo: 'contenteditable', label: (aria || ph).substring(0, 30) };
                }
            }

            // Estratégia 3: qualquer contenteditable visível de tamanho razoável (fallback)
            const editablesVisiveis = editables.filter(el =>
                isVisible(el) && el.offsetHeight > 20 && el.offsetWidth > 100
            );
            if (editablesVisiveis.length === 1) {
                return { el: editablesVisiveis[0], tipo: 'contenteditable', label: 'fallback único' };
            }

            return null;
        }, 12000);

        if (!commentBox) {
            const bodyLower = document.body.innerText.toLowerCase();
            if (/coment[áa]rios? (foram )?desativad|comments (are|have been) turned off|has limited/i.test(bodyLower)) {
                log('comentários desativados');
                return { success: false, error: 'comentarios_desativados', debug };
            }
            log('campo NAO encontrado');
            log('textareas na pag: ' + document.querySelectorAll('textarea').length);
            log('editables na pag: ' + document.querySelectorAll('[contenteditable="true"]').length);
            return { success: false, error: 'campo_comentario_nao_encontrado', debug };
        }

        const { el: box, tipo, label } = commentBox;
        log('campo encontrado. tipo: ' + tipo + ' | label: ' + label);

        // 2. Ativa o campo — click primeiro, depois focus
        try { box.scrollIntoView({ block: 'center', behavior: 'instant' }); } catch {}
        await sleep(500);

        box.click();
        await sleep(500);
        box.focus();
        await sleep(400);

        // 3. Digita — método depende do tipo (mas testa múltiplas estratégias em cascata)
        const getTextoAtual = () => tipo === 'textarea'
            ? (box.value || '').trim()
            : (box.textContent || box.innerText || '').trim();

        // Limpa o campo antes de tentar
        try {
            if (tipo === 'textarea') {
                const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
                if (nativeSetter) nativeSetter.call(box, '');
                else box.value = '';
                box.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
                const range = document.createRange();
                range.selectNodeContents(box);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
                document.execCommand('delete', false);
            }
        } catch (e) { log('erro limpando: ' + e.message); }
        await sleep(300);

        box.focus();
        await sleep(200);

        // ESTRATÉGIA 0: char-by-char com _valueTracker reset A CADA CHAR
        // React 18 pode ter batching mais agressivo — reset por char força ver diff sempre.
        // Combina: tracker reset + beforeinput cancelable + input event
        log('estrategia 0: char-by-char + tracker reset por char');
        try {
            const nativeSetter = tipo === 'textarea'
                ? Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
                : null;

            // Limpa o campo primeiro
            if (tipo === 'textarea') {
                if (box._valueTracker && typeof box._valueTracker.setValue === 'function') {
                    box._valueTracker.setValue('anything');
                }
                if (nativeSetter) nativeSetter.call(box, '');
                else box.value = '';
                box.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
                box.textContent = '';
            }
            await sleep(300);

            box.focus();
            await sleep(200);

            // Ajusta cursor pro fim
            try {
                if (tipo === 'textarea' && typeof box.setSelectionRange === 'function') {
                    box.setSelectionRange(0, 0);
                }
            } catch {}

            let acumulado = '';
            for (const ch of texto) {
                // 1. Reseta _valueTracker ANTES de cada char (força React ver como digitação real)
                if (tipo === 'textarea' && box._valueTracker && typeof box._valueTracker.setValue === 'function') {
                    box._valueTracker.setValue(acumulado);
                }

                // 2. beforeinput cancelable (React 18 escuta)
                const beforeEvt = new InputEvent('beforeinput', {
                    inputType: 'insertText',
                    data: ch,
                    bubbles: true,
                    cancelable: true,
                    composed: true,
                });
                box.dispatchEvent(beforeEvt);

                // 3. Atualiza o valor
                acumulado += ch;
                if (tipo === 'textarea') {
                    if (nativeSetter) nativeSetter.call(box, acumulado);
                    else box.value = acumulado;
                } else {
                    box.textContent = acumulado;
                }

                // 4. input event
                const inputEvt = new InputEvent('input', {
                    inputType: 'insertText',
                    data: ch,
                    bubbles: true,
                    composed: true,
                });
                box.dispatchEvent(inputEvt);

                await sleep(30 + Math.random() * 40);
            }

            // Dispara eventos também no form pai (alguns handlers ficam lá)
            const form = box.closest('form');
            if (form) {
                log('disparando change no form');
                form.dispatchEvent(new Event('input', { bubbles: true }));
                form.dispatchEvent(new Event('change', { bubbles: true }));
            }

            // Blur + focus pra forçar validação
            box.dispatchEvent(new Event('blur', { bubbles: true }));
            await sleep(100);
            box.focus();
            box.dispatchEvent(new Event('focus', { bubbles: true }));

            await sleep(800);
        } catch (e) { log('estrat0 excecao: ' + e.message); }

        log('depois estrat 0, texto: ' + getTextoAtual().length + '/' + texto.length);

        if (getTextoAtual().length < texto.length * 0.8) {
            // ESTRATÉGIA 1: paste event
            log('estrategia 1: paste event');
            try {
                const dt = new DataTransfer();
                dt.setData('text/plain', texto);
                const pasteEvt = new ClipboardEvent('paste', {
                    clipboardData: dt,
                    bubbles: true,
                    cancelable: true,
                });
                box.dispatchEvent(pasteEvt);
                await sleep(600);
            } catch (e) { log('estrat1 excecao: ' + e.message); }
        }

        if (getTextoAtual().length < texto.length * 0.8) {
            // ESTRATÉGIA 2: beforeinput + input event (Lexical escuta)
            log('estrategia 2: beforeinput + input events');
            try {
                box.focus();
                await sleep(200);
                const beforeInputEvt = new InputEvent('beforeinput', {
                    inputType: 'insertText',
                    data: texto,
                    bubbles: true,
                    cancelable: true,
                    composed: true,
                });
                box.dispatchEvent(beforeInputEvt);
                await sleep(200);
                const inputEvt = new InputEvent('input', {
                    inputType: 'insertText',
                    data: texto,
                    bubbles: true,
                    cancelable: false,
                    composed: true,
                });
                box.dispatchEvent(inputEvt);
                await sleep(500);
            } catch (e) { log('estrat2 excecao: ' + e.message); }
        }

        log('final texto: ' + getTextoAtual().length + '/' + texto.length);

        await sleep(1500);

        // 4. Verifica que o texto foi mesmo pro campo antes de tentar publicar
        const textoAtual = tipo === 'textarea'
            ? (box.value || '').trim()
            : (box.textContent || '').trim();

        if (textoAtual.length === 0) {
            log('campo vazio depois de digitar! texto nao entrou');
            return { success: false, error: 'texto_nao_entrou_no_campo', debug };
        }
        log('texto no campo: ' + textoAtual.length + ' chars');

        // 5. Publica — Instagram tem 2 modos:
        //   (a) Botão "Publicar" que só aparece DEPOIS que o React detecta digitação real
        //   (b) Enter no textarea (fallback)
        // Vamos usar o botão publicar aparecer como sinal de que React aceitou o texto.
        
        const publishRegex = /^(publicar|post|postar|enviar|share)$/i;
        
        log('aguardando botao publicar aparecer (sinal que React aceitou)...');
        const publishBtn = await waitFor(() => {
            // Procura botão de publicar
            const btn = findClickable(publishRegex);
            if (btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true') {
                return btn;
            }
            // Fallback: submit button
            const submits = [...document.querySelectorAll('button[type="submit"]')];
            for (const el of submits) {
                if (isVisible(el) && !el.disabled) return el;
            }
            return null;
        }, 5000, 300);

        if (publishBtn) {
            log('botao publicar apareceu! clicando');
            publishBtn.click();
            await sleep(500);
        } else {
            log('botao publicar NAO apareceu — tentando Enter como fallback');
            // Fallback: tenta Enter
            try {
                box.focus();
                await sleep(300);
                const enterEvents = [
                    new KeyboardEvent('keydown', {
                        key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
                        bubbles: true, cancelable: true, composed: true,
                    }),
                    new KeyboardEvent('keypress', {
                        key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
                        bubbles: true, cancelable: true, composed: true,
                    }),
                    new KeyboardEvent('keyup', {
                        key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
                        bubbles: true, cancelable: true, composed: true,
                    }),
                ];
                for (const evt of enterEvents) box.dispatchEvent(evt);
                await sleep(1500);
            } catch (e) {
                log('erro no Enter: ' + e.message);
            }
        }

        // 6. Aguarda comentário ser publicado — campo esvaziar
        const publicado = await waitFor(() => {
            const t = tipo === 'textarea'
                ? (box.value || '').trim()
                : (box.textContent || '').trim();
            return t.length === 0;
        }, 10000);

        if (!publicado) {
            log('campo nao esvaziou — publicacao pode ter falhado');
            return { success: false, error: 'comentario_nao_publicou', debug };
        }

        await sleep(1500);
        log('comentario publicado');
        return { success: true, debug };

    } catch (e) {
        log('excecao: ' + (e?.message || 'erro'));
        return { success: false, error: 'excecao: ' + (e?.message || 'erro'), debug };
    }
}

/**
 * Função executada DENTRO da tab do Instagram (world: MAIN).
 * Localiza botão "Enviar mensagem" (direto ou via menu "..."), digita e envia.
 * Retorna { success, error?, fatal? }
 * fatal=true → sessão inválida, disparo para
 */
async function dispatchInIG(mensagem) {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    const isVisible = (el) => {
        if (!el) return false;
        try {
            const st = window.getComputedStyle(el);
            return el.offsetParent !== null
                && st.visibility !== 'hidden'
                && st.display !== 'none'
                && el.offsetWidth > 0
                && el.offsetHeight > 0;
        } catch { return false; }
    };

    const waitFor = async (predicate, timeoutMs = 15000, intervalMs = 300) => {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            try {
                const r = predicate();
                if (r) return r;
            } catch { }
            await sleep(intervalMs);
        }
        return null;
    };

    /** Procura elemento clicável cujo texto OU aria-label bate no regex */
    const findClickable = (regex) => {
        const els = [...document.querySelectorAll(
            'button, [role="button"], a[role="button"], div[role="button"]'
        )];
        for (const el of els) {
            const txt = (el.textContent || '').trim();
            const aria = el.getAttribute('aria-label') || '';
            if ((regex.test(txt) || regex.test(aria)) && isVisible(el)) return el;
        }
        return null;
    };

    /** Procura o botão "..." (ícone de mais opções) - fica em SVG com aria-label */
    const findOptionsButton = () => {
        const svgs = [...document.querySelectorAll('svg[aria-label]')];
        for (const svg of svgs) {
            const label = svg.getAttribute('aria-label') || '';
            if (/^(options|more options|mais opções|opções|more)$/i.test(label)) {
                // Sobe até o botão clicável
                const btn = svg.closest('button, [role="button"], a[role="button"], div[role="button"]');
                if (btn && isVisible(btn)) return btn;
            }
        }
        return null;
    };

    const bodyText = () => (document.body?.innerText || '').substring(0, 3000);

    try {
        // 1. Aguarda página inicial carregar
        await sleep(1500);

        // ===== DETECÇÕES DE SESSÃO INVÁLIDA (fatal:true) =====

        // 1a. URL redirecionou pra login/challenge/suspended
        const currentUrl = window.location.href;
        if (/\/accounts\/login|\/login\/|\/accounts\/onetap|\/challenge\/|\/accounts\/suspended/i.test(currentUrl)) {
            return { success: false, error: 'sessao_deslogada_url', fatal: true };
        }

        // 1b. Body começa com "Log in" / "Entrar" / "Sign in"
        const bt = bodyText();
        if (/^\s*(log in|entrar|iniciar sessão|sign in|entre no instagram)/i.test(bt)) {
            return { success: false, error: 'sessao_deslogada', fatal: true };
        }

        // 1c. Captcha / desafio de verificação
        const captchaSelectors = [
            'iframe[src*="captcha"]',
            'iframe[src*="recaptcha"]',
            '[class*="captcha"]',
            'form[action*="challenge"]',
        ];
        for (const sel of captchaSelectors) {
            if (document.querySelector(sel)) {
                return { success: false, error: 'captcha_detectado', fatal: true };
            }
        }

        // 1d. Verificação de segurança / desafio
        if (/verificação de segurança|security check|confirme.*(identidade|conta)|verifique.*(identidade|conta)|verify (your )?identity|help us confirm|please confirm your identity|nós detectamos atividade|we detected unusual activity/i.test(bt)) {
            return { success: false, error: 'verificacao_seguranca', fatal: true };
        }

        // 1e. Ação bloqueada (modal comum quando IG detecta bot)
        if (/ação bloqueada|action blocked|try again later|please wait a few minutes|tente novamente mais tarde|temporariamente bloquead|temporarily blocked|estamos limitando/i.test(bt)) {
            return { success: false, error: 'acao_bloqueada', fatal: true };
        }

        // 1f. Conta suspensa/desativada
        if (/sua conta foi (suspensa|desativada)|your account has been (suspended|disabled)|conta foi restringida|account restricted/i.test(bt)) {
            return { success: false, error: 'conta_suspensa', fatal: true };
        }

        // ===== DETECÇÕES DE ERRO NÃO-FATAL =====

        // Perfil não encontrado (não é sessão inválida — só esse lead)
        const h = document.querySelector('h2, h1');
        if (h && /não disponível|not available|sorry.*isn.t available|page not found/i.test(h.textContent || '')) {
            return { success: false, error: 'perfil_nao_encontrado', fatal: false };
        }

        const msgRegex = /^(enviar mensagem|mensagem|message|send message)$/i;

        // 2A. CAMINHO DIRETO: botão "Enviar mensagem" no perfil (público)
        let msgBtn = await waitFor(() => findClickable(msgRegex), 8000);

        // 2B. FALLBACK: menu "..." (perfil privado ou business restrito)
        if (!msgBtn) {
            const optsBtn = await waitFor(() => findOptionsButton(), 6000);
            if (!optsBtn) {
                return { success: false, error: 'sem_botao_mensagem_nem_menu', fatal: false };
            }
            optsBtn.click();
            await sleep(1500);

            // Espera o menu abrir e procura "Enviar mensagem" nele
            msgBtn = await waitFor(() => findClickable(msgRegex), 5000);

            if (!msgBtn) {
                // Fecha o menu (Esc)
                document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                return { success: false, error: 'menu_sem_enviar_mensagem', fatal: false };
            }
        }

        msgBtn.click();
        await sleep(3000);

        // 3. Localiza campo de texto do direct (contenteditable)
        const textarea = await waitFor(() => {
            const cands = [...document.querySelectorAll(
                'div[contenteditable="true"], textarea'
            )];
            return cands.find(el => isVisible(el));
        }, 12000);

        if (!textarea) {
            return { success: false, error: 'campo_texto_nao_encontrado', fatal: false };
        }

        // 4. Digita mensagem como pessoa (pausa entre letras e palavras)
        textarea.focus();
        await sleep(600 + Math.random() * 500);
        try {
            document.execCommand('selectAll', false, null);
            document.execCommand('delete', false, null);
        } catch { }
        await sleep(250);

        for (let i = 0; i < mensagem.length; i++) {
            const ch = mensagem[i];
            try { document.execCommand('insertText', false, ch); } catch { }
            // digitação humana: mais lenta em letras, pausa em espaço/pontuação
            let delay = 45 + Math.random() * 90;
            if (ch === ' ') delay += 80 + Math.random() * 160;
            if (/[.,!?;:]/.test(ch)) delay += 120 + Math.random() * 220;
            // pausa ocasional "pensando"
            if (i > 0 && i % (12 + Math.floor(Math.random() * 10)) === 0) {
                delay += 250 + Math.random() * 450;
            }
            await sleep(delay);
        }
        await sleep(700 + Math.random() * 600);

        // 5. Localiza e clica em Enviar
        const sendRegex = /^(enviar|send)$/i;
        const sendBtn = await waitFor(() => findClickable(sendRegex), 5000);

        if (!sendBtn) {
            return { success: false, error: 'botao_enviar_nao_encontrado', fatal: false };
        }
        sendBtn.click();

        // 6. Aguarda campo esvaziar
        const enviado = await waitFor(() => {
            const t = (textarea.textContent || textarea.value || '').trim();
            return t.length === 0;
        }, 8000);

        if (!enviado) {
            return { success: false, error: 'campo_nao_esvaziou', fatal: false };
        }
        await sleep(1000 + Math.random() * 800);
        return { success: true };

    } catch (e) {
        return { success: false, error: 'excecao: ' + (e?.message || 'erro'), fatal: false };
    }
}

// -----------------------------
// ALARMS (backup wake do service worker)
// -----------------------------

// ============================================================
// ============ FILA DO PAINEL (extrair por @) =================
// ============================================================

let _queueRunning = false;

async function ensureQueueAlarm() {
    // Fila do painel é consumida pelo worker na VPS (24/7).
    // Extensão NÃO reivindica jobs automaticamente — evita race e depende do notebook.
    await chrome.alarms.clear(ALARM_QUEUE);
}

async function pollExtractionQueue() {
    // Desativado: extração enfileirada roda na VPS.
    // Extração manual pelo popup continua disponível.
    return;
    if (_queueRunning) return;
    _queueRunning = true;
    try {
        const cfg = await getConfig();
        if (!cfg.panelUrl || !cfg.apiKey) return;

        const ext = await getExtState();
        if (ext && (ext.status === 'running' || ext.status === 'paused')) return;
        const disp = await getDispState();
        if (disp && disp.status === 'running') return;

        const cookies = await getIgCookies();
        if (!cookies.sessionid) return;

        let list;
        try {
            list = await panelCall('/api/insta/extractions_queue.php');
        } catch (e) {
            log('queue list err:', e.message);
            return;
        }
        const job = (list.jobs || [])[0];
        if (!job) return;

        log('queue job found:', job.username, job.id);
        try {
            await panelCall('/api/insta/extractions_claim.php', {
                method: 'POST',
                body: { extraction_id: job.id }
            });
        } catch (e) {
            log('queue claim err:', e.message);
            return;
        }

        let tab;
        try {
            tab = await chrome.tabs.create({
                url: 'https://www.instagram.com/' + encodeURIComponent(job.username) + '/',
                active: false
            });
        } catch (e) {
            await panelCall('/api/insta/extractions_finish.php', {
                method: 'POST',
                body: {
                    extraction_id: job.id,
                    status: 'error',
                    erro_mensagem: 'nao_abriu_aba: ' + e.message
                }
            }).catch(() => {});
            return;
        }

        const loaded = await waitForTabComplete(tab.id, 30000);
        if (!loaded) {
            await panelCall('/api/insta/extractions_finish.php', {
                method: 'POST',
                body: {
                    extraction_id: job.id,
                    status: 'error',
                    erro_mensagem: 'aba_perfil_nao_carregou'
                }
            }).catch(() => {});
            return;
        }
        await sleep(2500);

        let profile;
        try {
            profile = await fetchIgProfileInfoViaTab(tab.id, job.username);
        } catch (e) {
            log('queue profile err:', e.message);
            await panelCall('/api/insta/extractions_finish.php', {
                method: 'POST',
                body: {
                    extraction_id: job.id,
                    status: 'error',
                    erro_mensagem: 'perfil: ' + e.message
                }
            }).catch(() => {});
            return;
        }

        await handleStartExtraction(
            profile,
            job.nome || ('@' + job.username),
            tab.id,
            {
                limite: job.limite,
                delayMinMs: job.delay_min_ms,
                delayMaxMs: job.delay_max_ms,
            },
            job.id
        );
    } finally {
        _queueRunning = false;
    }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === ALARM_EXT) {
        try { await runExtIteration(); } catch (e) { log('ext alarm err:', e); }
    } else if (alarm.name === ALARM_DISP) {
        try { await runDispIteration(); } catch (e) { logD('disp alarm err:', e); }
    } else if (alarm.name === ALARM_QUEUE) {
        try { await pollExtractionQueue(); } catch (e) { log('queue alarm err:', e); }
    }
});

chrome.runtime.onStartup.addListener(async () => {
    await ensureQueueAlarm();
    const [e, d] = await Promise.all([getExtState(), getDispState()]);
    if (e && e.status === 'running')  scheduleExtNext(1000);
    if (d && d.status === 'running')  scheduleDispNext(1000);
    pollExtractionQueue().catch(() => {});
});

chrome.runtime.onInstalled.addListener(async () => {
    await ensureQueueAlarm();
    const [e, d] = await Promise.all([getExtState(), getDispState()]);
    if (e && e.status === 'running')  scheduleExtNext(1000);
    if (d && d.status === 'running')  scheduleDispNext(1000);
    pollExtractionQueue().catch(() => {});
});

ensureQueueAlarm();
