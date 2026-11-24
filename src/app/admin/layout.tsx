import type { Metadata } from "next";
import { ToastProvider } from "@/components/ui/client";
import { requireAdmin } from "@/server/session";
import { AdminNav } from "./_shared/AdminNav";
import css from "./_shared/admin.module.css";
import { A } from "./_shared/messages";

export const metadata: Metadata = { title: { default: "Administración", template: "%s · Administración" } };

/** Marco propio del panel: rol admin + 2 pasos. Nunca usa AppShell ni muestra datos financieros. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = await requireAdmin();
  const t = A[s.locale];
  return (
    <ToastProvider ptsLabel={s.t.nav.pts}>
      <div className={css.shell}>
        <AdminNav t={t.nav} />
        <div className={css.main}>{children}</div>
      </div>
    </ToastProvider>
  );
}
