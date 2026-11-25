"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Empty } from "@/components/ui/basics";
import { sectionOf, type AdminSection } from "../actividad/roles";
import css from "./admin.module.css";
import type { AdminText } from "./messages";

/** Secciones del panel, en el orden del mockup. Cada subrol solo ve las suyas (`allowed`). */
export const ADMIN_LINKS = [
  { key: "resumen", href: "/admin" },
  { key: "usuarios", href: "/admin/usuarios" },
  { key: "grupos", href: "/admin/grupos" },
  { key: "menu", href: "/admin/menu" },
  { key: "academia", href: "/admin/academia" },
  { key: "planes", href: "/admin/planes" },
  { key: "paises", href: "/admin/paises" },
  { key: "soporte", href: "/admin/soporte" },
  { key: "actividad", href: "/admin/actividad" },
] as const satisfies readonly { key: AdminSection; href: string }[];

/** CRM: diseñado, se construye después del cobro y el hábito. Se muestra sin enlace, solo al Dueño. */
const SOON = ["contactos", "campanas", "automatizaciones"] as const;

export function AdminNav({ t, allowed, showSoon }: { t: AdminText["nav"]; allowed: readonly AdminSection[]; showSoon: boolean }) {
  const path = usePathname() ?? "/admin";
  const active = (href: string) => (href === "/admin" ? path === "/admin" : path === href || path.startsWith(`${href}/`));
  const links = ADMIN_LINKS.filter((l) => allowed.includes(l.key));
  const item = (l: (typeof ADMIN_LINKS)[number]) => (
    <Link key={l.key} href={l.href} className={css.link} aria-current={active(l.href) ? "page" : undefined}>{t[l.key]}</Link>
  );
  return (
    <nav aria-label={t.label} className={css.nav}>
      <div className={css.brand}>
        <Image src="/brand/sello.png" alt="" width={38} height={38} style={{ width: 38, height: 38 }} />
        <span style={{ display: "flex", flexDirection: "column" }}><strong>{t.brand}</strong><span className={css.brandSub}>{t.admin}</span></span>
      </div>
      <Link href="/inicio" className={css.back}>{t.back}</Link>
      <div className={css.links}>
        {links.filter((l) => l.key !== "soporte" && l.key !== "actividad").map(item)}
        {showSoon ? SOON.map((k) => (
          <span key={k} className={css.link} aria-disabled="true" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, color: "var(--oscuro-texto-3)", cursor: "default" }}>
            {t[k]}<span style={{ fontSize: 11, fontWeight: 600, color: "var(--oscuro-texto-3)" }}>{t.soon}</span>
          </span>
        )) : null}
        {links.filter((l) => l.key === "soporte" || l.key === "actividad").map(item)}
      </div>
      <p className={css.note}>{t.privacy}</p>
    </nav>
  );
}

/**
 * Si la ruta es de una sección que el subrol no usa, no se pinta. Es solo la capa visible: la página ya
 * redirige por servidor (`requireAdmin` lee la ruta) y la base bloquea los datos.
 */
export function SectionGate({ t, allowed, children }: { t: AdminText["nav"]; allowed: readonly AdminSection[]; children: React.ReactNode }) {
  const section = sectionOf(usePathname() ?? "/admin");
  if (section && !allowed.includes(section)) {
    return (
      <main className={css.page}>
        <Empty icon="lock" title={t.noAccess} text={t.noAccessSub}><Link href="/admin" className="btn btn-secondary btn-sm">{t.toResumen}</Link></Empty>
      </main>
    );
  }
  return <>{children}</>;
}
