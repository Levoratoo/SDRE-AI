/* ============================================================
   PROSPECT INSTA — Shared helpers (v2.1.0 — fetch resiliente)
   ============================================================ */

// -----------------------------
// CONFIG
// -----------------------------

export async function getConfig() {
    const { config } = await chrome.storage.local.get('config');
    return {
        panelUrl: (config?.panelUrl || '').replace(/\/+$/, ''),
        apiKey:   config?.apiKey || '',
    };
}

export async function setConfig(cfg) {
    await chrome.storage.local.set({ config: cfg });
}

// -----------------------------
// PANEL API
// -----------------------------

export async function panelCall(path, { method = 'GET', body = null } = {}) {
    const { panelUrl, apiKey } = await getConfig();
    if (!panelUrl || !apiKey) throw new Error('Extensão não configurada.');

    const url = panelUrl + path;
    const opts = {
        method,
        headers: {
            'Authorization': 'Bearer ' + apiKey,
            'Accept': 'application/json',
        },
    };
    if (body != null) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
    }

    let resp;
    try { resp = await fetch(url, opts); }
    catch (e) { throw new Error('Falha de rede: ' + e.message); }

    const text = await resp.text();
    let json;
    try { json = JSON.parse(text); }
    catch {
        throw new Error('HTTP ' + resp.status + ' — resposta não-JSON: ' + text.substring(0, 200));
    }

    if (!json.ok) throw new Error(json.erro || 'Erro no painel');
    return json;
}

export async function testPanel(panelUrl, apiKey) {
    const url = panelUrl.replace(/\/+$/, '') + '/api/insta/ping.php';
    const r = await fetch(url, {
        headers: { 'Authorization': 'Bearer ' + apiKey, 'Accept': 'application/json' }
    });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' — verifique URL/API Key');
    let j;
    try { j = await r.json(); }
    catch { throw new Error('Resposta inválida do painel (não é JSON)'); }
    if (j.ok === false) throw new Error(j.erro || 'API key inválida');
    return j.user || j.data || {
        nome:  j.nome  || j.name  || null,
        email: j.email || null,
        id:    j.id    || null,
    };
}

// -----------------------------
// INSTAGRAM helpers
// -----------------------------

export async function getIgCookies() {
    const store = await chrome.cookies.getAll({ domain: '.instagram.com' });
    const map = {};
    for (const c of store) map[c.name] = c.value;
    return {
        sessionid:  map.sessionid   || '',
        csrftoken:  map.csrftoken   || '',
        ds_user_id: map.ds_user_id  || '',
        mid:        map.mid         || '',
        ig_did:     map.ig_did      || '',
        rur:        map.rur         || '',
    };
}

export function extractIgUsername(url) {
    try {
        const u = new URL(url);
        if (!/instagram\.com$/.test(u.hostname.replace(/^www\./, ''))) return null;
        const parts = u.pathname.split('/').filter(Boolean);
        if (parts.length === 0) return null;
        const first = parts[0];
        const reserved = new Set([
            'p','reel','reels','stories','tv','explore','direct','accounts','about',
            'developer','legal','press','challenge','api','ajax','favicon.ico','static'
        ]);
        if (reserved.has(first)) return null;
        return first.replace(/^@/, '').toLowerCase();
    } catch { return null; }
}

// -----------------------------
// FETCH PERFIL — 4 estratégias em cascata
// -----------------------------

export async function fetchIgProfileInfoViaTab(tabId, username) {
    const [res] = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        args: [username],
        func: async (u) => {
            const log = (...args) => console.log('[PI-Extract]', ...args);
            const debugTrail = [];

            // Helper: pega cookie por nome
            const getCookie = (name) => {
                const m = document.cookie.match(new RegExp('(^|; )' + name + '=([^;]+)'));
                return m ? decodeURIComponent(m[2]) : '';
            };

            const csrfToken = getCookie('csrftoken');
            const dsUserId  = getCookie('ds_user_id');

            // Headers base pra requests da API
            const apiHeaders = {
                'X-IG-App-ID': '936619743392459',
                'X-ASBD-ID': '129477',
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': csrfToken,
                'Accept': '*/*',
            };
            if (dsUserId) apiHeaders['X-IG-WWW-Claim'] = '0';

            const parseUserData = (user, method) => ({
                username: user.username,
                pk: Number(user.id || user.pk),
                full_name: user.full_name || '',
                followers_count: user.edge_followed_by?.count || user.follower_count || 0,
                profile_pic_url: user.profile_pic_url || user.profile_pic_url_hd || '',
                is_private:  !!user.is_private,
                is_verified: !!user.is_verified,
                is_business: !!(user.is_business_account || user.is_business),
                _method: method
            });

            // ============================================================
            // STRATEGY A: web_profile_info (endpoint principal)
            // ============================================================
            try {
                log('Strategy A: web_profile_info');
                const r = await fetch(
                    '/api/v1/users/web_profile_info/?username=' + encodeURIComponent(u),
                    { headers: apiHeaders, credentials: 'include' }
                );
                debugTrail.push(`A: HTTP ${r.status}`);
                if (r.ok) {
                    const j = await r.json();
                    const user = j?.data?.user;
                    if (user && user.id) {
                        log('Strategy A: sucesso', user.username);
                        return parseUserData(user, 'web_profile_info');
                    }
                    debugTrail.push('A: sem user no response');
                }
            } catch (e) { debugTrail.push(`A: exception ${e.message}`); }

            // ============================================================
            // STRATEGY B: URL legada com ?__a=1&__d=dis
            // ============================================================
            try {
                log('Strategy B: legacy __a=1');
                const r = await fetch(
                    `/${encodeURIComponent(u)}/?__a=1&__d=dis`,
                    { headers: { ...apiHeaders, 'Accept': 'application/json' }, credentials: 'include' }
                );
                debugTrail.push(`B: HTTP ${r.status}`);
                if (r.ok) {
                    const j = await r.json();
                    const user = j?.graphql?.user || j?.user || j?.data?.user;
                    if (user && (user.id || user.pk)) {
                        log('Strategy B: sucesso', user.username);
                        return parseUserData(user, 'legacy_a1');
                    }
                    debugTrail.push('B: sem user no response');
                }
            } catch (e) { debugTrail.push(`B: exception ${e.message}`); }

            // ============================================================
            // STRATEGY C: scraping do HTML da página
            // ============================================================
            try {
                log('Strategy C: HTML scraping');
                const r = await fetch(`/${encodeURIComponent(u)}/`, { credentials: 'include' });
                debugTrail.push(`C: HTML HTTP ${r.status}`);
                if (r.ok) {
                    const html = await r.text();

                    // Extrai user data de JSON embutido
                    // Instagram usa vários padrões — tenta múltiplos
                    let userData = null;

                    // Padrão 1: xdt_api__v1__users__web_profile_info__username
                    const patterns = [
                        /"xdt_api__v1__users__web_profile_info__username"[^}]*?"user":\s*({[^]*?})\s*,\s*"(?:status|__typename)"/,
                        /"user":\s*({[^]*?"pk":\s*"?\d+"?[^]*?})\s*[,}]/,
                        /"user":\s*({[^]*?"id":\s*"?\d+"?[^]*?})\s*[,}]/,
                    ];

                    for (const pattern of patterns) {
                        const m = html.match(pattern);
                        if (m) {
                            try {
                                userData = JSON.parse(m[1]);
                                if (userData.username && (userData.id || userData.pk)) break;
                            } catch { }
                        }
                    }

                    if (userData) {
                        log('Strategy C: sucesso via HTML parsing');
                        return parseUserData(userData, 'html_json');
                    }

                    // Fallback: extrai dados básicos de meta tags
                    const ogTitle = html.match(/<meta property="og:title" content="([^"]+)"/);
                    const ogDesc  = html.match(/<meta property="og:description" content="([^"]+)"/);
                    const ogImage = html.match(/<meta property="og:image" content="([^"]+)"/);
                    const ogUrl   = html.match(/<meta property="og:url" content="([^"]+)"/);
                    const alUrl   = html.match(/<meta property="al:ios:url" content="instagram:\/\/user\?username=([^"]+)"/);

                    if (ogTitle || ogDesc) {
                        // og:title: "Nome (@username) • Instagram photos and videos"
                        const title = ogTitle ? ogTitle[1] : '';
                        const nameMatch = title.match(/^([^(]+?)\s*\(@/);
                        const fullName = nameMatch ? nameMatch[1].trim() : '';

                        // og:description: "1,234 Followers, 567 Following, 890 Posts..."
                        let followersCount = 0;
                        if (ogDesc) {
                            const fm = ogDesc[1].match(/([\d.,]+[KMkm]?)\s*Followers/i)
                                   || ogDesc[1].match(/([\d.,]+[KMkm]?)\s*Seguidores/i);
                            if (fm) {
                                let num = fm[1].replace(/[.,]/g, '');
                                let mult = 1;
                                if (/k$/i.test(num)) { mult = 1000; num = num.replace(/k$/i, ''); }
                                if (/m$/i.test(num)) { mult = 1000000; num = num.replace(/m$/i, ''); }
                                followersCount = Math.round(parseFloat(num) * mult);
                            }
                        }

                        // Tenta achar pk em qualquer lugar do HTML como fallback
                        let pk = 0;
                        const pkMatch = html.match(/"profile_id"\s*:\s*"(\d+)"/)
                                     || html.match(new RegExp(`"username":"${u}"[^}]*?"(?:id|pk)":"(\\d+)"`, 'i'))
                                     || html.match(new RegExp(`"(?:id|pk)":"(\\d+)"[^}]*?"username":"${u}"`, 'i'));
                        if (pkMatch) pk = Number(pkMatch[1]);

                        if (fullName || followersCount || pk) {
                            log('Strategy C: sucesso parcial via meta tags');
                            return {
                                username: u,
                                pk,
                                full_name: fullName,
                                followers_count: followersCount,
                                profile_pic_url: ogImage ? ogImage[1] : '',
                                is_private: false,
                                is_verified: false,
                                is_business: false,
                                _method: 'meta_tags',
                                _limited: true,
                                _note: pk === 0 ? 'PK não detectado — extração pode não funcionar' : null
                            };
                        }
                    }

                    debugTrail.push('C: HTML sem dados extraíveis');
                }
            } catch (e) { debugTrail.push(`C: exception ${e.message}`); }

            // ============================================================
            // STRATEGY D: DOM da página aberta (última tentativa)
            // ============================================================
            try {
                log('Strategy D: DOM da página aberta');
                // Só funciona se o aluno está na página do perfil no momento
                const isProfilePage = window.location.pathname.startsWith(`/${u}/`)
                                   || window.location.pathname === `/${u}`;

                if (isProfilePage) {
                    debugTrail.push('D: página é do perfil');
                    // Tenta pegar seguidores do DOM
                    const followersLink = document.querySelector(`a[href="/${u}/followers/"]`);
                    let followersCount = 0;
                    if (followersLink) {
                        const txt = followersLink.textContent || '';
                        const m = txt.match(/([\d.,]+[KMkm]?)/);
                        if (m) {
                            let num = m[1].replace(/[.,]/g, '');
                            let mult = 1;
                            if (/k$/i.test(num)) { mult = 1000; num = num.replace(/k$/i, ''); }
                            if (/m$/i.test(num)) { mult = 1000000; num = num.replace(/m$/i, ''); }
                            followersCount = Math.round(parseFloat(num) * mult);
                        }
                    }

                    // Nome
                    const nameEl = document.querySelector('h2, h1, header section h2');
                    const fullName = nameEl?.textContent?.trim() || '';

                    // Foto
                    const imgEl = document.querySelector('header img[alt*="profile"]')
                               || document.querySelector('header img');
                    const profilePic = imgEl?.src || '';

                    // Verified badge?
                    const isVerified = !!document.querySelector('[aria-label*="Verificado"], [aria-label*="Verified"]');

                    // Privado?
                    const bodyText = document.body.innerText || '';
                    const isPrivate = /esta conta é privada|this account is private/i.test(bodyText);

                    if (followersCount || fullName) {
                        log('Strategy D: sucesso parcial via DOM');
                        return {
                            username: u,
                            pk: 0, // não temos pelo DOM
                            full_name: fullName,
                            followers_count: followersCount,
                            profile_pic_url: profilePic,
                            is_private: isPrivate,
                            is_verified: isVerified,
                            is_business: false,
                            _method: 'dom_scraping',
                            _limited: true,
                            _note: 'Sem PK — a extração não vai funcionar. Tente outra estratégia.'
                        };
                    }
                    debugTrail.push('D: DOM sem dados');
                } else {
                    debugTrail.push(`D: página atual não é /${u}/`);
                }
            } catch (e) { debugTrail.push(`D: exception ${e.message}`); }

            // Todas as estratégias falharam
            log('Todas estratégias falharam:', debugTrail);
            return {
                __error: 'Não conseguimos obter os dados. O Instagram está bloqueando esse perfil.',
                _debug: debugTrail.join(' | ')
            };
        }
    });

    const p = res?.result;
    if (!p || p.__error) {
        const detail = p?._debug ? ` (debug: ${p._debug})` : '';
        throw new Error((p?.__error || 'Erro desconhecido') + detail);
    }

    // Se retornou com pk=0, não dá pra extrair (a API de seguidores precisa do pk numérico)
    if (!p.pk || p.pk === 0) {
        const note = p._note || 'PK do perfil não foi detectado — o Instagram bloqueou.';
        throw new Error(note);
    }

    return p;
}

// -----------------------------
// Outras funções mantidas (fetchCurrentIgUserViaTab, fetchFollowersPageViaTab)
// -----------------------------

export async function fetchCurrentIgUserViaTab(tabId) {
    const [res] = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: async () => {
            try {
                const getCookie = (name) => {
                    const m = document.cookie.match(new RegExp('(^|; )' + name + '=([^;]+)'));
                    return m ? decodeURIComponent(m[2]) : '';
                };
                const csrfToken = getCookie('csrftoken');
                const r = await fetch('/api/v1/accounts/current_user/?edit=true', {
                    headers: {
                        'X-IG-App-ID': '936619743392459',
                        'X-Requested-With': 'XMLHttpRequest',
                        'X-CSRFToken': csrfToken,
                    },
                    credentials: 'include',
                });
                if (!r.ok) return { __error: 'HTTP ' + r.status };
                const j = await r.json();
                return { username: j?.user?.username, pk: Number(j?.user?.pk) || null };
            } catch (e) { return { __error: e.message }; }
        }
    });
    return res?.result;
}

export async function fetchFollowersPageViaTab(tabId, pk, maxId) {
    const [res] = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        args: [pk, maxId],
        func: async (pkParam, maxIdParam) => {
            try {
                const getCookie = (name) => {
                    const m = document.cookie.match(new RegExp('(^|; )' + name + '=([^;]+)'));
                    return m ? decodeURIComponent(m[2]) : '';
                };
                const csrfToken = getCookie('csrftoken');
                const params = new URLSearchParams({ count: '50', search_surface: 'follow_list_page' });
                if (maxIdParam) params.append('max_id', maxIdParam);
                const r = await fetch('/api/v1/friendships/' + pkParam + '/followers/?' + params.toString(), {
                    headers: {
                        'X-IG-App-ID': '936619743392459',
                        'X-ASBD-ID': '129477',
                        'X-Requested-With': 'XMLHttpRequest',
                        'X-CSRFToken': csrfToken,
                    },
                    credentials: 'include',
                });
                if (r.status === 401 || r.status === 403) return { __error: 'AUTH:' + r.status };
                if (r.status === 429) return { __error: 'RATE:' + r.status };
                if (!r.ok) return { __error: 'HTTP:' + r.status };
                const j = await r.json();
                return {
                    users: (j.users || []).map(u => ({
                        pk: Number(u.pk || u.id),
                        username: u.username,
                        full_name: u.full_name,
                        is_private: !!u.is_private,
                        is_verified: !!u.is_verified,
                        is_business: !!u.is_business,
                    })),
                    next_max_id: j.next_max_id || null,
                };
            } catch (e) { return { __error: e.message }; }
        }
    });
    const p = res?.result;
    if (!p) throw Object.assign(new Error('sem resposta'), { code: 'UNKNOWN' });
    if (p.__error) {
        const err = new Error(p.__error);
        if (p.__error.startsWith('AUTH')) err.code = 'AUTH';
        else if (p.__error.startsWith('RATE')) err.code = 'RATE';
        else err.code = 'HTTP';
        throw err;
    }
    return p;
}

// -----------------------------
// TAB helpers
// -----------------------------

export async function findInstagramTab() {
    const tabs = await chrome.tabs.query({ url: 'https://*.instagram.com/*' });
    if (!tabs.length) return null;
    const active = tabs.find(t => t.active);
    return active || tabs[0];
}
