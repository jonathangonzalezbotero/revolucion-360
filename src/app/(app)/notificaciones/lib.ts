// Cálculos puros del centro de notificaciones.
import { diffDays, todayIn, type ISODate } from "@/lib/engine";

export const KINDS = ["cierre", "pago", "logro", "academia", "acceso", "sistema"] as const;
export type Kind = (typeof KINDS)[number];
export type Filter = "all" | "unread" | Kind;
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
  return n.kind === f;
}

/** No leídas primero; dentro de cada grupo, de la más nueva a la más vieja. */
export function sortNotifs<T extends NotifLite>(list: T[]): T[] {
  return [...list].sort((a, b) => (a.unread === b.unread ? b.createdAt.localeCompare(a.createdAt) : a.unread ? -1 : 1));
}
