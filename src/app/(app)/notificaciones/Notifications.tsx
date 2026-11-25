"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { fill } from "@/i18n";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/client";
import { markAllRead, markRead, removeNotif } from "./actions";
import { CATEGORIES, categoryOf, ctaOf, matches, sortNotifs, type Category, type Group, type Kind } from "./lib";
import type { NotifMessages } from "./messages";
import css from "./notificaciones.module.css";

export type NotifView = { id: string; kind: Kind; title: string; body: string; href: string | null; unread: boolean; createdAt: string; group: Group; time: string };

const LOOK: Record<Kind, { icon: IconName; bg: string; fg: string }> = {
  cierre: { icon: "check", bg: "var(--ambar-fondo)", fg: "var(--ambar-texto)" },
  // Color por filtro, como el mockup: Recordatorios ámbar, Logros amarillo, Academia verde, Cuenta azul.
  pago: { icon: "bell", bg: "var(--ambar-fondo)", fg: "var(--ambar-texto)" },
  habito: { icon: "flame", bg: "var(--ambar-fondo)", fg: "var(--ambar-texto)" },
  logro: { icon: "spark", bg: "var(--amarillo-pastel)", fg: "var(--amarillo-texto)" },
  reto: { icon: "flame", bg: "var(--amarillo-pastel)", fg: "var(--amarillo-texto)" },
  academia: { icon: "cap", bg: "var(--verde-fondo)", fg: "var(--tinta)" },
  acceso: { icon: "card", bg: "var(--azul-fondo)", fg: "var(--azul-oscuro)" },
  sistema: { icon: "shield", bg: "var(--azul-fondo)", fg: "var(--azul-oscuro)" },
};
const GROUPS: Group[] = ["today", "week", "older"];
type ChipFilter = "all" | "unread" | Category;

export function Notifications({ items, m }: { items: NotifView[]; m: NotifMessages }) {
  const router = useRouter();
  const toast = useToast();
  const [filter, setFilter] = useState<ChipFilter>("all");
  const [read, setRead] = useState<Set<string>>(new Set());
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [, start] = useTransition();

  const list = items.filter((n) => !gone.has(n.id)).map((n) => (read.has(n.id) ? { ...n, unread: false } : n));
  const unread = list.filter((n) => n.unread).length;
  const visible = sortNotifs(list.filter((n) => matches(n, filter)));
  const groups = GROUPS.map((g) => ({ g, list: visible.filter((n) => n.group === g) })).filter((g) => g.list.length > 0);
  const filters: ChipFilter[] = ["all", "unread", ...CATEGORIES.filter((c) => items.some((n) => categoryOf(n.kind) === c))];

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, onOk: () => void, msg?: string) => start(async () => {
    setError("");
    const r = await fn();
    if (!r.ok) return setError(r.error ?? "");
    onOk();
    if (msg) toast(msg);
  });
  const readOne = (id: string) => act(() => markRead(id), () => setRead((s) => new Set(s).add(id)));
  const open = (n: NotifView) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!n.unread || !n.href) return;
    e.preventDefault();
    const href = n.href;
    setRead((s) => new Set(s).add(n.id));
    start(async () => { await markRead(n.id); router.push(href); });
  };

  const ctaText = (href: string, kind: Kind) => { const c = ctaOf(href); return c ? m.ctaHref[c] : m.cta[kind]; };
  const unreadText = unread === 0 ? m.unreadNone : unread === 1 ? m.unreadOne : fill(m.unread, { n: unread });
  return (
    <main className="page" style={{ maxWidth: 920 }}>
      <header className="page-header">
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="muted" style={{ fontSize: 14 }}>{unreadText}</span>
          <h1>{m.title}</h1>
        </div>
        {unread > 0 ? (
          <button type="button" className={`btn btn-secondary ${css.allRead}`} onClick={() => act(() => markAllRead(), () => setRead(new Set(list.map((n) => n.id))), m.doneAll)}>
            <span className="only-desktop">{m.allRead}</span><span className="only-mobile">{m.allReadShort}</span>
          </button>
        ) : null}
      </header>

      {items.length > 0 ? (
        <div role="radiogroup" aria-label={m.filter} className={css.chips}>
          {filters.map((f) => (
            <button key={f} type="button" role="radio" aria-checked={filter === f} className={css.chip} onClick={() => setFilter(f)}>{m.filters[f]}</button>
          ))}
        </div>
      ) : null}

      {error ? <p role="alert" className={css.alert}>{error}</p> : null}

      {groups.map(({ g, list: rows }) => (
        <section key={g} aria-labelledby={`g-${g}`} className={css.group}>
          <h2 id={`g-${g}`} className={css.groupTitle}>{m.groups[g]}</h2>
          <ul className={css.list}>
            {rows.map((n) => {
              const look = LOOK[n.kind];
              return (
                <li key={n.id} className={css.item} data-unread={n.unread || undefined}>
                  <span aria-hidden="true" className={css.icon} style={{ background: look.bg, color: look.fg }}><Icon name={look.icon} size={20} color="currentColor" /></span>
                  <div className={css.body}>
                    <div className={css.head}><strong style={{ fontWeight: n.unread ? 600 : 500 }}>{n.title}</strong><span className={css.time}>{n.time}</span></div>
                    {n.body ? <span className={css.text}>{n.body}</span> : null}
                    <div className={css.actions}>
                      {n.href ? <Link href={n.href} onClick={open(n)} className={css.cta}>{ctaText(n.href, n.kind)} ›</Link> : null}
                      {n.unread ? <button type="button" className={css.textBtn} onClick={() => readOne(n.id)}>{m.markRead}</button> : null}
                      <button type="button" className={css.textBtn} onClick={() => act(() => removeNotif(n.id), () => setGone((s) => new Set(s).add(n.id)), m.removed)}>{m.remove}</button>
                    </div>
                  </div>
                  {n.unread ? <span role="img" aria-label={m.unreadDot} className={css.dot} /> : null}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {groups.length === 0 ? (
        <div className={css.empty}>
          <span>{filter === "all" || list.length === 0 ? m.empty : m.emptyFilter}</span>
          {filter !== "all" && list.length > 0 ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => setFilter("all")}>{m.seeAll}</button> : null}
        </div>
      ) : null}

      <p className="small muted" style={{ margin: 0 }}>{m.prefs1} <Link href="/perfil#notificaciones" style={{ fontWeight: 600, color: "var(--tinta)" }}>{m.prefs2}</Link>.</p>
    </main>
  );
}
