import type { Metadata } from "next";
import { M } from "./messages";
import { Offline } from "./Offline";

// Página estática y pública (está en PUBLIC de src/proxy.ts): el service worker la guarda al instalarse
// y la muestra cuando una navegación falla por falta de red. No lee sesión ni datos del usuario.
export const dynamic = "force-static";
export const metadata: Metadata = { title: M.es.title };

export default function Page() {
  return <Offline m={M} />;
}
