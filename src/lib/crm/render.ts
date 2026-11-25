// CRM: correo de campaña o de automatización a partir de los bloques del editor, y texto de SMS. PURO.
// Cumple la Spam Act 2003: remitente claro, razón social / ABN / dirección (app_config.legal), baja en un clic
// (List-Unsubscribe + List-Unsubscribe-Post) y "Elegir qué correos recibo". SMS: remitente + "Responde STOP".
import type { Locale } from "@/i18n";
import { escapeHtml, firstName } from "@/lib/email/lib";
import type { Block } from "./schema";

/** Colores del sistema de diseño (src/app/globals.css) en hex: los clientes de correo no leen var(--…). */
const C = { tinta: "#141612", tinta2: "#3A3D36", gris: "#5F6359", papel: "#F6F5F0", blanco: "#FFFFFF", linea: "#E6E4DC", amarillo: "#F2CD00" } as const;
const SANS = "Geist, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export type Legal = { company: string; abn: string; address: string };
/** ABN: 11 dígitos (se ignoran espacios). */
export const isAbn = (abn: string | null | undefined) => /^\d{11}$/.test((abn ?? "").replace(/\s+/g, ""));
/** Sin razón social, ABN (11 dígitos) y dirección reales (siguen los marcadores "[…]" o vacíos) no sale marketing de verdad. */
export const legalReady = (l: Legal) =>
  [l.company, l.address].every((v) => !!v && v.trim().length > 1 && !v.trim().startsWith("[")) && isAbn(l.abn);

export const TEXTS = {
  es: {
    from: "De",
    footerWhy: "Recibes este correo porque aceptaste noticias de Revolución 360.",
    unsubscribe: "Darte de baja",
    preferences: "Elegir qué correos recibo",
    brand: "Revolución del Dinero",
    smsStop: "Responde STOP para no recibir más.",
    smsSender: "Revolución 360",
  },
  en: {
    from: "From",
    footerWhy: "You get this email because you agreed to receive news from Revolución 360.",
    unsubscribe: "Unsubscribe",
    preferences: "Choose which emails I get",
    brand: "Revolución del Dinero",
    smsStop: "Reply STOP to opt out.",
    smsSender: "Revolución 360",
  },
} as const satisfies Record<Locale, Record<string, string>>;

const base = (u: string) => u.replace(/\/+$/, "");
export const unsubscribeUrl = (appUrl: string, token: string) => `${base(appUrl)}/api/crm/unsubscribe?t=${encodeURIComponent(token)}`;
export const preferencesUrl = (appUrl: string, token: string) => `${base(appUrl)}/correo/preferencias?t=${encodeURIComponent(token)}`;
/** Encabezados de baja en un clic (RFC 8058): Gmail y Apple Mail muestran "Darse de baja" y hacen POST a esa URL. */
export const unsubscribeHeaders = (url: string): Record<string, string> => ({ "List-Unsubscribe": `<${url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });

/** Una ruta de la app ("/plan") se vuelve absoluta; un https:// queda igual. */
export const absolute = (appUrl: string, href: string) => (href.startsWith("/") ? `${base(appUrl)}${href}` : href);

/** "[nombre]" / "[name]" → primer nombre. Sin nombre: "Hola, [nombre]" queda "Hola". */
export function personalize(text: string, name: string | null | undefined): string {
  const n = firstName(name);
  if (n) return text.replace(/\[(nombre|name)\]/gi, n);
  return text.replace(/^\s*\[(nombre|name)\]\s*,?\s*/i, "").replace(/,?\s*\[(nombre|name)\]/gi, "").replace(/^\s+/, "");
}

export type EmailInput = {
  subject: string; preheader: string; blocks: Block[]; locale: Locale; appUrl: string;
  name: string | null; legal: Legal; token: string | null; fromLabel: string;
};
export type RenderedEmail = { subject: string; preheader: string; html: string; text: string };

const paragraphs = (t: string) => t.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

function blockHtml(b: Block, i: EmailInput): string {
  const td = (inner: string, pad = "0 0 16px 0") => `<tr><td style="padding:${pad};">${inner}</td></tr>`;
  switch (b.type) {
    case "heading":
      return `<tr><td style="padding:0 0 14px 0;font-family:${SANS};font-size:22px;font-weight:600;letter-spacing:-0.02em;line-height:1.3;color:${C.tinta};">${escapeHtml(personalize(b.text, i.name))}</td></tr>`;
    case "text":
      return paragraphs(personalize(b.text, i.name)).map((p) =>
        `<tr><td style="padding:0 0 14px 0;font-family:${SANS};font-size:15px;line-height:1.65;color:${C.tinta2};">${escapeHtml(p).replace(/\n/g, "<br>")}</td></tr>`).join("");
    case "image": {
      const img = `<img src="${escapeHtml(b.src)}" alt="${escapeHtml(b.alt)}" width="536" style="display:block;width:100%;max-width:536px;height:auto;border:0;border-radius:12px;">`;
      return td(b.href ? `<a href="${escapeHtml(absolute(i.appUrl, b.href))}">${img}</a>` : img);
    }
    case "button":
      return td(`<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${C.tinta}" style="border-radius:12px;background:${C.tinta};"><a href="${escapeHtml(absolute(i.appUrl, b.href))}" style="display:inline-block;padding:14px 22px;font-family:${SANS};font-size:15px;font-weight:600;color:${C.blanco};text-decoration:none;border-radius:12px;">${escapeHtml(b.text)}</a></td></tr></table>`);
    case "lesson":
      return td(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${C.papel}" style="background:${C.papel};border-radius:12px;padding:14px 16px;font-family:${SANS};">${b.course ? `<span style="font-size:12px;color:${C.gris};">${escapeHtml(b.course)}</span><br>` : ""}<a href="${escapeHtml(absolute(i.appUrl, b.href))}" style="font-size:15px;font-weight:600;color:${C.tinta};text-decoration:underline;text-decoration-color:${C.amarillo};">${escapeHtml(b.title)}</a></td></tr></table>`);
    case "divider":
      return td(`<div style="height:1px;background:${C.linea};line-height:1px;font-size:1px;">&nbsp;</div>`, "4px 0 18px 0");
    case "signature":
      return `<tr><td style="padding:0 0 16px 0;font-family:${SANS};font-size:14px;color:${C.tinta2};">— ${escapeHtml(b.text)}</td></tr>`;
  }
}

function blockText(b: Block, i: EmailInput): string {
  switch (b.type) {
    case "heading": return personalize(b.text, i.name);
    case "text": return paragraphs(personalize(b.text, i.name)).join("\n\n");
    case "image": return b.alt ? `[${b.alt}]` : "";
    case "button": return `${b.text}: ${absolute(i.appUrl, b.href)}`;
    case "lesson": return `${b.course ? `${b.course} · ` : ""}${b.title}: ${absolute(i.appUrl, b.href)}`;
    case "divider": return "—";
    case "signature": return `— ${b.text}`;
  }
}

/** Pie legal: "Revolución del Dinero · Razón social, ABN · Dirección". */
export const legalLine = (l: Legal, t: (typeof TEXTS)[Locale]) => `${t.brand} · ${l.company}, ABN ${l.abn} · ${l.address}`;

export function renderMarketingEmail(i: EmailInput): RenderedEmail {
  const t = TEXTS[i.locale];
  const subject = personalize(i.subject, i.name);
  const preheader = personalize(i.preheader, i.name);
  const unsub = i.token ? unsubscribeUrl(i.appUrl, i.token) : null;
  const prefs = i.token ? preferencesUrl(i.appUrl, i.token) : null;
  const link = (href: string | null, text: string) => (href ? `<a href="${escapeHtml(href)}" style="color:${C.tinta};text-decoration:underline;">${escapeHtml(text)}</a>` : `<u>${escapeHtml(text)}</u>`);
  const html = `<!doctype html>
<html lang="${i.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${C.papel};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.papel};">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.papel}" style="background:${C.papel};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${C.blanco};border:1px solid ${C.linea};border-radius:16px;overflow:hidden;">
<tr><td style="padding:28px 32px 12px 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${i.blocks.map((b) => blockHtml(b, i)).join("\n")}
</table></td></tr>
<tr><td bgcolor="${C.papel}" style="background:${C.papel};padding:18px 32px;font-family:${SANS};font-size:12px;line-height:1.6;color:${C.gris};">
${escapeHtml(legalLine(i.legal, t))}<br>${escapeHtml(t.footerWhy)} ${link(unsub, t.unsubscribe)} · ${link(prefs, t.preferences)}
</td></tr>
</table></td></tr></table>
</body></html>`;
  const text = [
    ...i.blocks.map((b) => blockText(b, i)).filter(Boolean).flatMap((x) => [x, ""]),
    "—",
    legalLine(i.legal, t),
    t.footerWhy,
    unsub ? `${t.unsubscribe}: ${unsub}` : t.unsubscribe,
    prefs ? `${t.preferences}: ${prefs}` : t.preferences,
  ].join("\n");
  return { subject, preheader, html, text };
}

/** SMS: "Revolución 360: <texto> Responde STOP para no recibir más." */
export function renderSms(body: string, locale: Locale, name: string | null): string {
  const t = TEXTS[locale];
  return `${t.smsSender}: ${personalize(body, name).replace(/\s+/g, " ").trim()} ${t.smsStop}`;
}
