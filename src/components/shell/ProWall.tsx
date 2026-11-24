import Link from "next/link";
import { fill } from "@/i18n";
import { Icon } from "@/components/ui/Icon";
import type { Session } from "@/server/session";

/**
 * Bloqueo suave del plan Gratis: explica qué gana con Pro, nunca esconde sus datos.
 * Uno de los pocos lugares donde va el bloque oscuro.
 */
export function ProWall({ s, title, text, bullets }: { s: Session; title: string; text?: string; bullets?: string[] }) {
  const canTrial = s.config.trial.enabled && !s.entitlement.trialUsed && s.entitlement.state === "free";
  return (
    <section className="dark-block" aria-label={s.t.pro.title} style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 720 }}>
      <span className="pill pill-yellow" style={{ alignSelf: "flex-start" }}><Icon name="lock" size={13} /> {s.t.nav.pro}</span>
      <h2 className="big" style={{ fontSize: 32, lineHeight: 1.1 }}>{title}</h2>
      {text ? <p style={{ color: "var(--oscuro-texto)", fontSize: 15, maxWidth: 560 }}>{text}</p> : null}
      {bullets?.length ? (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {bullets.map((b) => (
            <li key={b} style={{ display: "flex", gap: 10, fontSize: 14, color: "var(--oscuro-texto-2)" }}><Icon name="tick" color="var(--amarillo)" /> {b}</li>
          ))}
        </ul>
      ) : null}
      <div className="row wrap" style={{ marginTop: 6 }}>
        <Link href="/suscripcion" className="btn btn-yellow">{canTrial ? fill(s.t.pro.trial, { days: s.config.trial.days }) : s.t.pro.cta}</Link>
      </div>
    </section>
  );
}
