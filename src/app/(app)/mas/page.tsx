import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { fill } from "@/i18n";
import { Icon, type IconName } from "@/components/ui/Icon";
import { monthName } from "@/lib/engine";
import { closureTarget } from "@/server/closure";
import type { MenuKey } from "@/server/config";
import { requireUser } from "@/server/session";
import { signOut } from "@/app/(auth)/actions";
import { M as PM } from "../perfil/messages";
import { M } from "./messages";
import css from "./mas.module.css";

export const metadata: Metadata = { title: "Más" };

type Row = { key: string; href: string; icon: IconName; label: string; sub: string; soon?: boolean };

/** Menú "Más" del celular: todo lo que no cabe en la barra inferior. En escritorio se ve como una lista simple. */
export default async function MasPage() {
  const s = await requireUser();
  const m = M[s.locale];
  const nav = s.t.nav;
  const [target, unreadRes] = await Promise.all([
    closureTarget(s),
    s.supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
  ]);
  if (unreadRes.error) throw new Error(`db: ${unreadRes.error.message}`);
  const unread = unreadRes.count ?? 0;
  const menu = s.config.menu;

  // Una sección del menú: oculta si está "off", sin enlace y con "Pronto" si está "soon".
  const section = (key: MenuKey, href: string, icon: IconName, sub: string): Row[] =>
    menu[key] === "off" ? [] : [{ key, href, icon, label: nav[key], sub, soon: menu[key] === "soon" }];

  const money: Row[] = [
    // Plan y Movimientos van en la barra inferior; solo aparecen aquí si están "Pronto" (la barra no los distingue).
    ...(menu.plan === "soon" ? section("plan", "/plan", "plan", m.sub.plan) : []),
    ...(menu.movimientos === "soon" ? section("movimientos", "/movimientos", "mov", m.sub.movimientos) : []),
    ...section("cuentas", "/cuentas", "wallet", m.sub.cuentas),
    ...section("metas", "/metas", "target", m.sub.metas),
    ...section("cierre", "/cierre", "check", target ? fill(m.sub.cierreTarget, { month: monthName(target.month, s.locale).toLowerCase() }) : m.sub.cierre),
  ];
  const numbers: Row[] = [
    ...section("proyeccion", "/proyeccion", "trend", m.sub.proyeccion),
    ...section("analisis", "/analisis", "pie", m.sub.analisis),
    ...section("deudas", "/deudas", "receipt", m.sub.deudas),
    ...section("inversiones", "/inversiones", "bars", m.sub.inversiones),
    { key: "diagnostico", href: "/diagnostico", icon: "spark", label: m.diagnostico, sub: m.sub.diagnostico },
    ...(s.canEdit ? [{ key: "asistente", href: "/asistente", icon: "wand" as IconName, label: m.asistente, sub: m.sub.asistente }] : []),
  ];
  // La barra inferior solo muestra Academia cuando está "on": si está "Pronto", este es su único lugar en el celular.
  const learn: Row[] = menu.academia === "soon" ? section("academia", "/academia", "cap", m.sub.academia) : [];
  const account: Row[] = [
    { key: "notificaciones", href: "/notificaciones", icon: "bell", label: nav.notificaciones, sub: unread === 0 ? m.sub.notifNone : unread === 1 ? m.sub.notifOne : fill(m.sub.notifUnread, { n: unread }) },
    { key: "perfil", href: "/perfil", icon: "user", label: nav.perfil, sub: m.sub.perfil },
    { key: "suscripcion", href: "/suscripcion", icon: "card", label: nav.suscripcion, sub: PM[s.locale].plan.states[s.entitlement.state] },
    { key: "ayuda", href: "/ayuda", icon: "help", label: nav.ayuda, sub: m.sub.ayuda },
    ...(s.isAdmin ? [{ key: "admin", href: "/admin", icon: "shield" as IconName, label: nav.admin, sub: m.sub.admin }] : []),
  ];
  const groups = [
    { title: nav.groupMoney, rows: money },
    { title: nav.groupNumbers, rows: numbers },
    { title: nav.groupLearn, rows: learn },
    { title: m.groupAccount, rows: account },
  ].filter((g) => g.rows.length > 0);

  return (
    <main className="page" style={{ maxWidth: 720 }}>
      <header className="page-header">
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span className="muted" style={{ fontSize: 13 }}>{m.eyebrow}</span>
          <h1>{m.title}</h1>
        </div>
      </header>
      {groups.map((g) => (
        <section key={g.title} aria-label={g.title} className={css.group}>
          <h2 className="eyebrow" style={{ margin: "8px 4px 0" }}>{g.title}</h2>
          <div className={css.list}>
            {g.rows.map((r) => {
              const inner = (
                <>
                  <span aria-hidden="true" className={css.icon}><Icon name={r.icon} size={19} color={r.soon ? "var(--gris-5)" : "var(--tinta)"} /></span>
                  <span className={css.text}><span className={css.label}>{r.label}</span><span className={css.sub}>{r.sub}</span></span>
                </>
              );
              return r.soon ? (
                <span key={r.key} aria-disabled="true" className={`${css.row} ${css.soon}`}>{inner}<span className="pill">{nav.soon}</span></span>
              ) : (
                <Link key={r.key} href={r.href} className={css.row}>{inner}<span aria-hidden="true" className={css.chev}>›</span></Link>
              );
            })}
            {g.title === m.groupAccount ? (
              <form action={signOut} style={{ display: "contents" }}>
                <button type="submit" className={css.row}>
                  <span aria-hidden="true" className={css.icon}><Icon name="out" size={19} /></span>
                  <span className={css.text}><span className={css.label}>{nav.salir}</span><span className={css.sub}>{m.sub.salir}</span></span>
                </button>
              </form>
            ) : null}
          </div>
        </section>
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 4px" }}>
        <Image src="/brand/sello.png" alt="Revolución del Dinero" width={36} height={36} />
        <span className="xs muted">{s.t.endorsement1} <strong style={{ color: "var(--tinta)" }}>{s.t.endorsement2}</strong></span>
      </div>
    </main>
  );
}
