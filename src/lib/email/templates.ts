// Plantillas HTML de los 4 correos (docs/mockup/Correos.dc.html). PURAS: reciben datos ya calculados y devuelven asunto, HTML y texto.
// HTML para clientes de correo: tablas, estilos en línea, 600 px, sin CSS externo ni variables (los clientes de correo no las leen).
// Nunca llevan montos ni datos financieros: solo nombre, mes, fecha, racha, puntos y porcentaje de descuento.
import { fill, type Locale } from "@/i18n";
import { formatDate, monthName, type ISODate } from "@/lib/engine";
import { escapeHtml, firstName, type EmailKind, type Period } from "./lib";
import { M, type EmailTexts } from "./messages";

/** Colores del sistema de diseño (src/app/globals.css) escritos en hex porque los correos no leen var(--…). */
const C = {
  tinta: "#141612", // --tinta
  tinta2: "#3A3D36", // --tinta-2
  gris: "#5F6359", // --gris
  papel: "#F6F5F0", // --papel
  blanco: "#FFFFFF", // --blanco
  linea: "#E6E4DC", // --linea
  amarilloSuave: "#FFF8D6", // --amarillo-suave (el mockup usa #FFF6CC, sin token)
  amarilloTexto: "#5C4A00", // --amarillo-texto (el mockup usa #7A5A00, sin token)
  amarillo: "#F2CD00", // --amarillo
  oscuro1: "#0B0C0A", // --oscuro-1
  oscuro2: "#1C1E19", // --oscuro-2
} as const;
const SANS = "Geist, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export type Rendered = { subject: string; preheader: string; html: string; text: string };
type Base = { locale: Locale; appUrl: string };
export type WelcomeData = Base & { name: string };
/** `late`: el aviso sale cuando el mes ya terminó (prefs.close_day = "first"). */
export type CloseData = Base & { period: Period; streak: number; points: number | null; showStreak: boolean; late?: boolean };
export type AccessData = Base & { until: ISODate; daysLeft: number; discountPct: number | null };
export type PaymentData = Base & { failedOn: ISODate };
/** Acceso gratis dado desde el panel: tipo y hasta cuándo (null = de por vida). Nunca montos. */
export type GrantData = Base & { name: string; kind: "alumno" | "fundador"; until: ISODate | null };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const url = (base: string, path: string) => `${base.replace(/\/+$/, "")}${path}`;

type Block = { kind: "p"; text: string; linkText?: string; linkHref?: string; after?: string } | { kind: "stats"; items: { label: string; value: string; accent?: boolean }[] };
type Layout = { t: EmailTexts; appUrl: string; locale: Locale; preheader: string; label: string; title: string; blocks: Block[]; cta: { text: string; href: string }; footer: string };

function paragraphHtml(b: Extract<Block, { kind: "p" }>): string {
  const link = b.linkText && b.linkHref
    ? `<a href="${escapeHtml(b.linkHref)}" style="color:${C.tinta};text-decoration:underline;text-decoration-color:${C.amarillo};">${escapeHtml(b.linkText)}</a>${escapeHtml(b.after ?? "")}`
    : "";
  return `<tr><td style="padding:0 0 16px 0;font-family:${SANS};font-size:15px;line-height:1.65;color:${C.tinta2};">${escapeHtml(b.text)}${link}</td></tr>`;
}
function statsHtml(b: Extract<Block, { kind: "stats" }>): string {
  const w = Math.floor(100 / b.items.length);
  const cells = b.items.map((it, i) => `<td width="${w}%" valign="top" style="padding:0 ${i < b.items.length - 1 ? 6 : 0}px 0 ${i > 0 ? 6 : 0}px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${it.accent ? C.amarilloSuave : C.papel}" style="background:${it.accent ? C.amarilloSuave : C.papel};border-radius:12px;padding:14px;font-family:${SANS};">
<span style="font-size:12px;color:${it.accent ? C.amarilloTexto : C.gris};">${escapeHtml(it.label)}</span><br><strong style="font-size:20px;font-weight:600;color:${C.tinta};">${escapeHtml(it.value)}</strong>
</td></tr></table></td>`).join("");
  return `<tr><td style="padding:0 0 16px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cells}</tr></table></td></tr>`;
}

function layout(l: Layout): string {
  const prefsHref = url(l.appUrl, "/perfil#notificaciones");
  const logo = url(l.appUrl, "/brand/logo-360-dark.png");
  const body = l.blocks.map((b) => (b.kind === "p" ? paragraphHtml(b) : statsHtml(b))).join("");
  return `<!doctype html>
<html lang="${l.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escapeHtml(l.title)}</title></head>
<body style="margin:0;padding:0;background:${C.papel};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.papel};">${escapeHtml(l.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.papel}" style="background:${C.papel};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${C.blanco};border:1px solid ${C.linea};border-radius:16px;overflow:hidden;">
<tr><td bgcolor="${C.oscuro1}" style="background:${C.oscuro1};background-image:linear-gradient(135deg, ${C.oscuro1} 0%, ${C.oscuro2} 100%);padding:22px 32px;">
<img src="${escapeHtml(logo)}" alt="${escapeHtml(l.t.brandAlt)}" height="40" style="display:block;height:40px;width:auto;max-width:100%;border:0;color:${C.blanco};font-family:${SANS};font-size:16px;"></td></tr>
<tr><td style="padding:30px 32px 14px 32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="padding:0 0 16px 0;font-family:${SANS};font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:${C.gris};">${escapeHtml(l.label)}</td></tr>
<tr><td style="padding:0 0 16px 0;font-family:${SANS};font-size:24px;font-weight:600;letter-spacing:-0.02em;line-height:1.25;color:${C.tinta};">${escapeHtml(l.title)}</td></tr>
${body}
<tr><td style="padding:0 0 16px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${C.tinta}" style="border-radius:12px;background:${C.tinta};">
<a href="${escapeHtml(l.cta.href)}" style="display:inline-block;padding:14px 22px;font-family:${SANS};font-size:15px;font-weight:600;color:${C.blanco};text-decoration:none;border-radius:12px;">${escapeHtml(l.cta.text)}</a>
</td></tr></table></td></tr>
<tr><td style="padding:0 0 16px 0;font-family:${SANS};font-size:14px;color:${C.tinta2};">${escapeHtml(l.t.signature)}</td></tr>
</table></td></tr>
<tr><td bgcolor="${C.papel}" style="background:${C.papel};padding:18px 32px;font-family:${SANS};font-size:12px;line-height:1.6;color:${C.gris};">
${escapeHtml(l.footer)} <a href="${escapeHtml(prefsHref)}" style="color:${C.tinta};text-decoration:underline;text-decoration-color:${C.amarillo};">${escapeHtml(l.t.footer.prefs)}</a> · ${escapeHtml(l.t.footer.company)}
</td></tr>
</table></td></tr></table>
</body></html>`;
}

function textOf(l: Layout): string {
  const lines = [l.label.toUpperCase(), "", l.title, ""];
  for (const b of l.blocks) {
    if (b.kind === "p") lines.push(`${b.text}${b.linkText ?? ""}${b.after ?? ""}`, "");
    else lines.push(b.items.map((i) => `${i.label}: ${i.value}`).join(" · "), "");
  }
  lines.push(`${l.cta.text}: ${l.cta.href}`, "", l.t.signature, "", "—", `${l.footer} ${l.t.footer.prefs}: ${url(l.appUrl, "/perfil#notificaciones")}`, l.t.footer.company);
  return lines.join("\n");
}

function finish(l: Layout, subject: string): Rendered {
  return { subject, preheader: l.preheader, html: layout(l), text: textOf(l) };
}

export function welcomeEmail(d: WelcomeData): Rendered {
  const t = M[d.locale];
  const name = firstName(d.name);
  const l: Layout = {
    t, appUrl: d.appUrl, locale: d.locale, preheader: t.welcome.subject, label: t.welcome.label,
    title: name ? fill(t.welcome.titleName, { name }) : t.welcome.titleNoName,
    blocks: [
      { kind: "p", text: t.welcome.p1 },
      { kind: "p", text: t.welcome.p2Before, linkText: t.welcome.p2Link, linkHref: url(d.appUrl, "/academia/empieza-aqui"), after: t.welcome.p2After },
    ],
    cta: { text: t.welcome.cta, href: url(d.appUrl, "/asistente") },
    footer: t.footer.account,
  };
  return finish(l, t.welcome.subject);
}

export function closeEmail(d: CloseData): Rendered {
  const t = M[d.locale];
  const month = monthName(d.period.month, d.locale);
  const nextM = monthName(d.period.month === 12 ? 1 : d.period.month + 1, d.locale);
  const lower = d.locale === "es" ? month.toLowerCase() : month;
  const vars = { month: lower, Month: cap(month), next: d.locale === "es" ? nextM.toLowerCase() : nextM };
  const items: { label: string; value: string; accent?: boolean }[] = [];
  if (d.showStreak) items.push({ label: t.close.streak, value: d.streak === 1 ? t.close.streakOne : fill(t.close.streakN, { n: d.streak }) });
  if (d.showStreak && d.points) items.push({ label: t.close.points, value: fill(t.close.pointsN, { n: d.points }), accent: true });
  const blocks: Block[] = [{ kind: "p", text: fill(t.close.p1, vars) }];
  if (items.length) blocks.push({ kind: "stats", items });
  const l: Layout = {
    t, appUrl: d.appUrl, locale: d.locale, preheader: fill(t.close.subject, vars), label: fill(t.close.label, vars), title: fill(d.late ? t.close.titleLate : t.close.title, vars), blocks,
    cta: { text: fill(t.close.cta, vars), href: url(d.appUrl, "/cierre") },
    footer: t.footer.account,
  };
  return finish(l, fill(t.close.subject, vars));
}

export function accessEmail(d: AccessData): Rendered {
  const t = M[d.locale];
  const date = formatDate(d.until, d.locale, "day");
  const subject = d.daysLeft <= 1 ? t.access.subjectOne : fill(t.access.subject, { n: d.daysLeft });
  const l: Layout = {
    t, appUrl: d.appUrl, locale: d.locale, preheader: subject, label: t.access.label, title: fill(t.access.title, { date }),
    blocks: [
      { kind: "p", text: t.access.p1 },
      { kind: "p", text: d.discountPct && d.discountPct > 0 ? fill(t.access.p2Discount, { pct: d.discountPct }) : t.access.p2 },
    ],
    cta: { text: t.access.cta, href: url(d.appUrl, "/suscripcion") },
    footer: t.footer.access,
  };
  return finish(l, subject);
}

export function paymentEmail(d: PaymentData): Rendered {
  const t = M[d.locale];
  const date = formatDate(d.failedOn, d.locale, "day");
  const l: Layout = {
    t, appUrl: d.appUrl, locale: d.locale, preheader: t.payment.subject, label: t.payment.label, title: t.payment.title,
    blocks: [{ kind: "p", text: fill(t.payment.p1, { date }) }, { kind: "p", text: t.payment.p2 }],
    cta: { text: t.payment.cta, href: url(d.appUrl, "/suscripcion") },
    footer: t.footer.important,
  };
  return finish(l, t.payment.subject);
}

export function grantEmail(d: GrantData): Rendered {
  const t = M[d.locale];
  const name = firstName(d.name);
  const kind = t.grant.kinds[d.kind];
  const l: Layout = {
    t, appUrl: d.appUrl, locale: d.locale, preheader: t.grant.subject, label: t.grant.label,
    title: name ? fill(t.grant.titleName, { name }) : t.grant.titleNoName,
    blocks: [
      { kind: "p", text: d.until ? fill(t.grant.p1Until, { kind, date: formatDate(d.until, d.locale) }) : fill(t.grant.p1Life, { kind }) },
      { kind: "p", text: d.until ? t.grant.p2Until : t.grant.p2Life },
    ],
    cta: { text: t.grant.cta, href: url(d.appUrl, "/inicio") },
    footer: t.footer.account,
  };
  return finish(l, t.grant.subject);
}

export type AnyEmail =
  | { kind: "welcome"; data: WelcomeData }
  | { kind: "close_reminder"; data: CloseData }
  | { kind: "access_expiring"; data: AccessData }
  | { kind: "payment_failed"; data: PaymentData }
  | { kind: "access_granted"; data: GrantData };

export function renderEmail(e: AnyEmail): Rendered {
  switch (e.kind) {
    case "welcome": return welcomeEmail(e.data);
    case "close_reminder": return closeEmail(e.data);
    case "access_expiring": return accessEmail(e.data);
    case "payment_failed": return paymentEmail(e.data);
    case "access_granted": return grantEmail(e.data);
  }
}
export const EMAIL_KINDS: EmailKind[] = ["welcome", "close_reminder", "access_expiring", "payment_failed", "access_granted"];
