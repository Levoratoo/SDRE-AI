"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { tutorialHrefForPath } from "@/lib/tutorials";

const NAV = [
  { href: "/dashboard", label: "Início", icon: "home" },
  { href: "/extracoes", label: "Extrações", icon: "extract" },
  { href: "/leads", label: "Base de leads", icon: "users" },
  { href: "/mensagens", label: "Mensagens DM", icon: "msg" },
  { href: "/comentarios", label: "Comentários", icon: "comment" },
  { href: "/stories", label: "Stories", icon: "story" },
  { href: "/campanhas", label: "Campanhas", icon: "rocket" },
  { href: "/agente", label: "Agente IA", icon: "bot" },
  { href: "/conta", label: "Minha Conta", icon: "user" },
  { href: "/extensao", label: "Extensão Opera", icon: "puzzle" },
] as const;

function NavIcon({ name }: { name: (typeof NAV)[number]["icon"] }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1v-10.5z" />
        </svg>
      );
    case "extract":
      return (
        <svg {...common}>
          <path d="M12 3v12" />
          <path d="m7 10 5 5 5-5" />
          <path d="M5 21h14" />
        </svg>
      );
    case "users":
      return (
        <svg {...common}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="3" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a3 3 0 0 1 0 5.74" />
        </svg>
      );
    case "msg":
      return (
        <svg {...common}>
          <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
        </svg>
      );
    case "comment":
      return (
        <svg {...common}>
          <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H7l-4 3V11.5A8.5 8.5 0 1 1 21 11.5z" />
        </svg>
      );
    case "story":
      return (
        <svg {...common}>
          <rect x="4" y="3" width="16" height="18" rx="4" />
          <circle cx="12" cy="10" r="3" />
          <path d="M8 17h8" />
        </svg>
      );
    case "rocket":
      return (
        <svg {...common}>
          <path d="M5 15c-1 2-1 5-1 5s3 0 5-1" />
          <path d="M14 4s5 2 6 8c-4 1-8-1-10-3-1-3 0-5 0-5z" />
          <path d="M9 15s2 1 4 0" />
        </svg>
      );
    case "bot":
      return (
        <svg {...common}>
          <rect x="4" y="8" width="16" height="12" rx="3" />
          <path d="M12 8V4" />
          <circle cx="9" cy="14" r="1" fill="currentColor" />
          <circle cx="15" cy="14" r="1" fill="currentColor" />
        </svg>
      );
    case "user":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20a7 7 0 0 1 14 0" />
        </svg>
      );
    case "puzzle":
      return (
        <svg {...common}>
          <path d="M10 4h4v3a2 2 0 1 0 2 2h3v4h-3a2 2 0 1 0-2 2v3h-4v-3a2 2 0 1 0-2-2H5v-4h3a2 2 0 1 0 2-2V4z" />
        </svg>
      );
    default: {
      const _exhaustive: never = name;
      return _exhaustive;
    }
  }
}

type Props = {
  userName: string;
  userEmail: string;
  children: React.ReactNode;
};

export function PanelShell({ userName, userEmail, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="panel">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <rect
                x="3"
                y="3"
                width="18"
                height="18"
                rx="5"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
              <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" />
            </svg>
          </span>
          <div>
            <div className="brand-name">Levorato</div>
            <div className="brand-sub">Prospect Insta</div>
          </div>
        </div>

        <nav className="nav">
          {NAV.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? "nav-link active" : "nav-link"}
              >
                <span className="nav-icon">
                  <NavIcon name={item.icon} />
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-foot">
          <div className="user-chip">
            <div className="user-avatar" aria-hidden>
              {(userName || "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="user-chip-meta">
              <div className="user-chip-name">{userName}</div>
              <div className="user-chip-email">{userEmail}</div>
            </div>
            <button
              type="button"
              className="btn ghost small logout-btn"
              onClick={logout}
              title="Sair"
              aria-label="Sair"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <path d="M16 17l5-5-5-5" />
                <path d="M21 12H9" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      <div className="content-wrap">
        <div className="topbar">
          <div className="topbar-left">
            <Link
              className="btn-tutorial"
              href={tutorialHrefForPath(pathname)}
              target="_blank"
              rel="noopener"
              title="Assistir tutorial dessa página"
            >
              <span className="btn-tutorial-icon" aria-hidden>
                ▶
              </span>
              Ver tutorial
            </Link>
          </div>
          <div className="topbar-right">
            <div className="theme-toggle" aria-label="Tema">
              <button type="button" className="active">
                ☾ Dark
              </button>
              <button type="button" disabled title="Em breve">
                ☀ Light
              </button>
            </div>
          </div>
        </div>
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
