// Plan de un usuario con texto (nunca solo color). Sirve en servidor y cliente.
import { Pill, type PillTone } from "@/components/ui/basics";
import css from "../_shared/admin.module.css";
import type { AdminText } from "../_shared/messages";
import type { PlanKey } from "./lib";

const TONE: Partial<Record<PlanKey, PillTone>> = { first_month: "yellow", monthly: "ok", yearly: "ok", pro: "ok", fundador: "warn", read_only: "bad" };

export function PlanPill({ t, plan, label, suspended, failed }: { t: AdminText; plan: PlanKey; label?: string; suspended?: boolean; failed?: boolean }) {
  const text = label ?? t.states[plan] ?? plan;
  return (
    <span className={css.chips} style={{ gap: 6 }}>
      {plan === "alumno" ? <span className="pill" style={{ background: "var(--azul-fondo)", color: "var(--azul-texto)" }}>{text}</span> : <Pill tone={TONE[plan] ?? "neutral"}>{text}</Pill>}
      {failed ? <Pill tone="bad">{t.failedPay}</Pill> : null}
      {suspended ? <Pill tone="bad">{t.suspended}</Pill> : null}
    </span>
  );
}
