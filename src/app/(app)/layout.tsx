import { AppShell } from "@/components/shell/AppShell";
import { requireUser } from "@/server/session";
import { PwaPrompts } from "@/components/pwa/Pwa";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireUser();
  return <AppShell s={s}>{children}<PwaPrompts locale={s.locale} /></AppShell>;
}
