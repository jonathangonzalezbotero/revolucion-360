// Cálculos puros de /admin/academia: estado del curso, enlace, duración, fecha programada y orden.
import { describe, expect, it } from "vitest";
import { checkCover, courseState, fmtDuration, moveItem, parseDuration, slugify, stageLabel, zonedToUtc } from "@/app/admin/academia/lib";

describe("courseState", () => {
  const now = Date.parse("2026-11-25T00:00:00Z");
  it("borrador, publicado y programado", () => {
    expect(courseState("draft", null, now)).toBe("draft");
    expect(courseState("published", null, now)).toBe("published");
    expect(courseState("scheduled", "2026-12-04T22:00:00Z", now)).toBe("scheduled");
  });
  it("un programado cuya fecha ya pasó está publicado", () => {
    expect(courseState("scheduled", "2026-11-24T22:00:00Z", now)).toBe("published");
  });
  it("programado sin fecha no se libera nunca: sigue programado", () => {
    expect(courseState("scheduled", null, now)).toBe("scheduled");
  });
});

describe("slugify y stageLabel", () => {
  it("quita tildes, eñes y signos", () => {
    expect(slugify("Sal de deudas con método")).toBe("sal-de-deudas-con-metodo");
    expect(slugify("  Año nuevo: ¡ahorra!  ")).toBe("ano-nuevo-ahorra");
    expect(slugify("¿?")).toBe("");
  });
  it("máximo 60 caracteres sin guion al final", () => {
    const s = slugify("a ".repeat(50));
    expect(s.length).toBeLessThanOrEqual(60);
    expect(s.endsWith("-")).toBe(false);
  });
  it("etapa con número de dos cifras", () => {
    expect(stageLabel("Domina la app", 1)).toBe("Domina la app · 01");
    expect(stageLabel("Tu dinero", 12)).toBe("Tu dinero · 12");
  });
});

describe("duración", () => {
  it("lee MM:SS, minutos sueltos y H:MM:SS", () => {
    expect(parseDuration("8:30")).toBe(510);
    expect(parseDuration("8")).toBe(480);
    expect(parseDuration("1:05:00")).toBe(3900);
    expect(parseDuration("")).toBe(0);
  });
  it("rechaza lo que no entiende", () => {
    expect(parseDuration("8:75")).toBeNull();
    expect(parseDuration("ocho")).toBeNull();
    expect(parseDuration("-3")).toBeNull();
    expect(parseDuration("7:00:00")).toBeNull();
  });
  it("muestra MM:SS o H:MM:SS, vacío si es 0", () => {
    expect(fmtDuration(510)).toBe("8:30");
    expect(fmtDuration(3900)).toBe("1:05:00");
    expect(fmtDuration(45)).toBe("0:45");
    expect(fmtDuration(0)).toBe("");
  });
  it("ida y vuelta", () => {
    for (const s of [45, 510, 3599, 3900]) expect(parseDuration(fmtDuration(s))).toBe(s);
  });
});

describe("zonedToUtc (fecha de publicación en la zona del admin)", () => {
  it("Sídney en diciembre (horario de verano, +11)", () => {
    expect(zonedToUtc("2026-12-04", "09:00", "Australia/Sydney")).toBe("2026-12-03T22:00:00.000Z");
  });
  it("Sídney en julio (+10)", () => {
    expect(zonedToUtc("2027-07-01", "09:00", "Australia/Sydney")).toBe("2027-06-30T23:00:00.000Z");
  });
  it("Bogotá (−5) y UTC", () => {
    expect(zonedToUtc("2026-12-04", "18:30", "America/Bogota")).toBe("2026-12-04T23:30:00.000Z");
    expect(zonedToUtc("2026-12-04", "00:00", "UTC")).toBe("2026-12-04T00:00:00.000Z");
  });
  it("una hora que no existe (se adelanta el reloj) o datos malos → null", () => {
    expect(zonedToUtc("2026-10-04", "02:30", "Australia/Sydney")).toBeNull();
    expect(zonedToUtc("2026-02-30", "09:00", "UTC")).toBeNull();
    expect(zonedToUtc("2026-12-04", "25:00", "UTC")).toBeNull();
    expect(zonedToUtc("2026-12-04", "09:00", "Nada/Nada")).toBeNull();
  });
});

describe("moveItem", () => {
  it("sube y baja una posición", () => {
    expect(moveItem(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveItem(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
  });
  it("en los bordes no cambia nada", () => {
    const l = ["a", "b"];
    expect(moveItem(l, 0, -1)).toBe(l);
    expect(moveItem(l, 1, 1)).toBe(l);
  });
});

describe("checkCover", () => {
  it("acepta vacío, rutas del sitio y https", () => {
    expect(checkCover("")).toBe("");
    expect(checkCover(" /cursos/curso-01.jpg ")).toBe("/cursos/curso-01.jpg");
    expect(checkCover("https://img.example.com/a.jpg")).toBe("https://img.example.com/a.jpg");
  });
  it("rechaza http, javascript y rutas raras", () => {
    expect(checkCover("http://img.example.com/a.jpg")).toBeNull();
    expect(checkCover("javascript:alert(1)")).toBeNull();
    expect(checkCover("//evil.com/a.jpg")).toBeNull();
    expect(checkCover("/cursos/../x")).toBeNull();
  });
});
