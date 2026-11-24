// Cálculos puros de Ayuda: datos técnicos del caso (sin montos) y búsqueda de preguntas.

export const TOPICS = ["problem", "question", "billing", "security", "idea"] as const;
export type Topic = (typeof TOPICS)[number];
export const asTopic = (t: string): Topic => ((TOPICS as readonly string[]).includes(t) ? (t as Topic) : "question");

/** Lo único que puede viajar en `support_tickets.tech`. Nunca montos, movimientos ni nombres de cuentas. */
export const TECH_KEYS = ["browser", "screen", "language", "appLanguage", "plan", "country", "version"] as const;
export type TechKey = (typeof TECH_KEYS)[number];
export type Tech = Partial<Record<TechKey, string>>;

const RULES: Record<TechKey, RegExp> = {
  browser: /^[\p{L}\p{N} .·()/_-]{1,60}$/u,
  screen: /^\d{2,5}×\d{2,5}$/,
  language: /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/,
  appLanguage: /^(es|en)$/,
  plan: /^(free|trial|pro|alumno|fundador|read_only)$/,
  country: /^[A-Z]{2,5}$/,
  version: /^[a-z0-9.-]{1,40}$/i,
};

/**
 * Lista blanca: descarta cualquier clave desconocida y cualquier valor que no tenga la forma esperada.
 * Lo que devuelve es exactamente lo que se guarda y lo que se le muestra al usuario.
 */
export function buildTech(input: Record<string, unknown>): Tech {
  const out: Tech = {};
  for (const k of TECH_KEYS) {
    const v = input[k];
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (t && RULES[k].test(t)) out[k] = t;
  }
  return out;
}

/** "Chrome 131 · macOS" a partir del user agent (sin guardar el user agent completo). */
export function browserLabel(ua: string): string {
  const pick = (re: RegExp) => ua.match(re)?.[1]?.split(".")[0];
  const name =
    /Edg\//.test(ua) ? `Edge ${pick(/Edg\/([\d.]+)/) ?? ""}` :
    /OPR\//.test(ua) ? `Opera ${pick(/OPR\/([\d.]+)/) ?? ""}` :
    /Firefox\//.test(ua) ? `Firefox ${pick(/Firefox\/([\d.]+)/) ?? ""}` :
    /Chrome\//.test(ua) ? `Chrome ${pick(/Chrome\/([\d.]+)/) ?? ""}` :
    /Safari\//.test(ua) ? `Safari ${pick(/Version\/([\d.]+)/) ?? ""}` : "";
  const os = /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return [name.trim(), os].filter(Boolean).join(" · ");
}

/** Versión de la app: el commit de Vercel si existe. */
export const appVersion = (sha: string | undefined): string => (sha ? sha.slice(0, 7) : "local");

/** Asunto del caso: la primera línea del mensaje, corta. */
export function subjectOf(message: string, max = 80): string {
  const line = message.trim().split(/\r?\n/)[0].replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

export type FaqLite = { topic: string; question: string; answer: string };
const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
/** Busca en pregunta y respuesta, sin importar tildes ni mayúsculas. */
export function searchFaqs<T extends FaqLite>(list: T[], q: string, topic: string | "all"): T[] {
  const words = norm(q).split(/\s+/).filter(Boolean);
  return list.filter((f) => (topic === "all" || f.topic === topic) && words.every((w) => norm(`${f.question} ${f.answer}`).includes(w)));
}

export const ticketCode = (id: string) => `#${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
