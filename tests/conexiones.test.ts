// Conexiones web del CRM (src/lib/crm/connections.ts) y automatizaciones transaccionales. Sin base de datos ni red.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  cleanFields, ConnectionInput, connectionSlug, connectionUrl, contactPatch, exitFor, formSnippet, guessSystemeColumns, hostAllowed, isConnectionTestEmail, isMoneyKey,
  hasNewsletter, isPublicSuffix, looksLikeMoney, mapSystemeRows, matchesTrigger, newsletterEvidence, SystemeRowSchema, systemeConsentAction, systemeDate, systemePhone, systemeSummary, systemeTag, mayTransactional, normalizeHost, originOk, parseSubmission, renderMarketingEmail, requestOriginAllowed, testEmailFor, thanksUrlOk, TriggerSchema, turnstileOk,
} from "@/lib/crm";
import { sectionOf } from "@/app/admin/actividad/roles";
import { visibleTriggers } from "@/app/admin/automatizaciones/lib";
import { TRIGGER_KINDS } from "@/lib/crm/schema";
import { parseCsv } from "@/lib/engine/csv";
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
    const { fields, dropped } = cleanFields({ "Cómo nos conociste": "Instagram", amount: "10", precio_entrada: "20", total: "5", nota: "$10", pago: "x", ok: "1.000", talla: "M" });
    expect(fields).toEqual({ como_nos_conociste: "Instagram", talla: "M" });
    expect(dropped).toBe(6); // "1.000" tiene forma de monto (separador de miles)
    const many = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`f${i}`, "v"]));
    expect(Object.keys(cleanFields(many).fields)).toHaveLength(20);
    const big = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`campo_${i}`, "x".repeat(200)]));
    expect(JSON.stringify(cleanFields(big).fields).length).toBeLessThanOrEqual(3500); // cabe en el CHECK de la base (4000)
  });
});

describe("campos extra: nunca montos (revisión de seguridad)", () => {
  it("claves que CONTIENEN una palabra de dinero, también camelCase o sin separadores (es/en)", () => {
    for (const k of ["precio_entrada", "precioEntrada", "precioentrada", "ticketPrice", "ticketprice", "montoTotal", "valorAUD", "entryFee", "salarioMensual",
      "my-income", "TOTAL", "Precio de la entrada", "deudaActual", "usd", "pagoInicial", "paymentMethod", "presupuesto2026", "dólares"]) {
      expect(isMoneyKey(k), k).toBe(true);
    }
    for (const k of ["ciudad", "partners_name", "partners_phone", "como_nos_conociste", "talla", "empresa", "edad"]) expect(isMoneyKey(k), k).toBe(false);
    // Costo aceptado (docs/CRM.md): claves inocentes que contienen una palabra de dinero también se pierden.
    expect(isMoneyKey("feedback")).toBe(true);
    expect(isMoneyKey("coffee")).toBe(true);
    expect(cleanFields({ feedback: "bien" }).fields).toEqual({});
  });
  it("valores: número puro de 3+ cifras, con separadores de miles o con moneda", () => {
    for (const v of ["150", "2500", "-2500", "1500.50", "1500,5", "1.500", "1,500,000", "2 500", "1'500", "$10", "€3", "20 AUD", "USD 5", "10 dólares", "5 pesos", "100usd"]) {
      expect(looksLikeMoney(v), v).toBe(true);
    }
    for (const v of ["12", "7", "M", "Sydney", "+61412345678", "+61 412 345 678", "0412 345 678", "2026-09-12", "Grupo 3", "dos"]) expect(looksLikeMoney(v), v).toBe(false);
  });
  it("un teléfono o código postal en su clave se guarda aunque sea un número largo", () => {
    expect(cleanFields({ partners_phone: "0412345678", telefono_casa: "0298765432", postcode: "2000", whatsapp: "+61 400 000 000" }).fields)
      .toEqual({ partners_phone: "0412345678", telefono_casa: "0298765432", postcode: "2000", whatsapp: "+61 400 000 000" });
    // ...pero nunca con moneda, y en otra clave un número largo cae
    expect(cleanFields({ partners_phone: "$100", codigo: "123456" }).fields).toEqual({});
    expect(cleanFields({ referido: "+61412345678" }).fields).toEqual({ referido: "+61412345678" });
  });
});

describe("formularios del navegador: SMS solo con la clave del servidor", () => {
  it("acepta_sms desde el navegador se ignora; el correo sí", () => {
    const r = parseSubmission({ correo: "a@b.com", telefono: "+61412345678", acepta_correos: "on", acepta_sms: "on" }, false);
    expect(r.ok && r.sub.consentEmail).toBe(true);
    expect(r.ok && r.sub.consentSms).toBe(false);
    const srv = parseSubmission({ correo: "a@b.com", telefono: "+61412345678", acepta_sms: "true" }, true);
    expect(srv.ok && srv.sub.consentSms).toBe(true);
    const nested = parseSubmission({ email: "a@b.com", consent: { sms: true } }, true);
    expect(nested.ok && nested.sub.consentSms).toBe(true);
  });
  it("un país que no es código queda como campo extra, pero nunca un monto", () => {
    const a = parseSubmission({ correo: "a@b.com", pais: "Australia" }, false);
    expect(a.ok && a.sub.fields).toEqual({ pais: "Australia" });
    const m = parseSubmission({ correo: "a@b.com", pais: "2500 AUD" }, false);
    expect(m.ok && m.sub.fields).toEqual({});
  });
  it("los nombres de campo se buscan con Object.hasOwn (nunca 'constructor' ni '__proto__')", () => {
    const r = parseSubmission(JSON.parse('{"email":"a@b.com","constructor":"x","toString":"y","__proto__":"z","valueOf":"w"}') as Record<string, unknown>, false);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sub.name).toBe("");
    expect(r.sub.fields).toEqual({ constructor: "x", tostring: "y" }); // campos extra comunes (valueOf contiene "value": cae)
  });
});

describe("páginas permitidas: nunca un comodín sobre un sufijo público", () => {
  it("hostings gratis y segundos niveles de país", () => {
    for (const h of ["vercel.app", "github.io", "netlify.app", "pages.dev", "co.uk", "com.au", "com.co", "gov.co", "com"]) expect(isPublicSuffix(h), h).toBe(true);
    for (const h of ["revoluciondeldinero.com", "mi-sitio.vercel.app", "webinar.com", "x.co.uk", "info.com"]) expect(isPublicSuffix(h), h).toBe(false);
  });
  it("se rechaza al escribirlo y al guardarlo; el dominio exacto sí se acepta", () => {
    for (const h of ["*.vercel.app", "*.github.io", "*.co.uk", "*.com.au", "https://*.netlify.app/"]) expect(normalizeHost(h), h).toBeNull();
    expect(normalizeHost("mi-sitio.vercel.app")).toBe("mi-sitio.vercel.app");
    expect(normalizeHost("*.mi-sitio.vercel.app")).toBe("*.mi-sitio.vercel.app");
    expect(normalizeHost("*.revoluciondeldinero.co.uk")).toBe("*.revoluciondeldinero.co.uk");
    expect(originOk("*.vercel.app")).toBe(false);
    expect(ConnectionInput.safeParse({ name: "X", origins: ["*.vercel.app"] }).success).toBe(false);
    expect(ConnectionInput.safeParse({ name: "X", origins: ["*.revoluciondeldinero.com", "mi-sitio.vercel.app"] }).success).toBe(true);
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
    expect(r.rows[0]).toMatchObject({ email: "ana@correo.com", name: "Ana Morales", tags: ["evento-septiembre-2026", "entrada-vip"], unsubscribed: false, consent: false, createdAt: "2025-03-01T10:00:00.000Z" });
    expect(r.rows[1]).toMatchObject({ email: "pedro@correo.com", unsubscribed: true });
  });
  it("la columna de baja con palabras ('unsubscribed', 'baja') o una fecha también cuenta", () => {
    const cols = { email: 0, unsubscribed: 1 };
    const r = mapSystemeRows([["a@x.co", "Unsubscribed"], ["b@x.co", "baja"], ["c@x.co", "2025-01-02 10:00"], ["d@x.co", "subscribed"], ["e@x.co", ""]], cols);
    expect(r.rows.map((x) => x.unsubscribed)).toEqual([true, true, true, false, false]);
  });
  it("archivo de bajas: todas las direcciones entran de baja aunque no haya columna de baja", () => {
    const r = mapSystemeRows([["a@x.co"], ["b@x.co"]], { email: 0 }, { allUnsubscribed: true });
    expect(r.rows.every((x) => x.unsubscribed)).toBe(true);
    expect(systemeSummary(r.rows, null, null)).toMatchObject({ unsubscribed: 2, newsletter: 0 });
  });
});

describe("importar desde systeme.io: formato real del export", () => {
  // CSV INVENTADO con los encabezados exactos del export de systeme.io (ningún dato real).
  const CSV = [
    `\uFEFF"Email","First name","Last name","Street address","Street number","Neighborhood","Postal code","City","State/Province","Country","Phone number","Company name","Tax number","partner's phone","partners name","partner's email","Tag","Date Registered"`,
    `"Lucia.Prueba@ejemplo.test","  Lucía ","  Prueba  ","","","","2000","Sydney","NSW","","61400111222","","","0411222333","  Mateo   Ejemplo ","mateo@ejemplo.test","newsletter, Entrada General $10 AUD","2026-05-02 09:44:46 (UTC+10)"`,
    `"carlos@ejemplo.test","Carlos","Demo","","","","","","","CO","573001112233","","","+61 422 333 444","Sofía","","Entrada VIP $20 AUD, evento-septiembre-2026","2026-06-10 18:05:00 (UTC+10)"`,
    `"ana@ejemplo.test","Ana","","","","","","","","AU","6140011122","","","61433444555","","","Taller $50 AUD","2026-07-01 08:00:00 (UTC+10)"`,
    `"lucia.prueba@ejemplo.test","Repetida","","","","","","","","","","","","","","","newsletter",""`,
    `"no-es-correo","X","","","","","","","","","","","","","","","",""`,
  ].join("\r\n");
  const table = parseCsv(CSV);
  const cols = guessSystemeColumns(table[0]);
  const r = mapSystemeRows(table.slice(1), cols);

  it("reconoce los encabezados reales (con comillas, apóstrofos y BOM)", () => {
    expect(cols).toEqual({ email: 0, firstName: 1, surname: 2, country: 9, phone: 10, partnerPhone: 13, partnerName: 14, partnerEmail: 15, tags: 16, createdAt: 17 });
  });
  it("teléfono sin + con código → E.164 y país deducido del prefijo; nombres recortados", () => {
    expect(r.invalid).toBe(1);
    expect(r.duplicates).toBe(1);
    expect(r.rows).toHaveLength(3);
    expect(r.rows[0]).toMatchObject({ email: "lucia.prueba@ejemplo.test", name: "Lucía Prueba", phone: "+61400111222", country: "AU" });
    expect(r.rows[1]).toMatchObject({ phone: "+573001112233", country: "CO" });
  });
  it("teléfono inválido (10 cifras con 61) → sin teléfono y contado; el país de la columna se respeta", () => {
    expect(r.rows[2]).toMatchObject({ email: "ana@ejemplo.test", phone: "", country: "AU" });
    expect(r.invalidPhones).toBe(1);
    expect(r.invalidPhoneSamples).toEqual([{ email: "ana@ejemplo.test", raw: "6140011122" }]);
  });
  it("acompañante = campos extra del contacto (E.164 asumiendo AU), nunca una fila aparte", () => {
    expect(r.rows[0].fields).toEqual({ partners_phone: "+61411222333", partners_name: "Mateo Ejemplo", partners_email: "mateo@ejemplo.test" });
    expect(r.rows[1].fields).toEqual({ partners_phone: "+61422333444", partners_name: "Sofía" });
    expect(r.rows[2].fields).toEqual({ partners_phone: "+61433444555" });
    expect(r.rows.map((x) => x.email)).not.toContain("mateo@ejemplo.test");
    expect(r.invalidPartnerPhones).toBe(0);
  });
  it("etiquetas: entradas sin precio, newsletter se conserva, precio quitado en otras (y avisado)", () => {
    expect(r.rows[0].tags).toEqual(["newsletter", "entrada-general"]);
    expect(r.rows[1].tags).toEqual(["entrada-vip", "evento-septiembre-2026"]);
    expect(r.rows[2].tags).toEqual(["Taller"]);
    expect(r.renamedTags).toEqual([
      { from: "Entrada General $10 AUD", to: "entrada-general" },
      { from: "Entrada VIP $20 AUD", to: "entrada-vip" },
      { from: "Taller $50 AUD", to: "Taller" },
    ]);
    for (const row of r.rows) for (const t of row.tags) expect(looksLikeMoney(t) || /[$€£]/.test(t) || /\bAUD\b/i.test(t)).toBe(false);
  });
  it("fecha de registro con (UTC+10) → ISO en UTC", () => {
    expect(r.rows[0].createdAt).toBe("2026-05-01T23:44:46.000Z");
    expect(systemeDate("2026-05-02 09:44:46 (UTC-03:30)")).toBe("2026-05-02T13:14:46.000Z");
    expect(systemeDate("2026-05-02 09:44:46")).toBe("2026-05-02T09:44:46.000Z");
    expect(systemeDate("ayer")).toBeNull();
  });
  it("vista previa: total, nuevos/actualizados, consentimiento por newsletter y etiquetas que se crearán", () => {
    const s = systemeSummary(r.rows, new Set(["carlos@ejemplo.test"]), ["Evento-Septiembre-2026", "newsletter"]);
    expect(s).toMatchObject({ total: 3, created: 2, updated: 1, newsletter: 1, unsubscribed: 0 });
    expect(s.newTags).toEqual(["entrada-general", "entrada-vip", "Taller"]);
    expect(systemeSummary(r.rows, null, null)).toMatchObject({ created: null, updated: null, newTags: null });
  });
  it("newsletter da consentimiento (con constancia y fecha); de baja, no", () => {
    expect(hasNewsletter(r.rows[0].tags)).toBe(true);
    expect(hasNewsletter(r.rows[1].tags)).toBe(false);
    expect(newsletterEvidence("2026-05-01T23:44:46.000Z")).toEqual({ text: "Suscrito al newsletter en systeme.io · fecha de registro 2026-05-01T23:44:46.000Z", form: "import:systeme" });
    const unsub = mapSystemeRows(table.slice(1, 2), cols, { allUnsubscribed: true });
    expect(systemeSummary(unsub.rows, null, null).newsletter).toBe(0);
  });
  it("idempotente: mapear el mismo archivo dos veces da lo mismo, y lo ya mapeado pasa igual por el servidor", () => {
    expect(mapSystemeRows(parseCsv(CSV).slice(1), cols)).toEqual(r);
    for (const row of r.rows) {
      const p = SystemeRowSchema.parse(row);
      expect(p).toMatchObject({ email: row.email, name: row.name, phone: row.phone, country: row.country, tags: row.tags, fields: row.fields });
      expect(SystemeRowSchema.parse(p)).toEqual(p);
    }
  });
  it("el servidor no confía en el navegador: quita precios, rechaza teléfonos sin E.164 y campos que no son del acompañante", () => {
    const p = SystemeRowSchema.parse({ email: "x@ejemplo.test", tags: ["Entrada VIP $20 AUD", "Promo $99"], fields: { partners_phone: "0412345678", precio: "10", partners_name: "Eva" } });
    expect(p.tags).toEqual(["entrada-vip", "Promo"]);
    expect(p.fields).toEqual({ partners_phone: "0412345678", partners_name: "Eva" });
    expect(SystemeRowSchema.safeParse({ email: "x@ejemplo.test", phone: "61400111222" }).success).toBe(false);
  });
  it("el filtro de montos no bloquea teléfonos de acompañante", () => {
    expect(cleanFields({ partners_phone: "0412345678" }).fields).toEqual({ partners_phone: "0412345678" });
    expect(cleanFields({ partners_phone: "61435545230" }).fields).toEqual({ partners_phone: "61435545230" });
  });
});

describe("systemePhone y systemeTag", () => {
  it("formatos mezclados → E.164", () => {
    expect(systemePhone("61479103452")).toEqual({ phone: "+61479103452", country: "AU" });
    expect(systemePhone("0412345678")).toEqual({ phone: "+61412345678", country: "AU" });
    expect(systemePhone("+61 425 432 165")).toEqual({ phone: "+61425432165", country: "AU" });
    expect(systemePhone("61435545230")).toEqual({ phone: "+61435545230", country: "AU" });
    expect(systemePhone("3001112233", "CO")).toEqual({ phone: "+573001112233", country: "CO" });
    expect(systemePhone("593991234567")).toEqual({ phone: "+593991234567", country: "EC" });
    expect(systemePhone("6147910345")).toBeNull();
    expect(systemePhone("+49 30 1234567")).toEqual({ phone: "+49301234567", country: null }); // otro país con +: tal cual
    expect(systemePhone("49301234567")).toBeNull(); // sin + y con código desconocido: no se adivina
    expect(systemePhone("abc")).toBeNull();
    expect(systemePhone("")).toBeNull();
  });
  it("etiquetas sin montos", () => {
    expect(systemeTag("Entrada General $10 AUD")).toBe("entrada-general");
    expect(systemeTag("entrada vip $20 aud")).toBe("entrada-vip");
    expect(systemeTag("Bootcamp 150 USD")).toBe("Bootcamp");
    expect(systemeTag("Mentoría (AUD 300)")).toBe("Mentoría");
    expect(systemeTag("$10")).toBeNull();
    expect(systemeTag("evento-septiembre-2026")).toBe("evento-septiembre-2026");
    expect(systemeTag("newsletter")).toBe("newsletter");
    expect(systemeTag("Webinars 2026")).toBe("Webinars 2026");
    expect(systemeTag("Open 2026")).toBe("Open 2026");
  });
  it("consentimiento al importar: newsletter sí, re-importar no cambia nada, nunca levanta una baja", () => {
    const nl = { unsubscribed: false, tags: ["newsletter"], consent: false };
    const none = { unsubscribed: false, tags: ["entrada-vip"], consent: false };
    const off = { email_consent: false, email_unsubscribed_at: "2026-01-01T00:00:00Z" };
    const on = { email_consent: true, email_unsubscribed_at: null };
    expect(systemeConsentAction(nl, null, false)).toBe("on_newsletter"); // contacto nuevo
    expect(systemeConsentAction(nl, on, false)).toBe("already_on"); // segunda importación: no se llama otra vez
    expect(systemeConsentAction(nl, off, false)).toBe("skip_unsubscribed"); // de baja: nunca se levanta
    expect(systemeConsentAction(none, null, false)).toBe("none"); // sin newsletter: sin marketing
    expect(systemeConsentAction({ ...none, consent: true }, null, false)).toBe("none"); // columna sin constancia
    expect(systemeConsentAction({ ...none, consent: true }, null, true)).toBe("on_explicit");
    expect(systemeConsentAction({ ...nl, unsubscribed: true }, null, false)).toBe("off"); // la baja gana
    expect(systemeConsentAction({ ...nl, unsubscribed: true }, on, false)).toBe("off");
    expect(systemeConsentAction({ ...none, unsubscribed: true }, off, false)).toBe("already_off"); // archivo de bajas otra vez
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
  it("el slug de una conexión no cambia nunca (disparador)", () => {
    expect(sql).toMatch(/if new\.slug is distinct from old\.slug then raise exception 'slug_fixed'/);
    expect(sql).toMatch(/create trigger crm_connection_slug_fixed before update on public\.crm_connections/);
  });
  it("'Lo que va llegando' distingue la confirmación frenada por el límite", () => {
    expect(sql).toMatch(/'pending', 'throttled', 'confirmed'/);
    expect(sql).toMatch(/'rejected_rate'/);
  });
  it("los CHECK nuevos son idempotentes (no fallan si la migración se corre otra vez)", () => {
    expect(sql).toMatch(/if not exists \(select 1 from pg_constraint where conname = 'crm_automations_transactional_trigger'\)/);
    expect(sql).toMatch(/if not exists \(select 1 from pg_constraint where conname = 'crm_messages_transactional_source'\)/);
  });
  it("cada create policy lleva antes su drop policy if exists", () => {
    for (const [, name, table] of sql.matchAll(/create policy (\w+) on (public\.\w+)/g)) expect(sql).toContain(`drop policy if exists ${name} on ${table};`);
  });
});
