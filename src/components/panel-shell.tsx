"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

const NAV = [
  { href: "/dashboard", label: "Início" },
  { href: "/extracoes", label: "Extrações" },
  { href: "/leads", label: "Base de leads" },
  { href: "/mensagens", label: "Mensagens DM" },
  { href: "/campanhas", label: "Campanhas" },
  { href: "/agente", label: "Agente IA" },
  { href: "/extensao", label: "Extensão" },
  { href: "/conta", label: "Minha Conta" },
];

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
          <span className="brand-mark">LP</span>
          <div>
            <div className="brand-name">Levorato Prospect</div>
            <div className="brand-sub">Prospecção Instagram</div>
          </div>
        </div>

        <nav className="nav">
          {NAV.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? "nav-link active" : "nav-link"}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-foot">
          <div className="user-chip">
            <div className="user-chip-name">{userName}</div>
            <div className="user-chip-email">{userEmail}</div>
          </div>
          <button type="button" className="btn ghost small" onClick={logout}>
            Sair
          </button>
        </div>
      </aside>

      <main className="main">{children}</main>
    </div>
  );
}
