/**
 * Bridge painel ↔ extensão (Minha Conta → Sincronizar sessão IG).
 * Roda nas páginas do Levorato Prospect com a sessão do usuário logado.
 */
(function () {
  const ORIGIN = location.origin;

  document.addEventListener("levorato-ping", () => {
    document.dispatchEvent(
      new CustomEvent("levorato-pong", {
        detail: { ok: true, version: chrome.runtime.getManifest().version },
      }),
    );
  });

  document.addEventListener("levorato-sync-ig", () => {
    void (async () => {
      try {
        await ensurePanelConfig();
        const r = await chrome.runtime.sendMessage({
          type: "sync-session",
          tabId: null,
        });
        document.dispatchEvent(
          new CustomEvent("levorato-sync-ig-done", { detail: r }),
        );
      } catch (e) {
        document.dispatchEvent(
          new CustomEvent("levorato-sync-ig-done", {
            detail: {
              ok: false,
              erro: e instanceof Error ? e.message : String(e),
            },
          }),
        );
      }
    })();
  });

  async function ensurePanelConfig() {
    const stored = await chrome.storage.local.get("config");
    const cfg = stored.config || {};
    if (cfg.panelUrl === ORIGIN && cfg.apiKey) return;

    const metaRes = await fetch("/api/extensao/api-key", {
      credentials: "include",
    });
    const meta = await metaRes.json().catch(() => ({}));

    let apiKey = null;

    if (meta?.ok && meta.key?.canReveal) {
      const revealRes = await fetch("/api/extensao/api-key?reveal=1", {
        credentials: "include",
      });
      const reveal = await revealRes.json().catch(() => ({}));
      if (reveal?.ok && reveal.apiKey) apiKey = reveal.apiKey;
    }

    if (!apiKey && meta?.ok && !meta.key?.hasKey) {
      const genRes = await fetch("/api/extensao/api-key", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const gen = await genRes.json().catch(() => ({}));
      if (gen?.ok && gen.apiKey) apiKey = gen.apiKey;
    }

    if (!apiKey) {
      throw new Error(
        "Configure a extensão em Extensão → gere/copie a API Key, ou abra essa página com a extensão instalada.",
      );
    }

    await chrome.storage.local.set({
      config: { panelUrl: ORIGIN, apiKey },
    });
  }
})();
