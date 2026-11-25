import Image from "next/image";
import Link from "next/link";
import { fill } from "@/i18n";
import { monthName } from "@/lib/engine";
import { Ring } from "@/components/ui/basics";
import { Icon } from "@/components/ui/Icon";
import { ToastProvider } from "@/components/ui/client";
import { closureTarget } from "@/server/closure";
import type { MenuKey } from "@/server/config";
import type { Session } from "@/server/session";
import { IconLink, SideLink, TabLink } from "./NavLink";
import { TOUR_M } from "./messages";
import { Tour } from "./Tour";
import { tourSeen, tourStops } from "./tour-lib";
import type { IconName } from "@/components/ui/Icon";
import { freeMonths, usdShort } from "@/app/(app)/suscripcion/lib";
import { loadRetoSignal } from "@/app/(app)/retos/server";

/**
 * Retos (desde el 25 nov 2026) va arriba, junto a Inicio. No tiene interruptor propio en `app_config.menu`: sigue al de
 * Metas (la página, las acciones y el conteo de retos ya dependen de Metas), así que se ve, sale "Pronto" o se oculta con él.
 */
const ITEMS: { key: MenuKey | "inicio" | "retos"; href: string; icon: IconName; group: 0 | 1 | 2 }[] = [
  { key: "inicio", href: "/inicio", icon: "home", group: 0 },
  { key: "retos", href: "/retos", icon: "flag", group: 0 },
  { key: "plan", href: "/plan", icon: "plan", group: 0 },
  { key: "movimientos", href: "/movimientos", icon: "mov", group: 0 },
  { key: "cuentas", href: "/cuentas", icon: "wallet", group: 0 },
  { key: "metas", href: "/metas", icon: "target", group: 0 },
  { key: "proyeccion", href: "/proyeccion", icon: "trend", group: 1 },
  { key: "analisis", href: "/analisis", icon: "pie", group: 1 },
  { key: "deudas", href: "/deudas", icon: "receipt", group: 1 },
  { key: "inversiones", href: "/inversiones", icon: "bars", group: 1 },
  { key: "academia", href: "/academia", icon: "cap", group: 2 },
];

/** Marco de la app: menú lateral en escritorio, barra inferior en móvil. Admin decide qué secciones se ven. */
export async function AppShell({ s, children }: { s: Session; children: React.ReactNode }) {
  const t = s.t;
  const [{ data: pts }, { count: unread }, target, retos] = await Promise.all([
    s.supabase.from("point_events").select("points"),
    s.supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    closureTarget(s),
    loadRetoSignal(s), // retos activos y si falta el check-in de hoy (1 consulta, 2 si tiene retos; nunca lanza)
  ]);
  const points = (pts ?? []).reduce((a, r) => a + r.points, 0);
  const menuOf = (k: MenuKey | "retos") => s.config.menu[k === "retos" ? "metas" : k];
  const visible = ITEMS.filter((i) => i.key === "inicio" || menuOf(i.key) !== "off");
  const groups = [t.nav.groupMoney, t.nav.groupNumbers, t.nav.groupLearn];
  const initial = (s.profile.name || s.profile.email).trim().charAt(0).toUpperCase();
  const closeMonth = target ? monthName(target.month, s.locale).toLowerCase() : "";
  const yearFree = freeMonths(s.config.billing.monthlyCents, s.config.billing.yearlyCents);
  // Recorrido general: solo cuentas activas que pueden escribir (nunca sin activar ni en solo lectura; /admin no usa AppShell).
  const tourOn = s.active && s.canEdit && s.profile.onboardingStep === "done";

  return (
    <ToastProvider ptsLabel={t.nav.pts}>
      <div className="shell">
        <nav aria-label={t.nav.principal} className="sidenav">
          <div style={{ padding: "0 4px 10px 8px" }}>
            <Link href="/inicio" style={{ display: "flex", alignItems: "center" }}>
              <Image src="/brand/logo-360.webp" alt="Revolución 360 · Revolución del Dinero" width={900} height={219} priority style={{ height: 38, width: "auto", maxWidth: "100%", objectFit: "contain", objectPosition: "left center" }} />
            </Link>
          </div>
          {[0, 1, 2].map((g) => {
            const items = visible.filter((i) => i.group === g);
            if (items.length === 0) return null;
            return (
              <div key={g} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span className="eyebrow" style={{ padding: "18px 12px 6px" }}>{groups[g]}</span>
                {items.map((i) => (
                  <SideLink key={i.key} href={i.href} icon={i.icon} label={t.nav[i.key]} tour={i.key}
                    soon={i.key !== "inicio" && menuOf(i.key) === "soon"} soonLabel={t.nav.soon}
                    yellow={i.key === "retos" && retos.active > 0}
                    badge={i.key === "academia" && s.config.gamification ? <span className="pill pill-yellow num">{points} {t.nav.pts}</span>
                      : i.key === "retos" && retos.pending ? <RetoDot label={t.nav.retosPending} />
                      : i.key === "retos" && retos.active > 0 ? <span className="sr-only">{t.nav.retosActive}</span> : undefined} />
                ))}
              </div>
            );
          })}
          {target ? (
            <Link href="/cierre" data-tour="cierre" style={{ textDecoration: "none", marginTop: 18, display: "flex", alignItems: "center", gap: 12, padding: 12, borderRadius: 12, border: "1px solid var(--amarillo-borde)", background: "var(--amarillo-suave)", color: "var(--tinta)" }}>
              <Ring value={target.progress}>{target.overdue ? "!" : `${target.daysLeft}d`}</Ring>
              <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{fill(t.closeCta.title, { month: closeMonth })}</span>
                <span className="xs" style={{ color: "#6B5A10" }}>{target.daysLeft > 0 ? fill(t.closeCta.sub, { days: target.daysLeft }) : t.closeCta.subLast}</span>
              </span>
            </Link>
          ) : null}
          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8, paddingTop: 14, borderTop: "1px solid var(--linea)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Link href="/perfil" style={{ textDecoration: "none", color: "var(--tinta)", display: "flex", alignItems: "center", gap: 10, padding: 6, borderRadius: 10, flex: 1, minWidth: 0 }}>
                <span aria-hidden="true" className="avatar">{initial}</span>
                <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.profile.name || s.profile.email}</span>
                  <span className="xs" style={{ color: "var(--gris-3)" }}>{t.nav.perfil}</span>
                </span>
              </Link>
              <IconLink href="/notificaciones" icon="bell" label={t.nav.notificaciones} dot={(unread ?? 0) > 0} />
              <IconLink href="/ayuda" icon="help" label={t.nav.ayuda} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", padding: "0 2px" }}>
              <Link href="/suscripcion" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--gris-2)", fontWeight: 450, padding: "6px 8px" }}>
                <Icon name="card" size={17} color="var(--gris-3)" />{t.nav.suscripcion}
              </Link>
              {s.isAdmin ? (
                <Link href="/admin" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--gris-2)", fontWeight: 450, padding: "6px 8px" }}>
                  <Icon name="shield" size={17} color="var(--gris-3)" />{t.nav.admin}
                </Link>
              ) : null}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px 0" }}>
              <Image src="/brand/sello.png" alt="Revolución del Dinero" width={30} height={30} />
              <span style={{ fontSize: 11, color: "var(--gris-3)", lineHeight: 1.35 }}>{t.endorsement1}<br /><span style={{ color: "var(--tinta)", fontWeight: 600 }}>{t.endorsement2}</span></span>
            </div>
          </div>
        </nav>

        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          {!s.canEdit ? (
            <div className="banner" role="note" style={{ borderRadius: 0, flexWrap: "wrap", gap: 10 }}>
              <span><strong>{t.readOnly.title}.</strong> {t.readOnly.body}</span>
              {s.plan === "read_only" ? (
                // Mockup Bloqueo-movil: reactivar mensual o anual (montos de app_config.billing) y exportar. Suspendido: solo el aviso.
                <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
                  <Link href="/activar" className="btn btn-sm">{fill(t.readOnly.monthly, { price: usdShort(s.config.billing.monthlyCents) })}</Link>
                  <Link href="/activar?plan=anual" className="link" style={{ fontSize: 14, fontWeight: 600 }}>
                    {yearFree > 0 ? fill(t.readOnly.yearly, { price: usdShort(s.config.billing.yearlyCents), free: yearFree }) : fill(t.readOnly.yearlyPlain, { price: usdShort(s.config.billing.yearlyCents) })}
                  </Link>
                  <Link href="/perfil#privacidad" className="link" style={{ fontSize: 14, fontWeight: 600 }}>{t.readOnly.export}</Link>
                </span>
              ) : null}
            </div>
          ) : null}
          {children}
        </div>

        <nav aria-label={t.nav.principal} className="tabbar">
          <TabLink href="/inicio" icon="home" label={t.nav.inicio} tour="inicio" />
          {s.config.menu.plan !== "off" ? <TabLink href="/plan" icon="plan" label={t.nav.planShort} tour="plan" /> : null}
          {s.config.menu.movimientos !== "off" ? <TabLink href="/movimientos" icon="mov" label={t.nav.movimientos} tour="movimientos" /> : null}
          {s.config.menu.academia === "on" ? <TabLink href="/academia" icon="cap" label={t.nav.academia} /> : null}
          <TabLink href="/mas" icon="dots" label={t.nav.mas} tour="mas" dot={retos.pending} dotLabel={t.nav.masPending} match={["/retos", "/cuentas", "/metas", "/proyeccion", "/analisis", "/deudas", "/inversiones", "/cierre", "/diagnostico", "/suscripcion", "/perfil", "/notificaciones", "/ayuda"]} />
        </nav>
        {tourOn ? <Tour m={TOUR_M[s.locale]} stops={tourStops(s.config.menu)} autoStart={!tourSeen(s.profile.prefs)} /> : null}
      </div>
    </ToastProvider>
  );
}

/** Punto amarillo "Falta marcar hoy" (mockup InicioRetoB): el texto va oculto para el lector de pantalla y en el `title`. */
function RetoDot({ label }: { label: string }) {
  return (
    <span title={label} style={{ display: "flex", alignItems: "center" }}>
      <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--amarillo)", boxShadow: "0 0 0 1.5px var(--amarillo-oscuro)" }} />
      <span className="sr-only">{label}</span>
    </span>
  );
}
