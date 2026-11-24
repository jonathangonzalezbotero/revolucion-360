// Mi perfil: piezas puras (sin base de datos), probadas en tests/perfil.test.ts.

/** Monedas que la app sabe mostrar (las mismas de `NUMBER_LOCALE` en la sesión). */
export const CURRENCIES = ["AUD", "USD", "NZD", "GBP", "EUR", "COP", "MXN", "CLP", "PEN", "ARS", "CAD"] as const;
export type Currency = (typeof CURRENCIES)[number];
export const isCurrency = (v: string): v is Currency => (CURRENCIES as readonly string[]).includes(v);

export const PAY_FREQUENCIES = ["weekly", "fortnightly", "monthly"] as const;
export type PayFrequency = (typeof PAY_FREQUENCIES)[number];

/** Zona horaria IANA real ("Australia/Sydney", "America/Bogota", "UTC"). Todo lo de fechas depende de esto. */
export function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length < 3 || tz.length > 64) return false;
  if (!/^(UTC|[A-Za-z_]+(\/[A-Za-z0-9_+-]+){1,2})$/.test(tz)) return false;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

/** Lista de zonas para el selector: las del motor de JS, con la del usuario siempre incluida. */
export function timezoneOptions(current: string): string[] {
  let all: string[] = [];
  try { all = Intl.supportedValuesOf("timeZone"); } catch { all = []; }
  const set = new Set(all.filter(isValidTimezone));
  set.add("UTC");
  if (isValidTimezone(current)) set.add(current);
  return [...set].sort();
}

/** Teléfono opcional: dígitos, espacios, guiones, paréntesis y + al inicio (6 a 20 dígitos). */
export function isPhone(v: string): boolean {
  const t = v.trim();
  if (!/^\+?[0-9 ()-]+$/.test(t)) return false;
  const digits = t.replace(/\D/g, "").length;
  return digits >= 6 && digits <= 20;
}

// ───────── Pestañas y anclas (#seguridad, #insignias, #racha, #privacidad…) ─────────
export const TABS = ["logros", "datos", "region", "nombres", "notificaciones", "seguridad", "privacidad"] as const;
export type Tab = (typeof TABS)[number];
const ALIASES: Record<string, Tab> = { insignias: "logros", racha: "logros", nivel: "logros", plan: "datos", correo: "datos", idioma: "region", moneda: "region" };

export function visibleTabs(gamification: boolean): Tab[] {
  return TABS.filter((t) => gamification || t !== "logros");
}
/** Qué pestaña abre un ancla. Con los logros apagados, sus anclas caen en la primera pestaña. */
export function tabFromHash(hash: string, gamification: boolean): Tab {
  const key = decodeURIComponent(hash.replace(/^#/, "")).toLowerCase();
  const tabs = visibleTabs(gamification);
  const t = (TABS as readonly string[]).includes(key) ? (key as Tab) : ALIASES[key];
  return t && tabs.includes(t) ? t : tabs[0];
}

// ───────── Términos que renombra el usuario (profiles.terms) ─────────
export const TERM_KEYS = ["retirement", "freelance", "bnpl", "tax_office", "company"] as const;
export type TermKey = (typeof TERM_KEYS)[number];

/** Mezcla los términos: un texto vacío vuelve al del país (se borra la clave). Las demás claves no se tocan. */
export function mergeTerms(old: Record<string, string>, patch: Partial<Record<TermKey, string>>): Record<string, string> {
  const out: Record<string, string> = { ...old };
  for (const k of TERM_KEYS) {
    if (!(k in patch)) continue;
    const v = (patch[k] ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
    if (v) out[k] = v; else delete out[k];
  }
  return out;
}

// ───────── Preferencias de notificaciones (profiles.prefs) ─────────
/**
 * Claves que lee la tarea de correos y avisos:
 * prefs.notify.{close, payments, achievements, academy, news} (true/false),
 * prefs.close_day ("last" | "first") y prefs.channel ("both" | "email" | "app").
 */
export const NOTIFY_KEYS = ["close", "payments", "achievements", "academy", "news"] as const;
export type NotifyKey = (typeof NOTIFY_KEYS)[number];
export const NOTIFY_DEFAULTS: Record<NotifyKey, boolean> = { close: true, payments: true, achievements: true, academy: true, news: false };
export const CLOSE_DAYS = ["last", "first"] as const;
export const CHANNELS = ["both", "email", "app"] as const;
export type NotifyPrefs = { notify: Record<NotifyKey, boolean>; closeDay: (typeof CLOSE_DAYS)[number]; channel: (typeof CHANNELS)[number] };

export function readNotifyPrefs(prefs: Record<string, unknown>): NotifyPrefs {
  const n = (prefs.notify && typeof prefs.notify === "object" ? prefs.notify : {}) as Record<string, unknown>;
  const notify = Object.fromEntries(NOTIFY_KEYS.map((k) => [k, typeof n[k] === "boolean" ? (n[k] as boolean) : NOTIFY_DEFAULTS[k]])) as Record<NotifyKey, boolean>;
  const closeDay = (CLOSE_DAYS as readonly unknown[]).includes(prefs.close_day) ? (prefs.close_day as NotifyPrefs["closeDay"]) : "last";
  const channel = (CHANNELS as readonly unknown[]).includes(prefs.channel) ? (prefs.channel as NotifyPrefs["channel"]) : "both";
  return { notify, closeDay, channel };
}

/** Escribe solo nuestras claves y conserva cualquier otra que ya exista en prefs. */
export function mergeNotifyPrefs(prefs: Record<string, unknown>, patch: Partial<NotifyPrefs>): Record<string, unknown> {
  const cur = readNotifyPrefs(prefs);
  const oldNotify = (prefs.notify && typeof prefs.notify === "object" ? prefs.notify : {}) as Record<string, unknown>;
  return {
    ...prefs,
    notify: { ...oldNotify, ...cur.notify, ...(patch.notify ?? {}) },
    close_day: patch.closeDay ?? cur.closeDay,
    channel: patch.channel ?? cur.channel,
  };
}

// ───────── Borrar la cuenta ─────────
/** La palabra se escribe a mano (sin importar mayúsculas, tildes ni espacios a los lados). */
export function confirmsWord(input: string, word: string): boolean {
  const n = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();
  return n(input) === n(word) && n(word).length > 0;
}

/** Texto de los 10 códigos de respaldo para descargar. */
export const backupCodesText = (title: string, codes: string[]) => `${title}\n\n${codes.join("\n")}\n`;
