// Conexiones web del CRM (src/lib/crm/connections.ts) y automatizaciones transaccionales. Sin base de datos ni red.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  cleanFields, connectionSlug, connectionUrl, contactPatch, exitFor, formSnippet, guessSystemeColumns, hostAllowed, isConnectionTestEmail, mapSystemeRows, matchesTrigger,
  mayTransactional, normalizeHost, parseSubmission, renderMarketingEmail, requestOriginAllowed, testEmailFor, thanksUrlOk, TriggerSchema, turnstileOk,
} from "@/lib/crm";
import { sectionOf } from "@/app/admin/actividad/roles";
import { visibleTriggers } from "@/app/admin/automatizaciones/lib";
import { TRIGGER_KINDS } from "@/lib/crm/schema";
import { findDangers } from "../scripts/check-migrations";

const C1 = "11111111-1111-4111-8111-111111111111";
const C2 = "22222222-2222-4222-8222-222222222222";

describe("páginas permitidas", () => {
  const origins = ["revoluciondeldinero.com", "*.webinar.com"];
  it("dominio exacto o con www; subdominios solo con *.", () => {
    expect(hostAllowed("revoluciondeldinero.com", origins)).toBe(true);
    expect(hostAllowed("www.revoluciondeldinero.com", origins)).toBe(true);
    expect(hostAllowed("app.revoluciondeldinero.com", origins)).toBe(false);
    expect(hostAllowed("evilrevoluciondeldinero.com", origins)).toBe(false); // nunca endsWith suelto
    expect(hostAllowed("revoluciondeldinero.com.evil.com", origins)).toBe(false);
    expect(hostAllowed("a.webinar.com", origins)).toBe(true);
    expect(hostAllowed("webinar.com", origins)).toBe(true);
    expect(hostAllowed("xwebinar.com", origins)).toBe(false);
  });
  it("Origin (o Referer) con https", () => {
    expect(requestOriginAllowed("https://revoluciondeldinero.com", null, origins)).toMatchObject({ ok: true, origin: "https://revoluciondeldinero.com" });
    expect(requestOriginAllowed(null, "https://www.revoluciondeldinero.com/bootcamp?x=1", origins).ok).toBe(true);
    expect(requestOriginAllowed("http://revoluciondeldinero.com", null, origins).ok).toBe(false);
    expect(requestOriginAllowed("null", null, origins).ok).toBe(false);
    expect(requestOriginAllowed(null, null, origins).ok).toBe(false);
    expect(requestOriginAllowed("https://otra.com", "https://revoluciondeldinero.com/", origins).ok).toBe(false); // manda el Origin
  });
  it("lo que escribe el Dueño se limpia", () => {
    expect(normalizeHost("https://www.RevolucionDelDinero.com/bootcamp")).toBe("www.revoluciondeldinero.com");
    expect(normalizeHost("*.revoluciondeldinero.com")).toBe("*.revoluciondeldinero.com");
    expect(normalizeHost("localhost")).toBeNull();
    expect(normalizeHost("no es un dominio")).toBeNull();
  });
  it("la página de gracias: https y de una página permitida", () => {
    expect(thanksUrlOk(null, origins)).toBe(true);
    expect(thanksUrlOk("https://revoluciondeldinero.com/gracias", origins)).toBe(true);
    expect(thanksUrlOk("http://revoluciondeldinero.com/gracias", origins)).toBe(false);
    expect(thanksUrlOk("https://phishing.com/", origins)).toBe(false);
  });
  it("Turnstile: éxito y resuelto en una página permitida", () => {
    expect(turnstileOk({ success: true, hostname: "revoluciondeldinero.com" }, origins)).toBe(true);
    expect(turnstileOk({ success: true, hostname: "otro.com" }, origins)).toBe(false);
    expect(turnstileOk({ success: false, hostname: "revoluciondeldinero.com" }, origins)).toBe(false);
    expect(turnstileOk(null, origins)).toBe(false);
  });
});

describe("lo que llega de un formulario", () => {
  it("navegador: nombres del mockup; solo etiquetas de la conexión y solo llenar vacíos", () => {
    const r = parseSubmission({
      nombre: "Ana Morales", correo: " ANA@Correo.com ", pais: "Australia", acepta_correos: "true", ciudad: "Sydney",
      "cf-turnstile-response": "tok", tags: "acceso-comunidad", removeTags: "x", mode: "upsert",
    }, false);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sub).toMatchObject({ email: "ana@correo.com", name: "Ana Morales", country: null, consentEmail: true, tags: [], removeTags: [], mode: "fill" });
    expect(r.sub.fields).toEqual({ ciudad: "Sydney", pais: "Australia" }); // sin el token anti-bots
  });
  it("sin la casilla marcada no hay consentimiento", () => {
    const r = parseSubmission({ correo: "a@b.co" }, false);
    expect(r.ok && r.sub.consentEmail).toBe(false);
    const off = parseSubmission({ correo: "a@b.co", acepta_correos: "false" }, false);
    expect(off.ok && off.sub.consentEmail).toBe(false);
  });
  it("sin correo válido se rechaza", () => {
    expect(parseSubmission({ nombre: "Ana" }, false)).toEqual({ ok: false, error: "email" });
    expect(parseSubmission({ correo: "no-es-correo" }, false)).toEqual({ ok: false, error: "email" });
  });
  it("servidor con clave: etiquetas, quitar etiquetas, campos extra y modo (lo que hace hoy la web)", () => {
    const r = parseSubmission({
      email: "b@c.com", first_name: "Juan", surname: "Pérez", phone: "0412 345 678", country: "AU",
      tags: ["evento-septiembre-2026", "Entrada VIP"], removeTags: ["evento-sept-2026-no-pago"], fields: { partners_name: "Luz", partners_phone: "+61400000000" },
      mode: "fill", consent: { email: true }, evidence: { text: "Quiero correos", url: "https://revoluciondeldinero.com/evento" },
    }, true);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sub).toMatchObject({
      name: "Juan Pérez", phone: "+61412345678", country: "AU", mode: "fill", consentEmail: true,
      tags: ["evento-septiembre-2026", "Entrada VIP"], removeTags: ["evento-sept-2026-no-pago"], fields: { partners_name: "Luz", partners_phone: "+61400000000" },
    });
    expect(r.sub.evidence.text).toBe("Quiero correos");
    const up = parseSubmission({ email: "b@c.com" }, true);
    expect(up.ok && up.sub.mode).toBe("upsert");
  });
  it("campos extra: nunca montos, claves limpias, máximo 20", () => {
    const { fields, dropped } = cleanFields({ "Cómo nos conociste": "Instagram", amount: "10", precio_entrada: "20", total: "5", nota: "$10", pago: "x", ok: "1.000" });
    expect(fields).toEqual({ como_nos_conociste: "Instagram", ok: "1.000" });
    expect(dropped).toBe(5);
    const many = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`f${i}`, "v"]));
    expect(Object.keys(cleanFields(many).fields)).toHaveLength(20);
    expect(cleanFields({ feedback: "bien", coffee: "sí" }).fields).toEqual({ feedback: "bien", coffee: "sí" }); // palabras, no pedazos
    const big = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`campo_${i}`, "x".repeat(200)]));
    expect(JSON.stringify(cleanFields(big).fields).length).toBeLessThanOrEqual(3500); // cabe en el CHECK de la base (4000)
  });
});

describe("qué se cambia de un contacto que ya existe", () => {
  const base = { name: "Ana", phone: "+61411111111", country: "AU", timezone: "Australia/Sydney", user_id: null, fields: { ciudad: "Sydney" } };
  const sub = { name: "Ana María", phone: "+61422222222", country: "NZ", timezone: "Pacific/Auckland", fields: { ciudad: "Perth", partners_name: "Luz" } };
  it("upsert: reemplaza nombre, país, zona y campos; un teléfono distinto nunca se pisa", () => {
    expect(contactPatch(base, { ...sub, mode: "upsert" })).toEqual({ name: "Ana María", country: "NZ", timezone: "Pacific/Auckland", fields: { ciudad: "Perth", partners_name: "Luz" } });
  });
  it("solo llenar vacíos (check-in): no pisa nada que ya tenga", () => {
    expect(contactPatch(base, { ...sub, mode: "fill" })).toEqual({ fields: { ciudad: "Sydney", partners_name: "Luz" } });
    expect(contactPatch({ ...base, name: "", phone: null }, { ...sub, mode: "fill" })).toMatchObject({ name: "Ana María", phone: "+61422222222" });
  });
  it("con cuenta en la app: su nombre es el de su perfil (siempre solo vacíos)", () => {
    expect(contactPatch({ ...base, user_id: C1 }, { ...sub, mode: "upsert" })).not.toHaveProperty("name");
  });
});

describe("disparadores de conexiones", () => {
  it("'Llegó por una conexión web' y 'Confirmó su correo', con o sin conexión elegida", () => {
    const any = TriggerSchema.parse({ kind: "web_connection" });
    const one = TriggerSchema.parse({ kind: "web_connection", connectionId: C1 });
    const e = { kind: "web_connection", ref: `${C1}:20261125101010` };
    expect(matchesTrigger(any, e)).toBe(true);
    expect(matchesTrigger(one, e)).toBe(true);
    expect(matchesTrigger(one, { ...e, ref: `${C2}:20261125101010` })).toBe(false);
    expect(matchesTrigger(TriggerSchema.parse({ kind: "email_confirmed", connectionId: C1 }), { kind: "email_confirmed", ref: `${C1}:x` })).toBe(true);
    expect(matchesTrigger(one, { kind: "email_confirmed", ref: `${C1}:x` })).toBe(false);
  });
  it("el editor ofrece 'Llegó por una conexión web' y no el formulario viejo (salvo que ya lo use)", () => {
    expect(visibleTriggers(TRIGGER_KINDS)).toContain("web_connection");
    expect(visibleTriggers(TRIGGER_KINDS)).toContain("email_confirmed");
    expect(visibleTriggers(TRIGGER_KINDS)).not.toContain("web_form");
    expect(visibleTriggers(TRIGGER_KINDS, "web_form")).toContain("web_form");
  });
  it("una transaccional no se corta por darse de baja del marketing", () => {
    const rules = { onUnsubscribe: true, onCancel: true, goal: null };
    const t = TriggerSchema.parse({ kind: "web_connection" });
    const unsub = { kind: "unsubscribed", ref: "email:20261125" };
    expect(exitFor(rules, t, unsub)).toBe("unsubscribed");
    expect(exitFor(rules, t, unsub, true)).toBeNull();
  });
});

describe("transaccional y contacto de prueba", () => {
  it("sale sin consentimiento, pero nunca con rebote o queja ni al contacto de prueba", () => {
    expect(mayTransactional("ana@correo.com", null)).toEqual({ ok: true });
    expect(mayTransactional("ana@correo.com", "unsubscribe")).toEqual({ ok: true }); // baja de marketing: lo de su compra sí le llega
    expect(mayTransactional("ana@correo.com", "manual")).toEqual({ ok: true });
    expect(mayTransactional("ana@correo.com", "bounce")).toEqual({ ok: false, reason: "suppressed" });
    expect(mayTransactional("ana@correo.com", "complaint")).toEqual({ ok: false, reason: "suppressed" });
    expect(mayTransactional(testEmailFor("bootcamp-nov-2026"), null)).toEqual({ ok: false, reason: "test_contact" });
    expect(isConnectionTestEmail("prueba+x@revolucion360.test")).toBe(true);
    expect(isConnectionTestEmail("ana@revolucion360.test")).toBe(false);
  });
  it("el correo transaccional lleva remitente y datos legales, sin la baja de marketing", () => {
    const legal = { company: "Revolución del Dinero Pty Ltd", abn: "12 345 678 901", address: "1 George St, Sydney NSW 2000" };
    const common = { subject: "Tu entrada", preheader: "", locale: "es" as const, appUrl: "https://app.revoluciondeldinero.com", name: "Ana", legal, token: "a".repeat(64), fromLabel: "", blocks: [{ type: "text" as const, text: "Hola" }] };
    const t = renderMarketingEmail({ ...common, transactional: true });
    expect(t.html).toContain("12 345 678 901");
    expect(t.html).not.toContain("/api/crm/unsubscribe");
    expect(t.html).not.toContain("aceptaste noticias");
    expect(t.text).toContain("No es publicidad");
    const mk = renderMarketingEmail(common);
    expect(mk.html).toContain("/api/crm/unsubscribe");
  });
});

describe("panel", () => {
  it("la dirección sale del nombre y no choca", () => {
    expect(connectionSlug("Webinar enero 2027", [])).toBe("webinar-enero-2027");
    expect(connectionSlug("Webinar enero 2027", ["webinar-enero-2027"])).toBe("webinar-enero-2027-2");
    expect(connectionSlug("¡¡!!", [])).toBe("conexion");
    expect(connectionUrl("https://app.revoluciondeldinero.com/", "bootcamp")).toBe("https://app.revoluciondeldinero.com/api/crm/conexiones/bootcamp");
  });
  it("el código para pegar trae la dirección, la casilla desmarcada y Turnstile", () => {
    const t = { name: "Tu nombre", consent: "Quiero correos", button: "Inscribirme", siteKeyMissing: "TU_CLAVE" };
    const html = formSnippet("https://x/api/crm/conexiones/a", "0x4AAA", t);
    expect(html).toContain('action="https://x/api/crm/conexiones/a" method="POST"');
    expect(html).toContain('name="acepta_correos" value="true"');
    expect(html).not.toContain("checked");
    expect(html).toContain('class="cf-turnstile" data-sitekey="0x4AAA"');
    expect(formSnippet("u", null, t)).toContain('data-sitekey="TU_CLAVE"');
  });
  it("/admin/conexiones es de la sección CRM (solo el Dueño)", () => {
    expect(sectionOf("/admin/conexiones")).toBe("crm");
    expect(sectionOf("/admin/conexiones?c=1")).toBe("crm");
  });
});

describe("importar desde systeme.io", () => {
  const table = [
    ["Email", "First name", "Surname", "Phone number", "Tags", "Unsubscribed", "Created at"],
    ["ANA@correo.com", "Ana", "Morales", "+61412345678", "evento-septiembre-2026, Entrada VIP", "false", "2025-03-01T10:00:00Z"],
    ["pedro@correo.com", "Pedro", "", "", "", "true", ""],
    ["ana@correo.com", "Repetida", "", "", "", "", ""],
    ["sin-correo", "X", "", "", "", "", ""],
  ];
  it("adivina las columnas típicas", () => {
    expect(guessSystemeColumns(table[0])).toEqual({ email: 0, firstName: 1, surname: 2, phone: 3, tags: 4, unsubscribed: 5, createdAt: 6 });
  });
  it("filas: nombre completo, etiquetas, baja, fecha de alta; sin repetidos ni correos malos; sin consentimiento sin columna", () => {
    const r = mapSystemeRows(table.slice(1), guessSystemeColumns(table[0]));
    expect(r.invalid).toBe(1);
    expect(r.duplicates).toBe(1);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ email: "ana@correo.com", name: "Ana Morales", tags: ["evento-septiembre-2026", "Entrada VIP"], unsubscribed: false, consent: false, createdAt: "2025-03-01T10:00:00.000Z" });
    expect(r.rows[1]).toMatchObject({ email: "pedro@correo.com", unsubscribed: true });
  });
  it("la columna de baja con palabras ('unsubscribed', 'baja') o una fecha también cuenta", () => {
    const cols = { email: 0, unsubscribed: 1 };
    const r = mapSystemeRows([["a@x.co", "Unsubscribed"], ["b@x.co", "baja"], ["c@x.co", "2025-01-02 10:00"], ["d@x.co", "subscribed"], ["e@x.co", ""]], cols);
    expect(r.rows.map((x) => x.unsubscribed)).toEqual([true, true, true, false, false]);
  });
});

describe("migración 038: solo agrega y solo el Dueño", () => {
  const raw = readFileSync(path.join(import.meta.dirname, "..", "supabase", "migrations", "20261125000038_conexiones.sql"), "utf8");
  const sql = raw.replace(/--[^\n]*/g, "");
  it("pasa la revisión de migraciones (no borra, no vacía, no renombra)", () => {
    expect(findDangers(raw)).toEqual([]);
  });
  it("cada función nueva tiene su revoke y cada revoke/grant nombra una firma que existe", () => {
    const created = new Set([...sql.matchAll(/create or replace function public\.(crm_\w+)\(([^)]*)\)/g)].map(([, name, args]) =>
      `${name}(${args.split(",").map((a) => a.trim()).filter(Boolean).map((a) => a.split(/\s+/)[1]).join(", ")})`));
    const named = [...sql.matchAll(/(?:revoke|grant) execute on function ([^;]+?) (?:from|to) /g)].flatMap(([, list]) => list.split(/,\s*(?=public\.)/).map((x) => x.trim().replace(/^public\./, "")));
    expect(named.filter((sig) => !created.has(sig))).toEqual([]);
    const revoked = new Set([...sql.matchAll(/revoke execute on function public\.(crm_\w+)\(/g)].map(([, n]) => n));
    expect([...created].map((s) => s.split("(")[0]).filter((n) => !revoked.has(n))).toEqual([]);
    expect(sql).toMatch(/revoke execute on function public\.crm_connection_reject\(uuid, text, text\) from public, anon, authenticated;/);
  });
  it("RLS solo Dueño y nada para anon", () => {
    for (const t of ["crm_connections", "crm_connection_log", "crm_pending_confirmations"]) {
      expect(sql).toMatch(new RegExp(`alter table public\\.${t} enable row level security`));
      expect(sql).toMatch(new RegExp(`on public\\.${t} for (all|select) to authenticated using \\(\\(select public\\.is_admin_owner\\(\\)\\)\\)`));
    }
    expect(sql).toMatch(/revoke all on table public\.crm_connections, public\.crm_connection_log, public\.crm_pending_confirmations from anon;/);
  });
  it("columnas nuevas con valor por defecto (no rompen filas existentes)", () => {
    expect(sql).toMatch(/alter table public\.crm_contacts add column if not exists fields jsonb not null default/);
    expect(sql).toMatch(/alter table public\.crm_automations add column if not exists transactional boolean not null default false/);
    expect(sql).toMatch(/alter table public\.crm_messages add column if not exists transactional boolean not null default false/);
  });
  it("la confirmación guarda el hash del token, nunca el token", () => {
    expect(sql).toMatch(/token_hash text not null unique/);
    expect(sql).not.toMatch(/\btoken text\b/);
  });
});
