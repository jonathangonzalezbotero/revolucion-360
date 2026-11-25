// Recorrido general (primera vez en la app): cálculos puros, sin React, con pruebas en tests/tour.test.ts.

export type TourStopKey = "inicio" | "plan" | "movimientos" | "metas" | "cierre";
export type TourStop = {
  key: TourStopKey;
  /** Marcas `data-tour` que se resaltan, en orden de preferencia: se usan todas las visibles del primer grupo que tenga alguna. */
  targets: string[][];
};
type MenuState = "on" | "soon" | "off";

/**
 * Paradas del recorrido según el menú que decide admin. Una sección apagada no tiene enlace: su parada se salta.
 * Escritorio: el enlace del menú lateral. Móvil: el ícono de la barra inferior o "Más".
 */
export function tourStops(menu: Partial<Record<"plan" | "movimientos" | "metas" | "deudas" | "cierre", MenuState>>): TourStop[] {
  const on = (k: keyof typeof menu) => (menu[k] ?? "on") !== "off";
  const stops: TourStop[] = [{ key: "inicio", targets: [["inicio"]] }];
  if (on("plan")) stops.push({ key: "plan", targets: [["plan"], ["mas"]] });
  if (on("movimientos")) stops.push({ key: "movimientos", targets: [["movimientos"], ["mas"]] });
  if (on("metas") || on("deudas")) stops.push({ key: "metas", targets: [["deudas", "metas"], ["mas"]] });
  if (on("cierre")) stops.push({ key: "cierre", targets: [["cierre"], ["mas"]] });
  return stops;
}

// ───────── "Ya lo vio" (profiles.prefs.tour) ─────────

/** El recorrido ya se vio (o se saltó). Se guarda en `profiles.prefs.tour.seen` (fecha ISO). */
export function tourSeen(prefs: Record<string, unknown>): boolean {
  const t = prefs.tour;
  return !!t && typeof t === "object" && typeof (t as Record<string, unknown>).seen === "string";
}

/** Marca el recorrido como visto y conserva todas las demás claves de prefs. */
export function withTourSeen(prefs: Record<string, unknown>, when: string): Record<string, unknown> {
  const old = prefs.tour && typeof prefs.tour === "object" ? (prefs.tour as Record<string, unknown>) : {};
  return { ...prefs, tour: { ...old, seen: when } };
}

// ───────── Posición del resaltado y de la burbuja ─────────

export type Rect = { top: number; left: number; width: number; height: number };
export type Size = { width: number; height: number };
export type Side = "right" | "left" | "top" | "bottom" | "center";

/** Rectángulo que contiene a todos (para colocar la burbuja junto a un grupo de enlaces). */
export function unionRect(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  const top = Math.min(...rects.map((r) => r.top));
  const left = Math.min(...rects.map((r) => r.left));
  const bottom = Math.max(...rects.map((r) => r.top + r.height));
  const right = Math.max(...rects.map((r) => r.left + r.width));
  return { top, left, width: right - left, height: bottom - top };
}

/** Agranda un rectángulo `pad` px por lado y lo recorta a la pantalla (el hueco del resaltado). */
export function padRect(r: Rect, pad: number, view: Size): Rect {
  const top = Math.max(0, r.top - pad), left = Math.max(0, r.left - pad);
  const bottom = Math.min(view.height, r.top + r.height + pad), right = Math.min(view.width, r.left + r.width + pad);
  return { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

const clamp = (v: number, min: number, max: number) => (max < min ? min : Math.min(Math.max(v, min), max));

/**
 * Dónde va la burbuja: al lado del objetivo, sin taparlo y siempre dentro de la pantalla (margen `margin`).
 * Prueba derecha (menú lateral), arriba (barra inferior), abajo e izquierda, en ese orden; si no cabe en ninguno
 * o no hay objetivo, va centrada.
 */
export function placeBubble(target: Rect | null, bubble: Size, view: Size, gap = 14, margin = 16): { top: number; left: number; side: Side } {
  const centered = { top: Math.max(margin, (view.height - bubble.height) / 2), left: Math.max(margin, (view.width - bubble.width) / 2), side: "center" as const };
  if (!target) return centered;
  const maxTop = view.height - margin - bubble.height, maxLeft = view.width - margin - bubble.width;
  const midY = target.top + target.height / 2 - bubble.height / 2;
  const midX = target.left + target.width / 2 - bubble.width / 2;
  const right = target.left + target.width + gap;
  if (right + bubble.width <= view.width - margin) return { top: clamp(midY, margin, maxTop), left: right, side: "right" };
  const above = target.top - gap - bubble.height;
  if (above >= margin) return { top: above, left: clamp(midX, margin, maxLeft), side: "top" };
  const below = target.top + target.height + gap;
  if (below + bubble.height <= view.height - margin) return { top: below, left: clamp(midX, margin, maxLeft), side: "bottom" };
  const left = target.left - gap - bubble.width;
  if (left >= margin) return { top: clamp(midY, margin, maxTop), left, side: "left" };
  return centered;
}

/** Trazo SVG de la pantalla completa con un hueco redondeado por cada rectángulo (relleno `evenodd`). */
export function spotlightPath(holes: Rect[], view: Size, radius = 10): string {
  const outer = `M0 0H${view.width}V${view.height}H0Z`;
  const inner = holes.map((h) => {
    const r = Math.max(0, Math.min(radius, h.width / 2, h.height / 2));
    const x = h.left, y = h.top, w = h.width, hh = h.height;
    return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + hh - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + hh}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + hh - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
  });
  return [outer, ...inner].join("");
}
