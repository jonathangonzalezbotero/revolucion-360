import { cookies } from "next/headers";
import { AppShell } from "@/components/shell/AppShell";
import { requireUser } from "@/server/session";
import { PwaPrompts } from "@/components/pwa/Pwa";
import { OpenAppPing } from "./retos/OpenAppPing";
import { OPEN_APP_COOKIE, openAppStamp } from "./retos/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireUser();
  // Retos: "abrir la app" cuenta una vez al día. Como un layout no puede dejar cookies, solo se pinta `OpenAppPing` (que
  // llama una vez a la acción, y esa deja la cookie del día) cuando la cookie no es la de hoy: no se consulta la base en
  // cada pantalla. La base igual lo deduplica (una marca por día).
  const counted = (await cookies()).get(OPEN_APP_COOKIE)?.value === openAppStamp(s);
  const ping = !counted && s.canEdit && s.active && s.has("metas");
  return <AppShell s={s}>{children}{ping ? <OpenAppPing /> : null}<PwaPrompts locale={s.locale} /></AppShell>;
}
