"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const EXT_VERSION = "1.1.3";

const PERMISSIONS = [
  {
    name: "Cookies",
    why: "Ler a sessão do Instagram (sessionid) para sincronizar com o painel.",
  },
  {
    name: "Abas e sites ativos",
    why: "Trabalhar na aba do Instagram enquanto você prospecta.",
  },
  {
    name: "Executar scripts",
    why: "Automatizar ações no Instagram (DM, curtir, comentar, etc.).",
  },
  {
    name: "Armazenamento local",
    why: "Guardar configuração e estado da extensão no seu Chrome.",
  },
  {
    name: "Alarmes em segundo plano",
    why: "Manter tarefas agendadas mesmo com o popup fechado.",
  },
  {
    name: "Depurador (debugger)",
    why: "Enviar mensagens e interagir no Direct com mais estabilidade.",
  },
];

const HOST_PERMISSIONS = [
  "https://www.instagram.com e subdomínios",
  "https://sdre-ai.vercel.app (este painel)",
  "Outros domínios Vercel do painel, se aplicável",
];

export function ExtensaoClient() {
  const [extPresent, setExtPresent] = useState(false);

  const panelUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const zipUrl = `${panelUrl}/downloads/levorato-prospect-extension.zip`;

  useEffect(() => {
    let cancelled = false;
    const check = () => {
      let done = false;
      const onPong = () => {
        if (done || cancelled) return;
        done = true;
        document.removeEventListener("levorato-pong", onPong);
        setExtPresent(true);
      };
      document.addEventListener("levorato-pong", onPong);
      document.dispatchEvent(new CustomEvent("levorato-ping"));
      setTimeout(() => {
        document.removeEventListener("levorato-pong", onPong);
      }, 900);
    };
    check();
    const t = setInterval(check, 8000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  return (
    <>
      <div className="card ext-download-card">
        <div className="section-head">
          <h2 style={{ margin: 0 }}>Baixar extensão</h2>
          <span className="pill">v{EXT_VERSION}</span>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          Um arquivo ZIP para instalar no <strong>Google Chrome</strong>. Funciona
          para qualquer usuário com login neste painel.
        </p>
        <a
          className="btn primary ext-download-btn"
          href={zipUrl}
          download="levorato-prospect-extension.zip"
        >
          Baixar extensão para Chrome
        </a>
        {extPresent ? (
          <p className="ok" style={{ marginTop: 12, marginBottom: 0 }}>
            Extensão já detectada neste navegador. Vá em{" "}
            <Link className="link-accent" href="/conta">Minha Conta</Link> e
            clique em <strong>Sincronizar com extensão</strong>.
          </p>
        ) : (
          <p className="muted" style={{ marginTop: 12, marginBottom: 0, fontSize: 13 }}>
            Depois de instalar, recarregue esta página — deve aparecer “Extensão
            detectada”.
          </p>
        )}
      </div>

      <div className="card">
        <h2>Como instalar no Chrome</h2>
        <ol className="ext-install-steps">
          <li>
            Clique em <strong>Baixar extensão para Chrome</strong> (acima).
          </li>
          <li>
            Abra a pasta <strong>Downloads</strong> e{" "}
            <strong>extraia</strong> o ZIP (botão direito → Extrair tudo). Você
            verá uma pasta chamada algo como{" "}
            <span className="mono">levorato-prospect-extension</span> com o arquivo{" "}
            <span className="mono">manifest.json</span> dentro.
          </li>
          <li>
            No Chrome, abra{" "}
            <span className="mono">chrome://extensions</span> (cole na barra de
            endereço).
          </li>
          <li>
            Ative <strong>Modo do desenvolvedor</strong> (canto superior direito).
          </li>
          <li>
            Clique em <strong>Carregar sem compactação</strong> e selecione a
            pasta extraída (a pasta inteira, não um arquivo dentro dela).
          </li>
          <li>
            Quando o Chrome pedir, clique em <strong>Permitir</strong> /{" "}
            <strong>Adicionar extensão</strong> e aceite{" "}
            <strong>todas as permissões</strong> listadas abaixo — sem elas a
            sync e o Instagram não funcionam.
          </li>
          <li>
            (Opcional) Clique no ícone 🧩 na barra do Chrome e fixe{" "}
            <strong>Levorato Prospect</strong>.
          </li>
          <li>
            Abra <a href="https://www.instagram.com" target="_blank" rel="noreferrer">instagram.com</a>{" "}
            logado na conta que vai prospectar.
          </li>
          <li>
            Volte ao painel →{" "}
            <Link className="link-accent" href="/conta">Minha Conta</Link> →{" "}
            <strong>Sincronizar com extensão</strong>. Pronto — a VPS usa essa
            sessão 24/7.
          </li>
        </ol>
        <p className="muted ext-install-note">
          Não use duplo clique em arquivo <span className="mono">.crx</span> — o
          Chrome costuma bloquear. Sempre use <strong>Carregar sem compactação</strong>{" "}
          com a pasta do ZIP.
        </p>
      </div>

      <div className="card">
        <h2>Permissões — aceite todas</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Na instalação (ou ao atualizar), o Chrome mostra um aviso de permissões.
          É obrigatório <strong>permitir tudo</strong> para sincronizar sessão,
          extrair leads e disparar mensagens.
        </p>
        <ul className="ext-perms-list">
          {PERMISSIONS.map((p) => (
            <li key={p.name}>
              <strong>{p.name}</strong>
              <span>{p.why}</span>
            </li>
          ))}
        </ul>
        <h3 className="ext-perms-host-title">Acesso a sites</h3>
        <ul className="ext-perms-hosts muted">
          {HOST_PERMISSIONS.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
        <p className="muted ext-install-note">
          Se você negou alguma permissão: em{" "}
          <span className="mono">chrome://extensions</span> → Levorato Prospect →
          <strong> Detalhes</strong> → ajuste permissões e recarregue a extensão
          (ícone ↻).
        </p>
      </div>

      <div className="card">
        <h2>Depois de instalar</h2>
        <ul className="muted ext-after-list">
          <li>
            <strong>Sessão IG:</strong> Minha Conta → Sincronizar com extensão
            (não precisa copiar cookies manualmente).
          </li>
          <li>
            <strong>Extrações e campanhas:</strong> use o painel — a VPS processa
            24/7 com a sessão sincronizada.
          </li>
          <li>
            <strong>Sessão expirou?</strong> Abra instagram.com de novo e sincronize
            outra vez em Minha Conta.
          </li>
          <li>
            <strong>Outro computador?</strong> Repita o download e a instalação —
            cada máquina precisa da extensão local.
          </li>
        </ul>
      </div>
    </>
  );
}
