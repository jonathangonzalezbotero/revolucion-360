"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Empty } from "@/components/ui/basics";
import { sectionOf, type AdminSection } from "../actividad/roles";
import css from "./admin.module.css";
import type { AdminText } from "./messages";

/**
 * Enlaces del panel, en el orden del mockup. `section` decide quién lo ve (cada subrol solo ve las suyas: `allowed`);
 * `label` es la clave del texto. Las tres pantallas del CRM son una sola sección ("crm": solo el Dueño).
 */
export const ADMIN_LINKS = [
  { section: "resumen", label: "resumen", href: "/admin" },
  { section: "usuarios", label: "usuarios", href: "/admin/usuarios" },
  { section: "grupos", label: "grupos", href: "/admin/grupos" },
  { section: "menu", label: "menu", href: "/admin/menu" },
  { section: "academia", label: "academia", href: "/admin/academia" },
  { section: "planes", label: "planes", href: "/admin/planes" },
  { section: "paises", label: "paises", href: "/admin/paises" },
  { section: "crm", label: "contactos", href: "/admin/crm" },
  { section: "crm", label: "campanas", href: "/admin/campanas" },
  { section: "crm", label: "automatizaciones", href: "/admin/automatizaciones" },
  { section: "soporte", label: "soporte", href: "/admin/soporte" },
  { section: "actividad", label: "actividad", href: "/admin/actividad" },
] as const satisfies readonly { section: AdminSection; label: keyof AdminText["nav"]; href: string }[];

export function AdminNav({ t, allowed }: { t: AdminText["nav"]; allowed: readonly AdminSection[] }) {
  const path = usePathname() ?? "/admin";
  const active = (href: string) => (href === "/admin" ? path === "/admin" : path === href || path.startsWith(`${href}/`));
  return (
    <nav aria-label={t.label} className={css.nav}>
      <div className={css.brand}>
        <Image src="/brand/sello.png" alt="" width={38} height={38} style={{ width: 38, height: 38 }} />
        <span style={{ display: "flex", flexDirection: "column" }}><strong>{t.brand}</strong><span className={css.brandSub}>{t.admin}</span></span>
      </div>
      <Link href="/inicio" className={css.back}>{t.back}</Link>
      <div className={css.links}>
        {ADMIN_LINKS.filter((l) => allowed.includes(l.section)).map((l) => (
          <Link key={l.href} href={l.href} className={css.link} aria-current={active(l.href) ? "page" : undefined}>{t[l.label]}</Link>
        ))}
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
