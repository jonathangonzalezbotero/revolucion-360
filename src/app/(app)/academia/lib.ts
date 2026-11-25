// Cálculos propios de la Academia (funciones puras, sin base de datos). Probados en tests/academia.test.ts.
import { fill } from "@/i18n";

// ───────── Video: de un enlace pegado en Admin a lo que se inserta en la página ─────────
export type VideoEmbed = { kind: "iframe"; provider: "youtube" | "vimeo" | "mux"; src: string } | { kind: "video"; src: string };

const YT_ID = /^[A-Za-z0-9_-]{6,20}$/;
const parse = (raw: string): URL | null => {
  try {
    const u = new URL(raw.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u : null;
  } catch {
    return null;
  }
};

/**
 * YouTube (watch, youtu.be, shorts, embed, live; no listado o privado), Vimeo (con el código de los no listados),
 * Mux (stream.mux.com/ID.m3u8 o player.mux.com/ID) y un archivo .mp4/.webm directo.
 * Cualquier otro enlace devuelve null: no se inserta nada desconocido.
 */
export function videoEmbed(raw: string | null | undefined): VideoEmbed | null {
  if (!raw || !raw.trim()) return null;
  const u = parse(raw);
  if (!u) return null;
  const host = u.hostname.toLowerCase().replace(/^www\.|^m\./, "");
  const path = u.pathname.split("/").filter(Boolean);

  if (host === "youtube.com" || host === "youtube-nocookie.com" || host === "youtu.be") {
    let id: string | null = null;
    if (host === "youtu.be") id = path[0] ?? null;
    else if (path[0] === "watch") id = u.searchParams.get("v");
    else if (["embed", "shorts", "live", "v"].includes(path[0] ?? "")) id = path[1] ?? null;
    if (!id || !YT_ID.test(id)) return null;
    const start = Number.parseInt((u.searchParams.get("t") ?? u.searchParams.get("start") ?? "").replace(/s$/, ""), 10);
    const qs = new URLSearchParams({ rel: "0", modestbranding: "1" });
    if (Number.isFinite(start) && start > 0) qs.set("start", String(start));
    return { kind: "iframe", provider: "youtube", src: `https://www.youtube-nocookie.com/embed/${id}?${qs}` };
  }

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const i = path.findIndex((p) => /^\d+$/.test(p));
    if (i < 0) return null;
    const id = path[i];
    const hash = u.searchParams.get("h") ?? (path[i + 1] && /^[a-f0-9]{6,}$/i.test(path[i + 1]) ? path[i + 1] : null);
    const qs = new URLSearchParams({ dnt: "1" });
    if (hash) qs.set("h", hash);
    return { kind: "iframe", provider: "vimeo", src: `https://player.vimeo.com/video/${id}?${qs}` };
  }

  if (host === "stream.mux.com" || host === "player.mux.com") {
    const id = (path[0] ?? "").replace(/\.m3u8$/i, "");
    if (!/^[A-Za-z0-9]{10,}$/.test(id)) return null;
    return { kind: "iframe", provider: "mux", src: `https://player.mux.com/${id}` };
  }

  if (/\.(mp4|webm|mov)$/i.test(u.pathname) && u.protocol === "https:") return { kind: "video", src: u.toString() };
  return null;
}

// ───────── Estados de las clases ─────────
export type LessonLite = { id: string; moduleId: string | null; required: boolean; sort: number };
export type ModuleLite = { id: string; sort: number };
export type LessonState = "done" | "next" | "open" | "locked";

/** Orden real del curso: por módulo (los sin módulo al final) y dentro de cada módulo por `sort`. */
export function orderLessons<T extends LessonLite>(lessons: T[], modules: ModuleLite[]): T[] {
  const mSort = new Map(modules.map((m) => [m.id, m.sort]));
  const key = (l: T) => (l.moduleId && mSort.has(l.moduleId) ? (mSort.get(l.moduleId) as number) : Number.MAX_SAFE_INTEGER);
  return lessons.map((l, i) => ({ l, i })).sort((a, b) => key(a.l) - key(b.l) || a.l.sort - b.l.sort || a.i - b.i).map((x) => x.l);
}

/**
 * Estado de cada clase (en el orden del curso):
 * - done: ya la viste (nunca se bloquea una clase vista).
 * - locked: hay antes una clase obligatoria sin ver.
 * - next: la primera clase sin ver y no bloqueada.
 * - open: disponible, sin ver.
 */
export function lessonStates(ordered: LessonLite[], done: Set<string>): Map<string, LessonState> {
  const out = new Map<string, LessonState>();
  let blocked = false, nextGiven = false;
  for (const l of ordered) {
    if (done.has(l.id)) { out.set(l.id, "done"); continue; }
    if (blocked) { out.set(l.id, "locked"); continue; }
    out.set(l.id, nextGiven ? "open" : "next");
    nextGiven = true;
    if (l.required) blocked = true;
  }
  return out;
}

/** La siguiente clase para "Continúa donde te quedaste": la marcada como siguiente, o null si el curso está completo. */
export function nextLessonId(ordered: LessonLite[], done: Set<string>): string | null {
  const st = lessonStates(ordered, done);
  return ordered.find((l) => st.get(l.id) === "next")?.id ?? null;
}

/** Avance del curso. Solo cuentan las clases que existen hoy en el curso. */
export function courseProgress(lessonIds: string[], done: Set<string>): { done: number; total: number; pct: number; complete: boolean } {
  const total = lessonIds.length;
  const n = lessonIds.filter((id) => done.has(id)).length;
  return { done: n, total, pct: total ? Math.round((n / total) * 100) : 0, complete: total > 0 && n === total };
}

/** Clase anterior y siguiente en el orden del curso. */
export function neighbors<T extends { id: string }>(ordered: T[], id: string): { prev: T | null; next: T | null } {
  const i = ordered.findIndex((l) => l.id === id);
  if (i < 0) return { prev: null, next: null };
  return { prev: ordered[i - 1] ?? null, next: ordered[i + 1] ?? null };
}

// ───────── Formato ─────────
/** Duración legible: "8 min", "1 h 05 min", "45 s". 0 o vacío → null (no se muestra). */
export function durationLabel(sec: number | null | undefined, unit: { h: string; min: string; s: string }): string | null {
  if (!sec || sec <= 0) return null;
  if (sec < 60) return `${sec} ${unit.s}`;
  const totalMin = Math.round(sec / 60);
  if (totalMin < 60) return `${totalMin} ${unit.min}`;
  return `${Math.floor(totalMin / 60)} ${unit.h} ${String(totalMin % 60).padStart(2, "0")} ${unit.min}`;
}

/** Pantallas válidas para "Hazlo ahora en la app". Lo demás no se enlaza. */
const CTA = /^\/[a-z0-9-]+(\/[a-z0-9-]+)*([?#][\w=&#-]*)?$/;
export const safeCta = (screen: string | null | undefined): string | null => (screen && CTA.test(screen.trim()) ? screen.trim() : null);

/** Parte un texto en lo que va antes y después de `{key}`, para resaltar ese valor: "Tienes {n} puntos" → ["Tienes ", " puntos"]. */
export function splitOn(text: string, key: string, vars: Record<string, string | number> = {}): [string, string] {
  const i = text.indexOf(`{${key}}`);
  if (i < 0) return [fill(text, vars), ""];
  return [fill(text.slice(0, i), vars), fill(text.slice(i + key.length + 2), vars)];
}

// ───────── Cursos programados ─────────
/** Un curso programado cuya fecha aún no llega: se ve (portada, fecha) pero no se abre. */
export const isUpcoming = (status: string, publishAt: string | null, nowMs: number): boolean =>
  status === "scheduled" && !!publishAt && Date.parse(publishAt) > nowMs;

/** Cuenta regresiva en días, horas, minutos y segundos (nunca negativa). */
export function countdown(targetMs: number, nowMs: number): { d: number; h: number; m: number; s: number } {
  let left = Math.max(0, Math.floor((targetMs - nowMs) / 1000));
  const d = Math.floor(left / 86400); left -= d * 86400;
  const h = Math.floor(left / 3600); left -= h * 3600;
  const m = Math.floor(left / 60);
  return { d, h, m, s: left - m * 60 };
}

/** Comentario válido: sin espacios sobrantes, de 1 a 2,000 caracteres. */
export function cleanComment(body: string): string | null {
  const t = body.replace(/\r\n/g, "\n").trim();
  return t.length >= 1 && t.length <= 2000 ? t : null;
}

/** Fecha (YYYY-MM-DD) y hora (HH:MM) de un instante en la zona horaria del usuario. */
export function localParts(isoInstant: string, timeZone: string): { date: string; time: string } {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(isoInstant)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
