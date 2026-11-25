// Cálculos puros del centro de notificaciones.
import { diffDays, todayIn, type ISODate } from "@/lib/engine";

// "reto": día de un reto (lo escribe el módulo de Retos). Sin este tipo caería en "sistema" (Cuenta).
export const KINDS = ["cierre", "pago", "habito", "logro", "reto", "academia", "acceso", "sistema"] as const;
export type Kind = (typeof KINDS)[number];

/**
 * Filtros del mockup (Notificaciones): Recordatorios (cierre, pagos, Hoy puedes gastar, Repaso semanal), Logros
 * (insignias, rachas, hitos de metas, días de reto), Academia y Cuenta (acceso y sistema). Ya no hay "Alertas":
 * esos avisos dejaron de mandarse.
 */
export const CATEGORIES = ["recordatorios", "logros", "academia", "cuenta"] as const;
export type Category = (typeof CATEGORIES)[number];
const CATEGORY_OF: Record<Kind, Category> = {
  cierre: "recordatorios", pago: "recordatorios", habito: "recordatorios",
  logro: "logros", reto: "logros", academia: "academia", acceso: "cuenta", sistema: "cuenta",
};
export const categoryOf = (k: Kind): Category => CATEGORY_OF[k];
export type Filter = "all" | "unread" | Kind | Category;
export type Group = "today" | "week" | "older";

export const asKind = (k: string): Kind => ((KINDS as readonly string[]).includes(k) ? (k as Kind) : "sistema");

/** Solo enlaces internos: `notify()` guarda "" cuando no hay destino y nunca seguimos un enlace externo. */
export const safeHref = (href: string | null | undefined): string | null =>
  typeof href === "string" && href.startsWith("/") && !href.startsWith("//") ? href : null;

/** Día de la notificación en la zona horaria del usuario. */
export const dayOf = (createdAt: string, timezone: string): ISODate => todayIn(timezone, new Date(createdAt));

export function groupOf(day: ISODate, today: ISODate): Group {
  const d = diffDays(today, day);
  if (d <= 0) return "today";
  return d < 7 ? "week" : "older";
}

export type NotifLite = { id: string; kind: Kind; unread: boolean; createdAt: string };
export function matches(n: NotifLite, f: Filter): boolean {
  if (f === "all") return true;
  if (f === "unread") return n.unread;
  if ((CATEGORIES as readonly string[]).includes(f)) return categoryOf(n.kind) === f;
  return n.kind === f;
}

/** No leídas primero; dentro de cada grupo, de la más nueva a la más vieja. */
export function sortNotifs<T extends NotifLite>(list: T[]): T[] {
  return [...list].sort((a, b) => (a.unread === b.unread ? b.createdAt.localeCompare(a.createdAt) : a.unread ? -1 : 1));
}

/** Texto del botón según a dónde lleva (como en el mockup: "Ver Inicio", "Ver mi semana", "Ver meta"…); si no, el del tipo. */
export const HREF_CTAS = ["/inicio", "/repaso", "/metas", "/retos", "/deudas"] as const;
export type HrefCta = (typeof HREF_CTAS)[number];
export function ctaOf(href: string): HrefCta | null {
  return HREF_CTAS.find((p) => href === p || href.startsWith(`${p}/`) || href.startsWith(`${p}?`) || href.startsWith(`${p}#`)) ?? null;
}
