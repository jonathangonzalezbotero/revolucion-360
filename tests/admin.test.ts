import { describe, expect, it } from "vitest";
import {
  actionGroupFilter, checkCode, checkMaxUses, checkNote, codeDuration, csvCell, endOfDay, expiryFrom, isUuid, listHref,
  isEmail, noteHasMoney, pageCount, pageRange, parseActionGroup, parseCountry, parseEmails, parseFilter, parsePage, parseRole, parseSearch, pct, splitSearch, userQuery,
} from "@/app/admin/_shared/lib";
import { V2_FILTER, parsePlanFilter, planKey, planQuery, PLAN_FILTERS } from "@/app/admin/usuarios/lib";

describe("vencimiento de un acceso", () => {
  const today = "2026-11-24";
  it("de por vida no vence", () => expect(expiryFrom("vida", {}, today)).toEqual({ ok: true, until: null }));
  it("por meses suma desde hoy", () => expect(expiryFrom("meses", { months: "12" }, today)).toEqual({ ok: true, until: "2027-11-24" }));
  it("fin de mes no se desborda", () => expect(expiryFrom("meses", { months: 3 }, "2026-11-30")).toEqual({ ok: true, until: "2027-02-28" }));
  it("extender suma desde el vencimiento actual si aún no vence", () => expect(expiryFrom("meses", { months: 3 }, today, "2027-03-01")).toEqual({ ok: true, until: "2027-06-01" }));
  it("extender un acceso vencido suma desde hoy", () => expect(expiryFrom("meses", { months: 3 }, today, "2026-01-10")).toEqual({ ok: true, until: "2027-02-24" }));
  it("meses inválidos", () => {
    expect(expiryFrom("meses", { months: "" }, today).ok).toBe(false);
    expect(expiryFrom("meses", { months: "0" }, today).ok).toBe(false);
    expect(expiryFrom("meses", { months: "2.5" }, today).ok).toBe(false);
    expect(expiryFrom("meses", { months: "121" }, today).ok).toBe(false);
  });
  it("hasta una fecha futura", () => expect(expiryFrom("fecha", { until: "2027-03-01" }, today)).toEqual({ ok: true, until: "2027-03-01" }));
  it("rechaza fechas pasadas, de hoy o mal escritas", () => {
    expect(expiryFrom("fecha", { until: "2026-11-24" }, today)).toEqual({ ok: false, error: "past" });
    expect(expiryFrom("fecha", { until: "2026-02-30" }, today)).toEqual({ ok: false, error: "date" });
    expect(expiryFrom("fecha", { until: "" }, today)).toEqual({ ok: false, error: "date" });
  });
  it("se guarda al final del día", () => {
    expect(endOfDay("2027-03-01")).toBe("2027-03-01T23:59:59Z");
    expect(endOfDay(null)).toBeNull();
  });
});

describe("notas internas sin montos", () => {
  it.each(["Pagó $300 de más", "debe $ 1200", "le faltan 300$", "saldo 1.234,56", "gasta 99.90 al mes", "tiene 2,500,000 en deudas", "AUD 300 en la tarjeta", "unos 300 USD"])("rechaza «%s»", (t) => {
    expect(noteHasMoney(t)).toBe(true);
    expect(checkNote(t)).toEqual({ ok: false, error: "money" });
  });
  it.each(["Alumna de la cohorte de octubre", "Pidió ayuda con el CSV el 3 de noviembre", "Tiene 2 cuentas y 1 meta", "Llamar después de las 5"])("acepta «%s»", (t) => {
    expect(noteHasMoney(t)).toBe(false);
    expect(checkNote(t)).toEqual({ ok: true, body: t });
  });
  it("vacía o muy larga", () => {
    expect(checkNote("   ")).toEqual({ ok: false, error: "empty" });
    expect(checkNote("a".repeat(1001))).toEqual({ ok: false, error: "long" });
  });
});

describe("filtros y paginación", () => {
  it("filtro conocido o todos", () => {
    expect(parseFilter("pro")).toBe("pro");
    expect(parseFilter(["failed"])).toBe("failed");
    expect(parseFilter("admin")).toBe("all");
    expect(parseFilter(undefined)).toBe("all");
  });
  it("página válida", () => {
    expect(parsePage("3")).toBe(3);
    expect(parsePage("0")).toBe(1);
    expect(parsePage("-2")).toBe(1);
    expect(parsePage("abc")).toBe(1);
  });
  it("búsqueda limpia", () => expect(parseSearch("  ana   martínez ")).toBe("ana martínez"));
  it("rango y total de páginas", () => {
    expect(pageRange(1, 25)).toEqual({ limit: 25, offset: 0 });
    expect(pageRange(3, 25)).toEqual({ limit: 25, offset: 50 });
    expect(pageCount(0, 25)).toBe(1);
    expect(pageCount(25, 25)).toBe(1);
    expect(pageCount(26, 25)).toBe(2);
  });
  it("arma el enlace sin lo que está por defecto", () => {
    expect(listHref("/admin/usuarios", { q: "", filtro: "all", p: 1 })).toBe("/admin/usuarios");
    expect(listHref("/admin/usuarios", { q: "ana", filtro: "pro", p: 2 })).toBe("/admin/usuarios?q=ana&filtro=pro&p=2");
  });
  it("grupos de acciones del registro", () => {
    expect(parseActionGroup("accesos")).toBe("accesos");
    expect(parseActionGroup("otro")).toBe("all");
    expect(actionGroupFilter("accesos")).toBe("action.like.dar_acceso*,action.like.quitar_acceso*,action.like.codigo_*,action.like.grupo_*");
  });
  it("porcentajes sin dividir por cero", () => {
    expect(pct(1, 3)).toBe(33);
    expect(pct(5, 0)).toBe(0);
  });
});

describe("códigos de invitación", () => {
  it("se guardan en mayúsculas", () => expect(checkCode(" ruta2027 ")).toEqual({ ok: true, code: "RUTA2027" }));
  it("rechaza cortos, largos o con símbolos", () => {
    expect(checkCode("abc").ok).toBe(false);
    expect(checkCode("A".repeat(41)).ok).toBe(false);
    expect(checkCode("RUTA 2027").ok).toBe(false);
    expect(checkCode("-RUTA").ok).toBe(false);
  });
  it("usos máximos opcionales", () => {
    expect(checkMaxUses("")).toEqual({ ok: true, max: null });
    expect(checkMaxUses("50")).toEqual({ ok: true, max: 50 });
    expect(checkMaxUses("0").ok).toBe(false);
    expect(checkMaxUses("1.5").ok).toBe(false);
  });
  it("duración del código", () => {
    expect(codeDuration("vida", {}, "2026-11-24")).toEqual({ ok: true, months: null, until: null });
    expect(codeDuration("meses", { months: "6" }, "2026-11-24")).toEqual({ ok: true, months: 6, until: null });
    expect(codeDuration("fecha", { until: "2027-01-31" }, "2026-11-24")).toEqual({ ok: true, months: null, until: "2027-01-31" });
    expect(codeDuration("fecha", { until: "2026-01-31" }, "2026-11-24").ok).toBe(false);
  });
});

describe("otros", () => {
  it("correos pegados", () => expect(parseEmails("Ana@Correo.com, bob@x.co;ana@correo.com\nmalo")).toEqual({ valid: ["ana@correo.com", "bob@x.co"], invalid: ["malo"] }));
  it("uuid", () => {
    expect(isUuid("1b4e28ba-2fa1-11d2-883f-0016d3cca427")).toBe(true);
    expect(isUuid("1; drop table")).toBe(false);
  });
  it("CSV sin fórmulas", () => {
    expect(csvCell("=HYPERLINK()")).toBe("'=HYPERLINK()");
    expect(csvCell('Ana "la jefa"')).toBe('"Ana ""la jefa"""');
    expect(csvCell(null)).toBe("");
  });
});

describe("vencimiento guardado", () => {
  it("vuelve al mismo día que eligió el admin", async () => {
    const { endOfDay, expiryDay } = await import("@/app/admin/_shared/lib");
    expect(expiryDay(endOfDay("2027-03-01")!)).toBe("2027-03-01");
  });
});

describe("filtros de usuarios (rol, país, correo exacto, 7 días)", () => {
  it("vencen en 7 o en 30 días", () => {
    expect(parseFilter("expiring7")).toBe("expiring7");
    expect(parseFilter("expiring")).toBe("expiring");
    expect(parseFilter("expiring14")).toBe("all");
  });
  it("rol", () => {
    expect(parseRole("admin")).toBe("admin");
    expect(parseRole("user")).toBe("user");
    expect(parseRole("root")).toBe("all");
    expect(parseRole(undefined)).toBe("all");
  });
  it("país: código de 2 letras, 'otro' o todos", () => {
    expect(parseCountry("co")).toBe("CO");
    expect(parseCountry("AU")).toBe("AU");
    expect(parseCountry("otro")).toBe("otro");
    expect(parseCountry("AUS")).toBe("all");
    expect(parseCountry("' or 1=1")).toBe("all");
    expect(parseCountry(["NZ", "AU"])).toBe("NZ");
  });
  it("un correo completo se busca exacto; lo demás, parcial", () => {
    expect(splitSearch("Ana@Correo.com")).toEqual({ search: "", email: "ana@correo.com" });
    expect(splitSearch("ana")).toEqual({ search: "ana", email: "" });
    expect(splitSearch("@gmail.com")).toEqual({ search: "@gmail.com", email: "" });
    expect(isEmail("x@y")).toBe(false);
  });
  it("parámetros de la consulta", () => {
    expect(userQuery("ana@correo.com", "expiring7", "admin", "CO")).toEqual({ p_search: "", p_email: "ana@correo.com", p_filter: "expiring7", p_role: "admin", p_country: "CO" });
    expect(userQuery("ana", "all", "all", "all")).toEqual({ p_search: "ana", p_email: "", p_filter: "all", p_role: "", p_country: "" });
  });
});

// ───────── Subroles del panel (migración 20261125000033) ─────────
import { ADMIN_SECTIONS, ROLE_SECTIONS, canUse, isAdminRole, sectionOf } from "@/app/admin/actividad/roles";

describe("subroles de administrador", () => {
  it("el Dueño usa todas las secciones, incluida invitar administradores", () => {
    for (const sec of ADMIN_SECTIONS) expect(canUse("owner", sec), sec).toBe(true);
  });
  it("Contenido: Academia y países, más Resumen y su actividad", () => {
    expect([...ROLE_SECTIONS.content].sort()).toEqual(["academia", "actividad", "paises", "resumen"]);
    for (const sec of ["usuarios", "grupos", "soporte", "menu", "planes", "administradores"] as const) expect(canUse("content", sec), sec).toBe(false);
  });
  it("Soporte: soporte, usuarios y grupos, más Resumen y su actividad", () => {
    expect([...ROLE_SECTIONS.support].sort()).toEqual(["actividad", "grupos", "resumen", "soporte", "usuarios"]);
    for (const sec of ["academia", "paises", "menu", "planes", "administradores"] as const) expect(canUse("support", sec), sec).toBe(false);
  });
  it("solo el Dueño invita y cambia roles; todos ven Resumen y actividad", () => {
    expect(canUse("content", "administradores") || canUse("support", "administradores")).toBe(false);
    for (const r of ["owner", "content", "support"] as const) { expect(canUse(r, "resumen")).toBe(true); expect(canUse(r, "actividad")).toBe(true); }
  });
  it("reconoce solo los tres subroles", () => {
    expect(["owner", "content", "support"].every(isAdminRole)).toBe(true);
    for (const v of ["admin", "none", "", null, undefined, "Owner"]) expect(isAdminRole(v)).toBe(false);
  });
  it("saca la sección de la ruta", () => {
    expect(sectionOf("/admin")).toBe("resumen");
    expect(sectionOf("/admin/")).toBe("resumen");
    expect(sectionOf("/admin/planes")).toBe("planes");
    expect(sectionOf("/admin/usuarios/123e4567-e89b-12d3-a456-426614174000")).toBe("usuarios");
    expect(sectionOf("/admin/academia?curso=1")).toBe("academia");
    expect(sectionOf("/admin/actividad")).toBe("actividad");
  });
  it("una ruta fuera del panel o desconocida no bloquea nada", () => {
    for (const p of ["/inicio", "/administrar", "/admin-x", "", "/admin/nueva-seccion", "/admin/administradores", "/admin/resumen"]) expect(sectionOf(p), p).toBeNull();
  });
});

// ───────── Un solo plan: filtros y plan de cada usuario (usuarios/lib.ts) ─────────
describe("usuarios con un solo plan", () => {
  it("filtros del mockup y de atención; lo desconocido es 'todos'", () => {
    for (const f of PLAN_FILTERS) expect(parsePlanFilter(f)).toBe(f);
    expect(parsePlanFilter("nada")).toBe("all");
    expect(parsePlanFilter(undefined)).toBe("all");
    expect(parsePlanFilter(["yearly", "monthly"])).toBe("yearly");
  });
  it("enlaces viejos con Gratis/Pro siguen llevando a algo con sentido", () => {
    expect(parsePlanFilter("pro")).toBe("monthly");
    expect(parsePlanFilter("trial")).toBe("first_month");
    expect(parsePlanFilter("fundador")).toBe("free_access");
    expect(parsePlanFilter("free")).toBe("inactive");
  });
  it("plan que se muestra: trialing = primer mes; luego mensual o anual", () => {
    expect(planKey("pro", "month", "trialing")).toBe("first_month");
    expect(planKey("pro", "month", "active")).toBe("monthly");
    expect(planKey("pro", "year", "active")).toBe("yearly");
    expect(planKey("pro", "month", "past_due")).toBe("monthly");
    expect(planKey("pro", null, null)).toBe("pro");
    expect(planKey("alumno", null, null)).toBe("alumno");
    expect(planKey("read_only", "month", "canceled")).toBe("read_only");
    expect(planKey("raro", null, null)).toBe("free");
  });
  it("parámetros de admin_users_v3 (correo exacto, rol y país)", () => {
    expect(planQuery("ana@x.com", "monthly", "all", "all")).toEqual({ p_search: "", p_email: "ana@x.com", p_filter: "monthly", p_role: "", p_country: "" });
    expect(planQuery("ana", "free_access", "admin", "AU")).toEqual({ p_search: "ana", p_email: "", p_filter: "free_access", p_role: "admin", p_country: "AU" });
  });
  it("sin la migración, cada filtro cae en uno que admin_users_v2 entiende", () => {
    for (const f of PLAN_FILTERS) expect(["all", "free", "trial", "pro", "alumno", "fundador", "read_only", "failed", "expiring7", "expiring", "suspended"]).toContain(V2_FILTER[f]);
  });
});
