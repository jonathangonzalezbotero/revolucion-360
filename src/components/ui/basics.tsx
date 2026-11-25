// Piezas mínimas para construir cualquier pantalla (sin estado: sirven en el servidor y en el cliente).
import Image from "next/image";
import Link from "next/link";
import { formatMoney, type Cents, type MoneyFormat } from "@/lib/engine";
import { Icon, type IconName } from "./Icon";

/** Título de pantalla con su línea superior y la acción principal (una por pantalla). */
export function PageHeader({ eyebrow, title, children }: { eyebrow?: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <header className="page-header">
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {eyebrow ? <span className="muted" style={{ fontSize: 14 }}>{eyebrow}</span> : null}
        <h1>{title}</h1>
      </div>
      {children ? <div className="row wrap">{children}</div> : null}
    </header>
  );
}

/** Monto con cifras tabulares. `colored`: verde si entra, rojo óxido si falta. */
export function Money({ cents, fmt, sign, colored, className, style }: { cents: Cents; fmt: MoneyFormat; sign?: boolean; colored?: boolean; className?: string; style?: React.CSSProperties }) {
  const cls = ["num", className, colored ? (cents < 0 ? "neg" : cents > 0 ? "pos" : "") : ""].filter(Boolean).join(" ");
  return <span className={cls} style={style}>{formatMoney(cents, fmt, { sign })}</span>;
}

/** Resumen tipo libro contable: cifras sobre una línea, sin caja. */
export function Ledger({ items }: { items: { label: string; value: React.ReactNode; tone?: "pos" | "neg"; note?: React.ReactNode }[] }) {
  return (
    <div className="ledger">
      {items.map((it) => (
        <div key={it.label}>
          <span className="k">{it.label}</span>
          <span className={`v ${it.tone ?? ""}`}>{it.value}</span>
          {it.note ? <span className="xs muted">{it.note}</span> : null}
        </div>
      ))}
    </div>
  );
}

export function Bar({ value, tone, dark, label }: { value: number; tone?: "yellow" | "green" | "ink" | string; dark?: boolean; label?: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  const color = tone === "yellow" ? "var(--amarillo)" : tone === "green" ? "var(--verde)" : tone === "ink" || !tone ? "var(--tinta)" : tone;
  return (
    <div className={`bar ${dark ? "bar-dark" : ""}`} role={label ? "progressbar" : undefined} aria-label={label} aria-valuenow={label ? pct : undefined} aria-valuemin={label ? 0 : undefined} aria-valuemax={label ? 100 : undefined} aria-hidden={label ? undefined : true}>
      <span style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export type PillTone = "ok" | "warn" | "bad" | "yellow" | "dark" | "neutral";
export function Pill({ tone = "neutral", children }: { tone?: PillTone; children: React.ReactNode }) {
  return <span className={`pill ${tone === "neutral" ? "" : `pill-${tone}`}`}>{children}</span>;
}

/** Estado vacío: explica qué falta y qué hacer. Nunca un gráfico vacío. */
/** `image`: ruta de una ilustración decorativa (p. ej. `ILLU.vacioMetas`); si viene, reemplaza al ícono. */
export function Empty({ icon, image, title, text, children }: { icon?: IconName; image?: string; title: string; text?: string; children?: React.ReactNode }) {
  return (
    <div className="empty">
      {image ? <Image src={image} alt="" aria-hidden="true" width={112} height={112} sizes="112px" className="empty-img" /> : icon ? <span className="icon-box" style={{ background: "var(--amarillo-pastel)" }}><Icon name={icon} size={19} /></span> : null}
      <strong style={{ fontSize: 16 }}>{title}</strong>
      {text ? <span className="small muted" style={{ maxWidth: 520 }}>{text}</span> : null}
      {children}
    </div>
  );
}

/** Fila de lista con ícono, título, detalle y flecha. */
export function ListLink({ href, icon, iconColor, title, text, right }: { href: string; icon?: IconName; iconColor?: string; title: React.ReactNode; text?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <Link href={href}>
      {icon ? <span className="icon-box"><Icon name={icon} size={19} color={iconColor ?? "var(--tinta)"} /></span> : null}
      <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <strong style={{ fontSize: 15 }}>{title}</strong>
        {text ? <span className="xs muted">{text}</span> : null}
      </span>
      {right ?? <span aria-hidden="true" className="muted" style={{ fontSize: 18 }}>›</span>}
    </Link>
  );
}

/** Aviso fijo de "información general, no asesoría". */
export function Disclaimer({ text }: { text: string }) {
  return <p className="xs muted" style={{ borderTop: "1px solid var(--linea)", paddingTop: 12 }}>{text}</p>;
}

/** Anillo de nivel o de avance: número al centro y anillo amarillo. */
export function Ring({ value, size = 34, children, track = "var(--amarillo-borde)", hole = "var(--amarillo-suave)" }: { value: number; size?: number; children?: React.ReactNode; track?: string; hole?: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  const inner = Math.round(size * 0.76);
  return (
    <span aria-hidden="true" style={{ width: size, height: size, borderRadius: "50%", flex: "none", background: `conic-gradient(var(--amarillo) 0 ${pct}%, ${track} ${pct}% 100%)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ width: inner, height: inner, borderRadius: "50%", background: hole, display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.max(11, Math.round(size * 0.32)), fontWeight: 600 }}>{children}</span>
    </span>
  );
}
