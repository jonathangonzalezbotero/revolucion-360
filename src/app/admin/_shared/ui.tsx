// Piezas sin estado del panel (sirven en servidor y cliente). La parte 2 también las usa.
import Link from "next/link";
import { fill } from "@/i18n";
import { Pill, type PillTone } from "@/components/ui/basics";
import css from "./admin.module.css";
import type { AdminText } from "./messages";

export function AdminHeader({ eyebrow, title, children }: { eyebrow?: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <header className="page-header">
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {eyebrow ? <span className="muted" style={{ fontSize: 14 }}>{eyebrow}</span> : null}
        <h1 style={{ fontSize: "clamp(26px, 3vw, 32px)", fontWeight: 600 }}>{title}</h1>
      </div>
      {children ? <div className="row wrap">{children}</div> : null}
    </header>
  );
}

const STATE_TONE: Record<string, PillTone> = { pro: "ok", alumno: "neutral", fundador: "warn", trial: "yellow", read_only: "bad", free: "neutral" };
/** Plan del usuario con texto (nunca solo color). */
export function StatePill({ t, state, suspended, failed }: { t: AdminText; state: string; suspended?: boolean; failed?: boolean }) {
  return (
    <span className={css.chips} style={{ gap: 6 }}>
      {state === "alumno" ? <span className="pill" style={{ background: "var(--azul-fondo)", color: "var(--azul-texto)" }}>{t.states[state]}</span> : <Pill tone={STATE_TONE[state] ?? "neutral"}>{t.states[state] ?? state}</Pill>}
      {failed ? <Pill tone="bad">{t.failedPay}</Pill> : null}
      {suspended ? <Pill tone="bad">{t.suspended}</Pill> : null}
    </span>
  );
}

/** Paginación con enlaces (la lista vive en la dirección: se puede compartir y volver atrás). */
export function Pager({ t, page, pages, href }: { t: AdminText; page: number; pages: number; href: (p: number) => string }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label={t.pager} className={css.pager}>
      <span>{fill(t.page, { n: page, total: pages })}</span>
      <span className="row" style={{ gap: 8 }}>
        {page > 1 ? <Link href={href(page - 1)} className="btn btn-secondary btn-sm">{t.prev}</Link> : null}
        {page < pages ? <Link href={href(page + 1)} className="btn btn-secondary btn-sm">{t.next}</Link> : null}
      </span>
    </nav>
  );
}
