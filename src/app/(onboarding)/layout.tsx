import { ToastProvider } from "@/components/ui/client";
import { requireUser } from "@/server/session";

// Onboarding y asistente: con sesión, pero sin el menú de la app.
export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const s = await requireUser({ allowOnboarding: true });
  return <ToastProvider ptsLabel={s.t.nav.pts}>{children}</ToastProvider>;
}
