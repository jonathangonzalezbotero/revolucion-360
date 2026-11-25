"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { fill } from "@/i18n";
import { markTourSeen } from "./actions";
import type { TourMessages } from "./messages";
import { padRect, placeBubble, spotlightPath, unionRect, type Rect, type Side, type TourStop } from "./tour-lib";
import css from "./tour.module.css";

/** Evento para volver a ver el recorrido (botón de Ayuda). */
export const TOUR_EVENT = "r360:tour";

type Layout = { holes: Rect[]; view: { width: number; height: number }; top: number; left: number; side: Side };

/** Enlaces visibles con esa marca (el menú lateral y la barra móvil están los dos en la página; uno con display:none). */
function visibleTargets(keys: string[]): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const k of keys) {
    document.querySelectorAll<HTMLElement>(`[data-tour="${k}"]`).forEach((el) => {
      const r = el.getBoundingClientRect();
      if (el.getClientRects().length > 0 && r.width > 0 && r.height > 0) out.push(el);
    });
  }
  return out;
}

const toRect = (r: DOMRect): Rect => ({ top: r.top, left: r.left, width: r.width, height: r.height });

/**
 * Recorrido general la primera vez que alguien entra a la app (cuenta activa y que puede escribir).
 * Oscurece la pantalla, resalta el enlace del menú de cada parada y muestra una burbuja con Siguiente y Saltar.
 * Terminarlo o saltarlo lo marca visto (`profiles.prefs.tour`); desde Ayuda se vuelve a ver sin escribir nada.
 */
export function Tour({ m, stops, autoStart }: { m: TourMessages; stops: TourStop[]; autoStart: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const marked = useRef(false);
  const [open, setOpen] = useState(autoStart && stops.length > 0);
  const [replay, setReplay] = useState(false);
  const [i, setI] = useState(0);
  const [layout, setLayout] = useState<Layout | null>(null);
  const stop = stops[Math.min(i, stops.length - 1)];
  const last = i >= stops.length - 1;

  // Volver a verlo desde Ayuda.
  useEffect(() => {
    const onReplay = () => { if (stops.length === 0) return; setI(0); setLayout(null); setReplay(true); setOpen(true); };
    window.addEventListener(TOUR_EVENT, onReplay);
    return () => window.removeEventListener(TOUR_EVENT, onReplay);
  }, [stops.length]);

  // Abrir y cerrar el <dialog> nativo: foco atrapado, el resto de la página inerte y Escape (onCancel).
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      d.showModal();
      // showModal() enfoca el primer botón ("Saltar"); el foco va a "Siguiente" para que Enter no salte el recorrido.
      nextRef.current?.focus();
    }
    if (!open && d.open) {
      d.close();
      returnFocus.current?.focus?.();
    }
  }, [open]);

  // Medir el objetivo y colocar la burbuja; se repite al cambiar el tamaño de la pantalla o al desplazarse.
  useEffect(() => {
    if (!open || !stop) return;
    let frame = 0;
    const measure = () => {
      const view = { width: window.innerWidth, height: window.innerHeight };
      let els: HTMLElement[] = [];
      for (const group of stop.targets) {
        els = visibleTargets(group);
        if (els.length > 0) break;
      }
      const holes = els.map((el) => padRect(toRect(el.getBoundingClientRect()), 6, view)).filter((h) => h.width > 0 && h.height > 0);
      const b = bubbleRef.current;
      const size = { width: b?.offsetWidth ?? 320, height: b?.offsetHeight ?? 160 };
      const pos = placeBubble(unionRect(holes), size, view);
      setLayout({ holes, view, ...pos });
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    frame = requestAnimationFrame(() => {
      // El menú lateral puede tener scroll propio: trae el enlace a la vista antes de medir.
      for (const group of stop.targets) {
        const els = visibleTargets(group);
        if (els.length > 0) { els[0].scrollIntoView({ block: "nearest", inline: "nearest" }); break; }
      }
      measure();
    });
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [open, stop]);

  const finish = useCallback(() => {
    setOpen(false);
    setLayout(null);
    setI(0);
    if (!replay && !marked.current) {
      marked.current = true;
      // Si falla, igual se cierra; la próxima vez se vuelve a mostrar.
      markTourSeen().catch(() => { marked.current = false; });
    }
  }, [replay]);

  const next = () => { if (last) finish(); else setI(i + 1); };

  // Tab y Shift+Tab se quedan dentro de la burbuja.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const items = bubbleRef.current?.querySelectorAll<HTMLElement>("button");
    if (!items || items.length === 0) return;
    const first = items[0], lastItem = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastItem.focus(); }
    else if (!e.shiftKey && document.activeElement === lastItem) { e.preventDefault(); first.focus(); }
  };

  if (stops.length === 0) return null;
  const view = layout?.view ?? { width: 0, height: 0 };
  return (
    <dialog
      ref={dialogRef}
      className={css.dialog}
      aria-labelledby="tour-title"
      aria-describedby="tour-text"
      onCancel={(e) => { e.preventDefault(); finish(); }}
      onClose={() => { if (open) finish(); }}
      onKeyDown={onKeyDown}
    >
      {open ? (
        <>
          <svg className={css.scrim} aria-hidden="true" viewBox={`0 0 ${view.width || 1} ${view.height || 1}`} preserveAspectRatio="none">
            {layout ? <path className={css.shade} d={spotlightPath(layout.holes, layout.view)} fillRule="evenodd" /> : <rect className={css.shade} width="100%" height="100%" />}
            {layout?.holes.map((h, k) => <rect key={k} className={css.ring} x={h.left} y={h.top} width={h.width} height={h.height} rx={10} />)}
          </svg>
          <div
            ref={bubbleRef}
            className={css.bubble}
            data-side={layout?.side}
            style={{ top: layout?.top ?? 0, left: layout?.left ?? 0, opacity: layout ? 1 : 0 }}
          >
            <h2 id="tour-title" className="sr-only">{m.label}</h2>
            <div aria-live="polite" aria-atomic="true" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <p className={css.count}>{fill(m.count, { n: i + 1, total: stops.length })}</p>
              <p id="tour-text" className={css.text}>{m.stops[stop.key]}</p>
            </div>
            <div className={css.actions}>
              <button type="button" className="btn btn-ghost" onClick={finish}>{m.skip}</button>
              {/* Mismo botón en todas las paradas: el foco se queda en él. */}
              <button ref={nextRef} type="button" className="btn" onClick={next}>{last ? m.done : m.next}</button>
            </div>
          </div>
        </>
      ) : null}
    </dialog>
  );
}

/** Botón de Ayuda: "Ver el recorrido de nuevo". No escribe nada; solo abre el recorrido montado en AppShell. */
export function ReplayTourButton({ label }: { label: string }) {
  return (
    <button type="button" className="btn btn-secondary" style={{ alignSelf: "flex-start", minHeight: 44 }} onClick={() => window.dispatchEvent(new Event(TOUR_EVENT))}>
      {label}
    </button>
  );
}
