import Link from "next/link";
import { fill } from "@/i18n";
import { formatMoney, monthName } from "@/lib/engine";
import { overShowsLeftover, type MonthAvailable } from "@/lib/engine/habito";
import type { Session } from "@/server/session";
import css from "./habit.module.css";
import type { M } from "./messages";

type T = (typeof M)["es"]["habit"];

/**
 * "Disponible del mes": "Este mes te quedan $X para el día a día" + enlace al repaso de la semana (mockup Main /
 * Inicio-movil, bloque "hg"; desde el 25 nov 2026 reemplaza "Hoy puedes gastar", decisión de Jonathan).
 * Si ya se pasó de lo planeado para el día a día, la cifra queda en $0 y dice cuánto baja lo que te sobra: nunca en rojo.
 * `compact`: franja angosta debajo de "Reto de hoy" (mockup InicioRetoB, opción B).
 */
export function HabitToday({ s, a, t, compact = false }: { s: Session; a: MonthAvailable; t: T; compact?: boolean }) {
  const month = monthName(s.month, s.locale).toLowerCase();
  const money = (c: number) => formatMoney(c, s.fmt);
  let amount: string | null = null, desk: string, mobile: string;
  if (a.state === "ok") {
    amount = money(a.remainingCents);
    const v = { days: a.daysLeft, month };
    desk = fill(a.daysLeft === 1 ? t.textLast : t.text, v);
    mobile = fill(a.daysLeft === 1 ? t.textLastShort : t.textShort, v);
  } else if (a.state === "over") {
    amount = money(0);
    const v = { over: money(a.overCents), month, from: money(a.netBeforeCents), to: money(a.netAfterCents) };
    const drop = overShowsLeftover(a); // nunca "baja a -$35": si no sobraba o ya no sobra, solo cuánto se pasó
    desk = fill(drop ? t.over : t.overPlain, v);
    mobile = fill(drop ? t.overShort : t.overPlainShort, v);
  } else {
    desk = mobile = t.none;
  }
  const noneCta = a.state === "none" && s.config.menu.plan === "on"
    ? <Link href="/plan" className={`link ${css.cta}`}>{t.noneCta}</Link> : null;

  if (compact) {
    return (
      <section aria-label={t.label} className={css.strip}>
        <h2 className={css.title}>{t.title}</h2>
        {amount ? <span className={`num big ${css.stripAmount}`}>{amount}</span> : null}
        <span className={css.stripText}><span className="only-desktop">{desk}</span><span className="only-mobile">{mobile}</span></span>
        {noneCta}
        <Link href="/repaso" className={css.stripLink}>{t.repasoLink}</Link>
      </section>
    );
  }
  return (
    <section aria-label={t.label} className={css.block}>
      <div className={css.main}>
        <h2 className={css.title}>{t.title}</h2>
        {amount ? <span className={`num big ${css.amount}`}>{amount}</span> : null}
        <span className={css.text}><span className="only-desktop">{desk}</span><span className="only-mobile">{mobile}</span></span>
        {noneCta}
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
