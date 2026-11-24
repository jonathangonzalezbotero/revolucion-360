"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import css from "./admin.module.css";
import type { AdminText } from "./messages";

/** Secciones del panel. Las de la parte 2 (menú, academia, planes, países) se enlazan aunque aún no existan. */
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
] as const;

export function AdminNav({ t }: { t: AdminText["nav"] }) {
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
        {ADMIN_LINKS.map((l) => (
          <Link key={l.key} href={l.href} className={css.link} aria-current={active(l.href) ? "page" : undefined}>{t[l.key]}</Link>
        ))}
      </div>
      <p className={css.note}>{t.privacy}</p>
    </nav>
  );
}
