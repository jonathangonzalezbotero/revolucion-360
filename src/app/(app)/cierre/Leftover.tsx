"use client";
import { useState, useTransition } from "react";
import { fill } from "@/i18n";
import { useToast } from "@/components/ui/client";
import { formatMoney, type Cents, type MoneyFormat } from "@/lib/engine";
import { sendLeftover } from "../metas/actions";
import css from "./cierre.module.css";
import type { CierreText } from "./messages";

export type LeftoverProps = { year: number; month: number; monthLabel: string; cents: Cents; goals: { id: string; name: string }[] };

/** "Cerraste noviembre y te sobraron $X. ¿A qué meta va?" con "Ahora no". Una sola decisión por mes; después desaparece. */
export function Leftover({ lf, fmt, m }: { lf: LeftoverProps; fmt: MoneyFormat; m: CierreText }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  if (done || lf.cents <= 0 || lf.goals.length === 0) return null;
  const pick = (goalId: string | null) => start(async () => {
    setError("");
    const r = await sendLeftover({ year: lf.year, month: lf.month, goalId });
    if (!r.ok) return setError(r.error);
    setDone(true);
    const c = r.data.crossed.at(-1);
    toast(goalId ? (c ? fill(m.tMilestone, { pct: c.pct, name: c.name }) : fill(m.tLeftover, { amount: formatMoney(r.data.amountCents, fmt), name: r.data.name })) : m.tNotNow, r.points);
  });
  return (
    <section aria-labelledby="lf-h" className={css.leftover}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h2 id="lf-h" className={css.lfTitle}>{fill(m.lfTitle, { month: lf.monthLabel })} <span className="num">{formatMoney(lf.cents, fmt)}</span></h2>
        <span className={css.lfText}>{m.lfText}</span>
      </div>
      <div className={css.lfPicks}>
        {lf.goals.map((g) => <button key={g.id} type="button" className={css.lfGoal} disabled={pending} onClick={() => pick(g.id)}>{g.name}</button>)}
        <button type="button" className={css.lfNo} disabled={pending} onClick={() => pick(null)}>{m.notNow}</button>
      </div>
      {error ? <p role="alert" className="error">{error}</p> : null}
    </section>
  );
}
