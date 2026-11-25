"use client";
import { useState } from "react";
import { Switch } from "@/components/ui/client";
import { HABIT_PREF_KEYS, type HabitPrefKey } from "@/lib/engine/habito";
import { saveHabitPrefs } from "./actions";
import { Alert, useAct } from "./Forms";
import type { PerfilMessages } from "./messages";
import css from "./perfil.module.css";

/** Avisos del hábito (profiles.prefs.habit): hoy puedes gastar, repaso del domingo e hitos de metas. */
export function HabitPrefsForm({ m, initial }: { m: PerfilMessages; initial: Record<HabitPrefKey, boolean> }) {
  const [p, setP] = useState(initial);
  const { error, act } = useAct();
  const t = m.habit;
  return (
    <section className={css.section} style={{ gap: 4 }} aria-labelledby="habit-prefs">
      <h2 id="habit-prefs" style={{ fontSize: 17 }}>{t.title}</h2>
      <p className="xs muted" style={{ margin: "0 0 6px", lineHeight: 1.5 }}>{t.text}</p>
      {HABIT_PREF_KEYS.map((k) => (
        <div key={k} className={css.switchRow}>
          <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}><strong style={{ fontSize: 14 }}>{t.items[k].t}</strong><span className="xs muted">{t.items[k].d}</span></span>
          <Switch checked={p[k]} label={t.items[k].t} onChange={(v) => { setP({ ...p, [k]: v }); act(() => saveHabitPrefs({ [k]: v }), undefined, m.saved); }} />
        </div>
      ))}
      <p className="xs muted" style={{ margin: "8px 0 0", lineHeight: 1.5 }}>{t.note}</p>
      <Alert text={error} />
    </section>
  );
}
