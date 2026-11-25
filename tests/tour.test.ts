import { describe, expect, it } from "vitest";
import { padRect, placeBubble, spotlightPath, tourSeen, tourStops, unionRect, withTourSeen } from "@/components/shell/tour-lib";

const desktop = { width: 1440, height: 900 };
const phone = { width: 390, height: 844 };
const bubble = { width: 340, height: 150 };

describe("tourStops", () => {
  it("las 5 paradas con el menú completo", () => {
    expect(tourStops({}).map((s) => s.key)).toEqual(["inicio", "plan", "movimientos", "metas", "cierre"]);
  });
  it("salta las secciones apagadas; 'pronto' se queda", () => {
    expect(tourStops({ plan: "off", cierre: "soon" }).map((s) => s.key)).toEqual(["inicio", "movimientos", "metas", "cierre"]);
  });
  it("deudas y metas: basta con una encendida", () => {
    expect(tourStops({ metas: "off" }).some((s) => s.key === "metas")).toBe(true);
    expect(tourStops({ metas: "off", deudas: "off" }).some((s) => s.key === "metas")).toBe(false);
  });
  it("en móvil, lo que no está en la barra va a 'Más'", () => {
    const metas = tourStops({}).find((s) => s.key === "metas")!;
    expect(metas.targets).toEqual([["deudas", "metas"], ["mas"]]);
  });
});

describe("visto", () => {
  it("sin marca, no lo ha visto", () => {
    expect(tourSeen({})).toBe(false);
    expect(tourSeen({ tour: "x" })).toBe(false);
  });
  it("marca visto y conserva las demás preferencias", () => {
    const p = withTourSeen({ notify: { close: true }, habit: { daily: false } }, "2026-11-25T10:00:00.000Z");
    expect(p).toEqual({ notify: { close: true }, habit: { daily: false }, tour: { seen: "2026-11-25T10:00:00.000Z" } });
    expect(tourSeen(p)).toBe(true);
  });
});

describe("placeBubble", () => {
  it("enlace del menú lateral: a la derecha, centrada en el enlace", () => {
    const p = placeBubble({ top: 300, left: 16, width: 216, height: 36 }, bubble, desktop);
    expect(p.side).toBe("right");
    expect(p.left).toBe(16 + 216 + 14);
    expect(p.top).toBe(300 + 18 - 75);
  });
  it("no se sale por arriba ni por abajo", () => {
    expect(placeBubble({ top: 10, left: 16, width: 216, height: 36 }, bubble, desktop).top).toBe(16);
    expect(placeBubble({ top: 860, left: 16, width: 216, height: 36 }, bubble, desktop).top).toBe(900 - 16 - 150);
  });
  it("ícono de la barra móvil: encima, dentro de la pantalla", () => {
    const tab = { top: 780, left: 312, width: 78, height: 52 };
    const p = placeBubble(tab, bubble, phone);
    expect(p.side).toBe("top");
    expect(p.top).toBe(780 - 14 - 150);
    expect(p.left).toBe(390 - 16 - 340); // pegada al borde derecho, no se corta
    expect(p.left).toBeGreaterThanOrEqual(16);
  });
  it("sin objetivo: centrada", () => {
    const p = placeBubble(null, bubble, desktop);
    expect(p).toEqual({ top: (900 - 150) / 2, left: (1440 - 340) / 2, side: "center" });
  });
  it("si no cabe en ningún lado: centrada", () => {
    expect(placeBubble({ top: 0, left: 0, width: 390, height: 844 }, bubble, phone).side).toBe("center");
  });
});

describe("rectángulos", () => {
  it("unionRect junta varios enlaces", () => {
    expect(unionRect([{ top: 100, left: 16, width: 200, height: 36 }, { top: 400, left: 16, width: 220, height: 36 }]))
      .toEqual({ top: 100, left: 16, width: 220, height: 336 });
    expect(unionRect([])).toBeNull();
  });
  it("padRect agranda y recorta a la pantalla", () => {
    expect(padRect({ top: 2, left: 100, width: 50, height: 20 }, 6, desktop)).toEqual({ top: 0, left: 94, width: 62, height: 28 });
  });
  it("spotlightPath: la pantalla y un hueco por rectángulo", () => {
    const d = spotlightPath([{ top: 10, left: 10, width: 40, height: 20 }, { top: 100, left: 10, width: 40, height: 20 }], desktop);
    expect(d.startsWith("M0 0H1440V900H0Z")).toBe(true);
    expect(d.match(/Z/g)).toHaveLength(3);
  });
});
