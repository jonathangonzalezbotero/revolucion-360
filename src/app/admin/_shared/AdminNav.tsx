"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { Empty } from "@/components/ui/basics";
import { sectionOf, type AdminSection } from "../actividad/roles";
import css from "./admin.module.css";
import type { AdminText } from "./messages";

/**
 * Enlaces del panel en grupos plegables, en el orden del mockup (`Admin*.dc.html`). `section` decide quién lo ve (cada
 * subrol solo ve las suyas: `allowed`); `label` es la clave del texto. Un grupo sin enlaces visibles no se pinta.
 * - Grupos no está en el mockup, pero es la única entrada a /admin/grupos (Soporte lo usa): va con Usuarios y accesos.
 * - Retos y Conexiones web aún no tienen sección propia en `roles.ts`: Retos usa "menu" y Conexiones "crm" (las dos solo
 *   del Dueño) hasta que existan `retos` / `conexiones` ahí.
 */
export const ADMIN_HOME = { section: "resumen", label: "resumen", href: "/admin" } as const;
export const ADMIN_GROUPS = [
  { id: "pagos", label: "gUsuarios", links: [
    { section: "usuarios", label: "usuarios", href: "/admin/usuarios" },
    { section: "grupos", label: "grupos", href: "/admin/grupos" },
    { section: "planes", label: "planes", href: "/admin/planes" },
    { section: "soporte", label: "soporte", href: "/admin/soporte" },
  ] },
  { id: "app", label: "gApp", links: [
    { section: "menu", label: "menu", href: "/admin/menu" },
    { section: "academia", label: "academia", href: "/admin/academia" },
    { section: "retos", label: "retos", href: "/admin/retos" },
    { section: "paises", label: "paises", href: "/admin/paises" },
  ] },
  { id: "crm", label: "gCrm", links: [
    { section: "crm", label: "contactos", href: "/admin/crm" },
    { section: "crm", label: "campanas", href: "/admin/campanas" },
    { section: "crm", label: "automatizaciones", href: "/admin/automatizaciones" },
    { section: "crm", label: "conexiones", href: "/admin/conexiones" },
  ] },
  { id: "control", label: "gControl", links: [
    { section: "actividad", label: "actividad", href: "/admin/actividad" },
  ] },
] as const satisfies readonly { id: string; label: keyof AdminText["nav"]; links: readonly { section: AdminSection; label: keyof AdminText["nav"]; href: string }[] }[];

/** Todos los enlaces en orden (Resumen primero), como antes de los grupos. */
export const ADMIN_LINKS: readonly { section: AdminSection; label: keyof AdminText["nav"]; href: string }[] = [ADMIN_HOME, ...ADMIN_GROUPS.flatMap((g): readonly { section: AdminSection; label: keyof AdminText["nav"]; href: string }[] => g.links)];

// ───────── Grupos cerrados: se recuerdan en este navegador (localStorage); sin él, todo abierto ─────────
const STORE_KEY = "r360.admin.nav.closed";
const listeners = new Set<() => void>();
let memory: string | null = null;
function readClosed(): string {
  try { return window.localStorage.getItem(STORE_KEY) ?? ""; } catch { return ""; }
}
function writeClosed(ids: string[]) {
  try { window.localStorage.setItem(STORE_KEY, ids.join(",")); } catch { /* sin almacenamiento: solo dura esta vista */ }
  memory = ids.join(",");
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => { if (e.key === STORE_KEY) { memory = null; l(); } };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(l); window.removeEventListener("storage", onStorage); };
}
/** Devuelve el texto tal cual (no un arreglo nuevo) para que React compare sin bucles. */
const getSnapshot = () => (memory ??= readClosed());
const getServerSnapshot = () => "";

export function AdminNav({ t, allowed }: { t: AdminText["nav"]; allowed: readonly AdminSection[] }) {
  const path = usePathname() ?? "/admin";
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const closed = raw ? raw.split(",") : [];
  const active = (href: string) => (href === "/admin" ? path === "/admin" : path === href || path.startsWith(`${href}/`));
  const toggle = (id: string, open: boolean) => {
    const isClosed = closed.includes(id);
    if (open === !isClosed) return; // el evento también llega cuando React pone `open`: solo guardamos cambios reales
    writeClosed(open ? closed.filter((c) => c !== id) : [...closed, id]);
  };
  const link = (l: { label: keyof AdminText["nav"]; href: string }) => (
    <Link key={l.href} href={l.href} className={css.link} aria-current={active(l.href) ? "page" : undefined}>{t[l.label]}</Link>
  );
  return (
    <nav aria-label={t.label} className={css.nav}>
      <div className={css.brand}>
        <Image src="/brand/sello.png" alt="" width={38} height={38} style={{ width: 38, height: 38 }} />
        <span style={{ display: "flex", flexDirection: "column" }}><strong>{t.brand}</strong><span className={css.brandSub}>{t.admin}</span></span>
      </div>
      <Link href="/inicio" className={css.back}>{t.back}</Link>
      <div className={css.links}>
        {allowed.includes(ADMIN_HOME.section) ? link(ADMIN_HOME) : null}
        {ADMIN_GROUPS.map((g) => {
          const links = g.links.filter((l) => allowed.includes(l.section));
          if (links.length === 0) return null;
          return (
            <details key={g.id} className={css.group} open={!closed.includes(g.id)} onToggle={(e) => toggle(g.id, e.currentTarget.open)}>
              <summary className={css.groupTitle}>{t[g.label]}<span aria-hidden="true" className={css.chev}>▾</span></summary>
              <div className={css.groupLinks}>{links.map(link)}</div>
            </details>
          );
        })}
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
