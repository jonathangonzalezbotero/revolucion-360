"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";

const isActive = (path: string, href: string) => path === href || path.startsWith(href + "/");

/** Enlace del menú lateral: seleccionado con fondo y marca amarilla. */
export function SideLink({ href, icon, label, badge, soon, soonLabel }: { href: string; icon: IconName; label: string; badge?: React.ReactNode; soon?: boolean; soonLabel?: string }) {
  const active = isActive(usePathname(), href);
  const base: React.CSSProperties = { textDecoration: "none", position: "relative", display: "flex", alignItems: "center", gap: 11, padding: "8px 12px", borderRadius: 8, fontSize: 14 };
  if (soon) {
    return (
      <span aria-disabled="true" style={{ ...base, fontWeight: 450, color: "var(--gris-4)" }}>
        <Icon name={icon} color="var(--gris-5)" />{label}
        <span className="pill" style={{ marginLeft: "auto" }}>{soonLabel}</span>
      </span>
    );
  }
  return (
    <Link href={href} aria-current={active ? "page" : undefined} style={{ ...base, fontWeight: active ? 600 : 450, background: active ? "var(--seleccion)" : "transparent", color: active ? "var(--tinta)" : "var(--gris-2)" }}>
      {active ? <span aria-hidden="true" style={{ position: "absolute", left: -16, top: 8, bottom: 8, width: 3, borderRadius: "0 3px 3px 0", background: "var(--amarillo)" }} /> : null}
      <Icon name={icon} color={active ? "var(--tinta)" : "var(--gris-3)"} />{label}
      {badge ? <span style={{ marginLeft: "auto" }}>{badge}</span> : null}
    </Link>
  );
}

/** Pestaña de la barra inferior en móvil. */
export function TabLink({ href, icon, label, match }: { href: string; icon: IconName; label: string; match?: string[] }) {
  const path = usePathname();
  const active = isActive(path, href) || (match ?? []).some((m) => isActive(path, m));
  return (
    <Link href={href} aria-current={active ? "page" : undefined} style={{ textDecoration: "none", position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minHeight: 52, justifyContent: "center", fontSize: 11, fontWeight: active ? 600 : 450, color: active ? "var(--tinta)" : "#7A7D73" }}>
      {active ? <span aria-hidden="true" style={{ position: "absolute", top: -8, width: 22, height: 3, borderRadius: "0 0 3px 3px", background: "var(--amarillo)" }} /> : null}
      <Icon name={icon} size={22} stroke={active ? 1.9 : 1.6} />{label}
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
