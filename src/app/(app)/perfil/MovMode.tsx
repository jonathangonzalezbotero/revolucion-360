"use client";
import { useState } from "react";
import { fill } from "@/i18n";
import type { MovMode } from "@/lib/engine/registro";
import { saveMovMode } from "./actions";
import { Alert, useAct } from "./Forms";
import type { PerfilMessages } from "./messages";
import css from "./perfil.module.css";

/** "Cómo llevas tu plata": Mensual o Día a día. Se guarda al elegir; cambiar no borra nada. */
export function MovModeForm({ m, initial }: { m: PerfilMessages; initial: MovMode }) {
  const [mode, setMode] = useState(initial);
  const { error, act, pending } = useAct();
  const pick = (next: MovMode) => {
    if (next === mode) return;
    const before = mode;
    setMode(next);
    act(() => saveMovMode({ mode: next }).then((r) => { if (!r.ok) setMode(before); return r; }), undefined,
      fill(m.mode.saved, { mode: next === "mensual" ? m.mode.savedMensual : m.mode.savedDiario }));
  };
  return (
    <section aria-labelledby="modo-h" id="modo" className={css.section} style={{ gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h2 id="modo-h" style={{ fontSize: 17 }}>{m.mode.title}</h2>
        <p className="small muted" style={{ margin: 0, lineHeight: 1.5 }}>{m.mode.text}</p>
      </div>
      <fieldset className={css.modes} disabled={pending}>
        <legend className="sr-only">{m.mode.title}</legend>
        {(["mensual", "diario"] as const).map((k) => (
          <label key={k} className={css.mode}>
            <input type="radio" name="mov-mode" value={k} checked={mode === k} onChange={() => pick(k)} />
            <span><strong style={{ fontSize: 15 }}>{m.mode[k].t}</strong><span className="small" style={{ color: "var(--tinta-2)", lineHeight: 1.5 }}>{m.mode[k].d}</span></span>
          </label>
        ))}
      </fieldset>
      <p className="xs muted" style={{ margin: 0 }}>{m.mode.note}</p>
      <Alert text={error} />
    </section>
  );
}
