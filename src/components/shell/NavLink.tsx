"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";

const isActive = (path: string, href: string) => path === href || path.startsWith(href + "/");

/**
 * Enlace del menú lateral: seleccionado con fondo y marca amarilla.
 * `yellow`: fondo amarillo suave (Retos con un reto activo); el texto sigue en tinta (el amarillo nunca es texto).
 */
export function SideLink({ href, icon, label, badge, soon, soonLabel, tour, yellow }: { href: string; icon: IconName; label: string; badge?: React.ReactNode; soon?: boolean; soonLabel?: string; tour?: string; yellow?: boolean }) {
  const active = isActive(usePathname(), href);
  const base: React.CSSProperties = { textDecoration: "none", position: "relative", display: "flex", alignItems: "center", gap: 11, padding: "8px 12px", borderRadius: 8, fontSize: 14 };
  if (soon) {
    return (
      <span aria-disabled="true" data-tour={tour} style={{ ...base, fontWeight: 450, color: "var(--gris-4)" }}>
        <Icon name={icon} color="var(--gris-5)" />{label}
        <span className="pill" style={{ marginLeft: "auto" }}>{soonLabel}</span>
      </span>
    );
  }
  return (
    <Link href={href} data-tour={tour} aria-current={active ? "page" : undefined} style={{ ...base, fontWeight: active || yellow ? 600 : 450, background: yellow ? (active ? "var(--amarillo-pastel)" : "var(--amarillo-suave)") : active ? "var(--seleccion)" : "transparent", boxShadow: yellow ? "inset 0 0 0 1px var(--amarillo-borde)" : undefined, color: active || yellow ? "var(--tinta)" : "var(--gris-2)" }}>
      {active ? <span aria-hidden="true" style={{ position: "absolute", left: -16, top: 8, bottom: 8, width: 3, borderRadius: "0 3px 3px 0", background: "var(--amarillo)" }} /> : null}
      <Icon name={icon} color={active || yellow ? "var(--tinta)" : "var(--gris-3)"} />{label}
      {badge ? <span style={{ marginLeft: "auto" }}>{badge}</span> : null}
    </Link>
  );
}

/**
 * Pestaña de la barra inferior en móvil. `dot` + `dotLabel`: punto amarillo sobre el ícono (en "Más": falta marcar el reto
 * de hoy); el `aria-label` pasa a ser `dotLabel`, que repite el nombre de la pestaña.
 */
export function TabLink({ href, icon, label, match, tour, dot, dotLabel }: { href: string; icon: IconName; label: string; match?: string[]; tour?: string; dot?: boolean; dotLabel?: string }) {
  const path = usePathname();
  const active = isActive(path, href) || (match ?? []).some((m) => isActive(path, m));
  return (
    <Link href={href} data-tour={tour} aria-current={active ? "page" : undefined} aria-label={dot && dotLabel ? dotLabel : undefined} style={{ textDecoration: "none", position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minHeight: 52, justifyContent: "center", fontSize: 11, fontWeight: active ? 600 : 450, color: active ? "var(--tinta)" : "#7A7D73" }}>
      {active ? <span aria-hidden="true" style={{ position: "absolute", top: -8, width: 22, height: 3, borderRadius: "0 0 3px 3px", background: "var(--amarillo)" }} /> : null}
      <span style={{ position: "relative", display: "flex" }}>
        <Icon name={icon} size={22} stroke={active ? 1.9 : 1.6} />
        {dot ? <span aria-hidden="true" style={{ position: "absolute", top: -2, right: -4, width: 9, height: 9, borderRadius: "50%", background: "var(--amarillo)", boxShadow: "0 0 0 1.5px var(--amarillo-oscuro), 0 0 0 3px var(--papel-2)" }} /> : null}
      </span>
      {label}
    </Link>
  );
}

/** Botón redondo de ícono (notificaciones, ayuda). */
export function IconLink({ href, icon, label, dot }: { href: string; icon: IconName; label: string; dot?: boolean }) {
  const active = isActive(usePathname(), href);
  return (
    <Link href={href} aria-label={label} title={label} aria-current={active ? "page" : undefined} style={{ textDecoration: "none", position: "relative", width: 38, height: 38, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--gris-2)", background: active ? "var(--seleccion)" : "transparent", flex: "none" }}>
      <Icon name={icon} size={19} />
      {dot ? <span aria-hidden="true" style={{ position: "absolute", top: 8, right: 9, width: 7, height: 7, borderRadius: "50%", background: "var(--amarillo)", boxShadow: "0 0 0 2px var(--papel-2)" }} /> : null}
    </Link>
  );
}
