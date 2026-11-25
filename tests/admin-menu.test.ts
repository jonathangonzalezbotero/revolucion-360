import { describe, expect, it } from "vitest";
import { Schemas, checkLevels, diffConfig, formToValues, menuPreview, parseWhole, sameJson, touchedKeys, valuesToForm, type MenuValues } from "@/app/admin/menu/lib";

const base: MenuValues = {
  menu: { plan: "on", movimientos: "on", cuentas: "on", metas: "on", proyeccion: "on", analisis: "on", deudas: "on", inversiones: "on", academia: "on", cierre: "on" },
  features: { plan: "free", diag: "free", metas: "free", proy: "free", mov: "pro", ana: "pro", inv: "pro", cierre: "pro", acad: "free", deudas: "free", csv: "pro", escenarios: "pro", recurrentes: "pro" },
  flags: { csv: true, comercios: true, remesas: true, multimoneda: false },
  limits: { free_goals: 2 },
  gamification_enabled: true,
  admin_mfa_required: true,
  points: { lesson: 10, course: 50, closure: 30, debt_paid: 50, goal_done: 100, goal_contrib: 5, week_active: 5, first_step: 10 },
  levels: [{ name: "Despertar", min: 0 }, { name: "Orden", min: 300 }, { name: "Ahorro", min: 500 }, { name: "Inversión", min: 1000 }, { name: "Revolucionario", min: 2000 }],
};
// Lo que hay hoy en la base (migración 20261124000003_defaults.sql).
const stored = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;

describe("parseWhole", () => {
  it("acepta enteros y miles bien escritos", () => {
    expect(parseWhole("10", 1000)).toBe(10);
    expect(parseWhole(" 0 ", 1000)).toBe(0);
    expect(parseWhole("1,000", 1000)).toBe(1000);
    expect(parseWhole("1.000", 1000)).toBe(1000);
  });
  it("rechaza decimales, negativos, vacío y lo que pasa del máximo", () => {
    for (const v of ["1.5", "1,5", "-3", "", "abc", "1001", "10 0"]) expect(parseWhole(v, 1000)).toBeNull();
  });
});

describe("checkLevels", () => {
  it("ordena por puntos y limpia espacios", () => {
    const r = checkLevels([{ name: " Orden ", min: "300" }, { name: "Despertar", min: "0" }]);
    expect(r).toEqual({ ok: true, levels: [{ name: "Despertar", min: 0 }, { name: "Orden", min: 300 }] });
  });
  it("exige un nivel en 0, mínimos y nombres sin repetir", () => {
    expect(checkLevels([{ name: "A", min: "10" }])).toMatchObject({ ok: false, error: "levelZero" });
    expect(checkLevels([{ name: "A", min: "0" }, { name: "B", min: "0" }])).toMatchObject({ ok: false, error: "levelZero" });
    expect(checkLevels([{ name: "A", min: "0" }, { name: "B", min: "5" }, { name: "C", min: "5" }])).toMatchObject({ ok: false, error: "levelDup" });
    expect(checkLevels([{ name: "A", min: "0" }, { name: "a", min: "5" }])).toMatchObject({ ok: false, error: "levelName" });
    expect(checkLevels([{ name: "", min: "0" }])).toMatchObject({ ok: false, error: "levelName", index: 0 });
    expect(checkLevels([{ name: "A", min: "0" }, { name: "B", min: "x" }])).toMatchObject({ ok: false, error: "levelMin", index: 1 });
    expect(checkLevels([])).toMatchObject({ ok: false, error: "levelCount" });
  });
});

describe("formToValues", () => {
  it("ida y vuelta sin cambios", () => {
    const r = formToValues(valuesToForm(base));
    expect(r.ok && r.values).toEqual(base);
  });
  it("cada valor cumple su forma de zod (booleanos reales)", () => {
    const r = formToValues(valuesToForm(base));
    if (!r.ok) throw new Error("debería ser válido");
    for (const k of Object.keys(Schemas) as (keyof typeof Schemas)[]) expect(Schemas[k].safeParse(r.values[k]).success).toBe(true);
    expect(Schemas.gamification_enabled.safeParse("false").success).toBe(false);
  });
  it("señala el punto mal escrito y el límite de metas", () => {
    const f = valuesToForm(base);
    expect(formToValues({ ...f, points: { ...f.points, closure: "-1" } })).toMatchObject({ ok: false, error: "points", field: "closure" });
    expect(formToValues({ ...f, freeGoals: "51" })).toMatchObject({ ok: false, error: "freeGoals" });
    expect(formToValues({ ...f, freeGoals: "0" })).toMatchObject({ ok: true });
  });
});

describe("diffConfig", () => {
  it("sin cambios no escribe nada", () => {
    expect(diffConfig(stored, base)).toEqual([]);
  });
  it("solo escribe lo que cambió y dice qué subclaves", () => {
    const next = { ...base, menu: { ...base.menu, academia: "soon" as const }, features: { ...base.features, ana: "free" as const } };
    const d = diffConfig(stored, next);
    expect(d.map((c) => c.key)).toEqual(["menu", "features"]);
    expect(d[0].changed).toEqual(["academia"]);
    expect(d[1].changed).toEqual(["ana"]);
  });
  it("conserva subclaves que esta pantalla no conoce", () => {
    const withExtra = { ...stored, points: { ...base.points, referral: 20 }, limits: { free_goals: 2, other: 7 } };
    const next = { ...base, points: { ...base.points, closure: 40 }, limits: { free_goals: 3 } };
    const d = diffConfig(withExtra, next);
    expect(d.find((c) => c.key === "points")?.value).toEqual({ ...base.points, closure: 40, referral: 20 });
    expect(d.find((c) => c.key === "limits")?.value).toEqual({ free_goals: 3, other: 7 });
  });
  it("escribe claves que faltan en la base y booleanos tal cual", () => {
    const { admin_mfa_required: _omit, ...rest } = stored;
    void _omit;
    const d = diffConfig(rest, { ...base, gamification_enabled: false });
    expect(d).toEqual([
      { key: "gamification_enabled", value: false, changed: [] },
      { key: "admin_mfa_required", value: true, changed: [] },
    ]);
  });
  it("niveles: cualquier cambio reemplaza la lista", () => {
    const d = diffConfig(stored, { ...base, levels: [{ name: "Inicio", min: 0 }] });
    expect(d).toEqual([{ key: "levels", value: [{ name: "Inicio", min: 0 }], changed: [] }]);
  });
});

describe("menuPreview", () => {
  it("Inicio siempre; ocultas fuera; Pronto y Pro marcados", () => {
    const p = menuPreview({ ...base.menu, inversiones: "off", academia: "soon" }, base.features);
    expect(p[0]).toEqual({ key: "inicio", soon: false, pro: false });
    expect(p.find((x) => x.key === "inversiones")).toBeUndefined();
    expect(p.find((x) => x.key === "academia")).toEqual({ key: "academia", soon: true, pro: false });
    expect(p.find((x) => x.key === "analisis")?.pro).toBe(true);
    expect(p.find((x) => x.key === "cuentas")?.pro).toBe(false);
  });
});

describe("sameJson", () => {
  it("ignora el orden de las claves, no el de las listas", () => {
    expect(sameJson({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 })).toBe(true);
    expect(sameJson([1, 2], [2, 1])).toBe(false);
    expect(sameJson({ a: 1 }, { a: 1, b: undefined })).toBe(false);
  });
});

describe("touchedKeys", () => {
  it("solo las claves que el admin tocó, en el orden de app_config", () => {
    const f = valuesToForm(base);
    expect(touchedKeys(f, f)).toEqual([]);
    const g = { ...f, freeGoals: "3", adminMfa: false, menu: { ...f.menu, cierre: "off" as const } };
    expect(touchedKeys(f, g)).toEqual(["menu", "limits", "admin_mfa_required"]);
  });
});
