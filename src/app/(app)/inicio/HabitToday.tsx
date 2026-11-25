import Link from "next/link";
import { fill } from "@/i18n";
import { formatMoney, monthName } from "@/lib/engine";
import type { Allowance } from "@/lib/engine/habito";
import type { Session } from "@/server/session";
import css from "./habit.module.css";
import type { M } from "./messages";

type T = (typeof M)["es"]["habit"];

/**
 * "Hoy puedes gastar $X" + enlace al repaso de la semana (mockup Main / Inicio-movil, bloque "hg").
 * Si ya se pasó lo planeado para el día a día, dice cuánto baja lo que te sobra: nunca en rojo.
 */
export function HabitToday({ s, a, t }: { s: Session; a: Allowance; t: T }) {
  const month = monthName(s.month, s.locale).toLowerCase();
  const money = (c: number) => formatMoney(c, s.fmt);
  let amount: string | null = null, desk: string, mobile: string;
  if (a.state === "ok") {
    amount = money(a.perDayCents);
    const v = { remaining: money(a.remainingCents), days: a.daysLeft, month };
    desk = fill(a.daysLeft === 1 ? t.textLast : t.text, v);
    mobile = fill(a.daysLeft === 1 ? t.textLastShort : t.textShort, v);
  } else if (a.state === "over") {
    amount = money(0);
    const v = { over: money(a.overCents), month, from: money(a.netBeforeCents), to: money(a.netAfterCents) };
    desk = fill(t.over, v);
    mobile = fill(t.overShort, v);
  } else {
    desk = mobile = t.none;
  }
  return (
    <section aria-labelledby="hg" className={css.block}>
      <div className={css.main}>
        <h2 id="hg" className={css.title}>{t.title}</h2>
        {amount ? <span className={`num big ${css.amount}`}>{amount}</span> : null}
        <span className={css.text}><span className="only-desktop">{desk}</span><span className="only-mobile">{mobile}</span></span>
        {a.state === "none" && s.config.menu.plan === "on" ? <Link href="/plan" className="link" style={{ alignSelf: "flex-start", fontSize: 14, minHeight: 44, display: "inline-flex", alignItems: "center" }}>{t.noneCta}</Link> : null}
      </div>
      <Link href="/repaso" className={css.repaso}>
        <strong className="only-desktop" style={{ fontSize: 14 }}>{t.repaso}</strong>
        <span className={`only-desktop ${css.repasoSub}`}>{t.repasoSub}</span>
        <span className="only-mobile">{t.repasoShort}</span>
        <span className="only-mobile" aria-hidden="true">›</span>
      </Link>
    </section>
  );
}
