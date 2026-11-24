// Cálculos propios de Mi perfil, Notificaciones, Ayuda, Legal y la exportación de datos.
import { describe, expect, it } from "vitest";
import { backupCodesText, confirmsWord, isPhone, isValidTimezone, mergeNotifyPrefs, mergeTerms, readNotifyPrefs, tabFromHash, timezoneOptions, visibleTabs } from "@/app/(app)/perfil/lib";
import { asKind, groupOf, matches, safeHref, sortNotifs } from "@/app/(app)/notificaciones/lib";
import { appVersion, browserLabel, buildTech, searchFaqs, subjectOf, ticketCode } from "@/app/(app)/ayuda/lib";
import { centsToDecimal, csvCell, EXPORT_TABLES, transactionsCsv } from "@/app/api/export/lib";
import { mergeLegal } from "@/app/legal/lib";

describe("perfil", () => {
  it("valida zonas horarias IANA reales", () => {
    for (const tz of ["Australia/Sydney", "America/Bogota", "America/Argentina/Buenos_Aires", "UTC", "Europe/Madrid"]) expect(isValidTimezone(tz)).toBe(true);
    for (const tz of ["", "Sydney", "Mars/Olympus", "Australia/Sydney; drop table", "../etc/passwd", 42, null]) expect(isValidTimezone(tz)).toBe(false);
  });

  it("la lista de zonas siempre incluye UTC y la del usuario", () => {
    const list = timezoneOptions("Australia/Perth");
    expect(list).toContain("UTC");
    expect(list).toContain("Australia/Perth");
    expect([...list].sort()).toEqual(list);
  });

  it("las anclas abren su pestaña; sin logros caen en la primera", () => {
    expect(tabFromHash("#seguridad", true)).toBe("seguridad");
    expect(tabFromHash("#privacidad", true)).toBe("privacidad");
    expect(tabFromHash("#racha", true)).toBe("logros");
    expect(tabFromHash("#insignias", true)).toBe("logros");
    expect(tabFromHash("", true)).toBe("logros");
    expect(tabFromHash("#racha", false)).toBe("datos");
    expect(tabFromHash("#cualquiera", false)).toBe("datos");
    expect(visibleTabs(false)).not.toContain("logros");
  });

  it("renombrar términos: vacío vuelve al del país y no toca otras claves", () => {
    const old = { retirement: "Pensión", freelance: "Monotributo", otra: "x" };
    expect(mergeTerms(old, { retirement: "  Mi   super ", freelance: "" })).toEqual({ retirement: "Mi super", otra: "x" });
    expect(mergeTerms(old, {})).toEqual(old);
    expect(mergeTerms({}, { company: "a".repeat(60) }).company).toHaveLength(40);
  });

  it("preferencias de notificaciones: valores por omisión y mezcla sin borrar otras claves", () => {
    const base = readNotifyPrefs({});
    expect(base).toEqual({ notify: { close: true, payments: true, achievements: true, academy: true, news: false }, closeDay: "last", channel: "both" });
    const merged = mergeNotifyPrefs({ theme: "dark", notify: { close: true, legacy: 1 }, channel: "nope" }, { notify: { ...base.notify, news: true }, closeDay: "first" });
    expect(merged.theme).toBe("dark");
    expect(merged.notify).toMatchObject({ legacy: 1, news: true, close: true });
    expect(merged.close_day).toBe("first");
    expect(merged.channel).toBe("both");
    expect(readNotifyPrefs(merged).notify.news).toBe(true);
  });

  it("borrar la cuenta exige escribir la palabra", () => {
    expect(confirmsWord(" borrar ", "BORRAR")).toBe(true);
    expect(confirmsWord("BÓRRAR", "BORRAR")).toBe(true);
    expect(confirmsWord("BORRA", "BORRAR")).toBe(false);
    expect(confirmsWord("", "")).toBe(false);
  });

  it("teléfono opcional: números, espacios y + al inicio", () => {
    for (const p of ["+61 412 345 678", "0412345678", "+57 (300) 123-4567"]) expect(isPhone(p)).toBe(true);
    for (const p of ["abc", "123", "+61 4x2", "12+34", "1".repeat(25)]) expect(isPhone(p)).toBe(false);
  });

  it("archivo de códigos de respaldo", () => {
    expect(backupCodesText("Códigos", ["AAAAA-BBBBB", "CCCCC-DDDDD"])).toBe("Códigos\n\nAAAAA-BBBBB\nCCCCC-DDDDD\n");
  });
});

describe("notificaciones", () => {
  it("agrupa por día en la zona del usuario: hoy, esta semana, antes", () => {
    expect(groupOf("2026-11-24", "2026-11-24")).toBe("today");
    expect(groupOf("2026-11-22", "2026-11-24")).toBe("week");
    expect(groupOf("2026-11-18", "2026-11-24")).toBe("week");
    expect(groupOf("2026-11-17", "2026-11-24")).toBe("older");
  });

  it("no leídas primero y luego de la más nueva a la más vieja", () => {
    const list = [
      { id: "a", kind: "cierre" as const, unread: false, createdAt: "2026-11-24T09:00:00Z" },
      { id: "b", kind: "logro" as const, unread: true, createdAt: "2026-11-20T09:00:00Z" },
      { id: "c", kind: "pago" as const, unread: true, createdAt: "2026-11-23T09:00:00Z" },
    ];
    expect(sortNotifs(list).map((n) => n.id)).toEqual(["c", "b", "a"]);
    expect(list.filter((n) => matches(n, "unread")).map((n) => n.id)).toEqual(["b", "c"]);
    expect(list.filter((n) => matches(n, "pago")).map((n) => n.id)).toEqual(["c"]);
  });

  it("solo enlaces internos y tipos conocidos", () => {
    expect(safeHref("/perfil#insignias")).toBe("/perfil#insignias");
    expect(safeHref("")).toBeNull();
    expect(safeHref("https://malo.com")).toBeNull();
    expect(safeHref("//malo.com")).toBeNull();
    expect(asKind("logro")).toBe("logro");
    expect(asKind("otra")).toBe("sistema");
  });
});

describe("ayuda", () => {
  it("los datos técnicos pasan por lista blanca: nunca montos ni claves desconocidas", () => {
    const tech = buildTech({
      browser: "Chrome 131 · macOS", screen: "1440×900", language: "es-CO", appLanguage: "es", plan: "pro", country: "AU", version: "abc1234",
      balance: "$5,000", amount_cents: 133000, transactions: [{ amount: -95 }], email: "a@b.com",
    });
    expect(tech).toEqual({ browser: "Chrome 131 · macOS", screen: "1440×900", language: "es-CO", appLanguage: "es", plan: "pro", country: "AU", version: "abc1234" });
    expect(JSON.stringify(tech)).not.toMatch(/\$|5,000|133000|-95|@/);
  });

  it("descarta valores con forma rara aunque la clave sea válida", () => {
    expect(buildTech({ screen: "$1,200", plan: "vip", country: "Australia", language: "es CO", browser: "x".repeat(100), version: "1.0 <script>" })).toEqual({});
  });

  it("navegador legible a partir del user agent", () => {
    expect(browserLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")).toBe("Chrome 131 · macOS");
    expect(browserLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1")).toBe("Safari 17 · iOS");
    expect(browserLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 Edg/131.0")).toBe("Edge 131 · Windows");
  });

  it("versión, asunto y código del caso", () => {
    expect(appVersion(undefined)).toBe("local");
    expect(appVersion("0123456789abcdef")).toBe("0123456");
    expect(subjectOf("  No me cuadra   el saldo\nDetalle largo")).toBe("No me cuadra el saldo");
    expect(subjectOf("a".repeat(100))).toHaveLength(80);
    expect(ticketCode("a1b2c3d4-0000-0000-0000-000000000000")).toBe("#A1B2C3");
  });

  it("buscador sin importar tildes y por tema", () => {
    const faqs = [
      { topic: "seguridad", question: "Perdí mi celular", answer: "Usa un código de respaldo." },
      { topic: "movimientos", question: "Importé el CSV", answer: "Duplicados fuera." },
    ];
    expect(searchFaqs(faqs, "perdi", "all")).toHaveLength(1);
    expect(searchFaqs(faqs, "CODIGO respaldo", "all")).toHaveLength(1);
    expect(searchFaqs(faqs, "", "movimientos").map((f) => f.topic)).toEqual(["movimientos"]);
    expect(searchFaqs(faqs, "csv", "seguridad")).toHaveLength(0);
  });
});

describe("exportar mis datos", () => {
  it("centavos a decimales exactos, sin flotantes", () => {
    expect(centsToDecimal(133000)).toBe("1330.00");
    expect(centsToDecimal(-9_995)).toBe("-99.95");
    expect(centsToDecimal(5)).toBe("0.05");
    expect(centsToDecimal(0)).toBe("0.00");
    expect(centsToDecimal(900_719_925_474_099)).toBe("9007199254740.99");
  });

  it("celdas CSV con comillas y sin fórmulas", () => {
    expect(csvCell("RENT, PAYMENT")).toBe('"RENT, PAYMENT"');
    expect(csvCell('Dijo "hola"')).toBe('"Dijo ""hola"""');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("-133.00", false)).toBe("-133.00");
    expect(csvCell(null)).toBe("");
  });

  it("CSV de movimientos: sin borrados, con nombres de categoría y cuenta", () => {
    const csv = transactionsCsv([
      { date: "2026-11-03", description: "RENT PAYMENT", amount_cents: -133_000, kind: "normal", status: "ok", note: null, account_id: "a1", category_id: "c1", is_split: false, deleted_at: null },
      { date: "2026-11-04", description: "Borrado", amount_cents: -100, kind: "normal", status: "ok", note: null, account_id: "a1", category_id: null, is_split: false, deleted_at: "2026-11-05T00:00:00Z" },
    ], new Map([["c1", "Hogar y básicos"]]), new Map([["a1", "Ubank"]]));
    const lines = csv.replace("﻿", "").trim().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe("2026-11-03,RENT PAYMENT,-1330.00,Hogar y básicos,Ubank,normal,ok,");
  });

  it("cubre las tablas financieras principales y nunca las secretas", () => {
    const names = EXPORT_TABLES.map(([t]) => t) as string[];
    for (const t of ["transactions", "plan_lines", "plan_cells", "accounts", "debts", "goals", "investments", "categories", "month_closures"]) expect(names).toContain(t);
    for (const t of ["mfa_backup_codes", "mfa_attempts", "push_subscriptions", "admin_notes", "entitlements"]) expect(names).not.toContain(t);
  });
});

describe("legal", () => {
  it("usa lo que escribió el admin y marcadores para lo vacío", () => {
    expect(mergeLegal({ company: "Revolución Pty Ltd", abn: " ", contact: "hola@x.com" })).toMatchObject({ company: "Revolución Pty Ltd", abn: "[ABN]", contact: "hola@x.com", address: "[DIRECCIÓN]", version: "0.1" });
    expect(mergeLegal(null).company).toBe("[RAZÓN SOCIAL]");
  });
});
