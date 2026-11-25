// Cálculos puros de /admin/academia (sin base de datos). Probados en tests/admin-academia.test.ts.

// ───────── Estado de un curso ─────────
export type CourseState = "draft" | "scheduled" | "published";
/** Un curso programado cuya fecha ya pasó está publicado de hecho (así lo ve `course_live` en la base). */
export function courseState(status: string, publishAt: string | null, nowMs: number): CourseState {
  if (status === "published") return "published";
  if (status === "scheduled") return publishAt && Date.parse(publishAt) <= nowMs ? "published" : "scheduled";
  return "draft";
}

// ───────── Enlace del curso (slug) ─────────
/** "Sal de deudas con método" → "sal-de-deudas-con-metodo". Vacío si no queda nada. */
export function slugify(title: string): string {
  return title
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/ñ/g, "n")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 60).replace(/-+$/g, "");
}

/** Etiqueta de etapa y número: "Domina la app · 01". */
export const stageLabel = (stage: string, n: number) => `${stage} · ${String(n).padStart(2, "0")}`;

// ───────── Duración de una clase ─────────
/** "8:30" → 510, "8" → 480 (minutos), "1:05:00" → 3900, "" → 0. null si no se entiende. */
export function parseDuration(text: string): number | null {
  const t = text.trim();
  if (!t) return 0;
  if (!/^\d{1,3}(:\d{1,2}){0,2}$/.test(t)) return null;
  const p = t.split(":").map(Number);
  if (p.slice(1).some((x) => x > 59)) return null;
  const sec = p.length === 1 ? p[0] * 60 : p.length === 2 ? p[0] * 60 + p[1] : p[0] * 3600 + p[1] * 60 + p[2];
  return sec <= 6 * 3600 ? sec : null;
}
/** 510 → "8:30"; 3900 → "1:05:00"; 0 → "". */
export function fmtDuration(sec: number | null | undefined): string {
  if (!sec || sec <= 0) return "";
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

// ───────── Fecha de publicación en la zona horaria del admin ─────────
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Diferencia (ms) entre la hora de pared de `tz` y UTC en el instante `ms`. */
function offsetMs(tz: string, ms: number): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return wall - Math.floor(ms / 1000) * 1000;
}

/**
 * Día (YYYY-MM-DD) y hora (HH:MM) escritos en la zona `tz` → instante UTC (ISO).
 * null si el formato no vale o esa hora no existe ese día (cambio de horario).
 */
export function zonedToUtc(date: string, time: string, tz: string): string | null {
  if (!DATE_RE.test(date) || !TIME_RE.test(time)) return null;
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  if (Number.isNaN(wall) || new Date(wall).toISOString().slice(0, 10) !== date) return null;
  let t: number;
  try {
    const o1 = offsetMs(tz, wall);
    t = wall - o1;
    const o2 = offsetMs(tz, t);
    if (o2 !== o1) t = wall - o2;
    if (offsetMs(tz, t) + t !== wall) return null; // hora que no existe (se adelanta el reloj)
  } catch {
    return null; // zona horaria desconocida
  }
  return new Date(t).toISOString();
}

// ───────── Orden ─────────
/** Mueve un elemento una posición arriba (-1) o abajo (+1). Devuelve la lista igual si no se puede. */
export function moveItem<T>(list: T[], index: number, dir: -1 | 1): T[] {
  const j = index + dir;
  if (index < 0 || index >= list.length || j < 0 || j >= list.length) return list;
  const out = [...list];
  [out[index], out[j]] = [out[j], out[index]];
  return out;
}

// ───────── Portada ─────────
/** Portada válida: vacía, una ruta del sitio ("/cursos/curso-01.webp") o un enlace https. */
export function checkCover(url: string): string | null {
  const u = url.trim();
  if (!u) return "";
  if (/^\/[A-Za-z0-9._~\-/]+$/.test(u) && !u.includes("//") && !u.includes("..")) return u;
  try {
    const p = new URL(u);
    return p.protocol === "https:" ? p.toString() : null;
  } catch {
    return null;
  }
}

// ───────── Pantallas para "Hazlo ahora en la app" ─────────
export const CTA_SCREENS = ["/asistente", "/plan", "/movimientos", "/cuentas", "/metas", "/proyeccion", "/analisis", "/deudas", "/inversiones", "/cierre", "/diagnostico"] as const;

export const STAGES = ["Domina la app", "Tu dinero"] as const;
export const PRIORITIES = ["surplus", "debt", "emergency", "saving", "dependency"] as const;
