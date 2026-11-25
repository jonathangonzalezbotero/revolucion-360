import { AppShell } from "@/components/shell/AppShell";
import { requireUser } from "@/server/session";
import { PwaPrompts } from "@/components/pwa/Pwa";
import { countChallenge } from "./retos/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireUser();
  // Retos: "abrir la app" cuenta una vez al día (la base lo deduplica: la marca es única por día). Nunca lanza ni frena la
  // pantalla. Corre en cada carga completa y también tras `revalidatePath` / `router.refresh()` (una llamada corta).
  await countChallenge(s, "open_app");
  return <AppShell s={s}>{children}<PwaPrompts locale={s.locale} /></AppShell>;
}
