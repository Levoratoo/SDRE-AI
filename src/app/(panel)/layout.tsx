import { PanelShell } from "@/components/panel-shell";
import { requireSession } from "@/lib/session";

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();

  return (
    <PanelShell
      userName={session.user.name}
      userEmail={session.user.email}
    >
      {children}
    </PanelShell>
  );
}
