import { AppShell } from "@/components/shell/AppShell";
import { requireUser } from "@/server/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireUser();
  return <AppShell s={s}>{children}</AppShell>;
}
