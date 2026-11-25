import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { asLocale, fill } from "@/i18n";
import { crmDb } from "@/server/crm";
import { contactByToken, maskEmail, type TokenContact } from "@/server/crm/token";
import { M } from "./messages";
import { PrefsSwitches } from "./Prefs";
import css from "./preferencias.module.css";

export const metadata: Metadata = { title: "Tus correos", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * Preferencias de correo por token (enlaces "Elegir qué correos recibo" y "Darte de baja" de los correos de marketing).
 * Pública y sin sesión: el token al azar del contacto la autoriza. `?baja=1` pide confirmar la baja; `?hecho=1` la confirma.
 */
export default async function PreferenciasPage({ searchParams }: { searchParams: Search }) {
  const q = await searchParams;
  const t = one(q.t);
  let c: TokenContact | null = null;
  try { c = await contactByToken(crmDb(), t); } catch { c = null; }
  const m = M[c?.locale ?? asLocale((await cookies()).get("r360_locale")?.value)];
  const subscribed = !!c?.email_consent;

  let body: React.ReactNode;
  if (!c) {
    body = (
      <section className={css.card}>
        <h2 style={{ fontSize: 18 }}>{m.badTitle}</h2>
        <p className={css.note}>{m.badText}</p>
        <Link href="/entrar" className="btn btn-secondary" style={{ alignSelf: "flex-start" }}>{m.toApp}</Link>
      </section>
    );
  } else if (one(q.hecho) === "1") {
    body = (
      <section className={css.card} role="status">
        <h2 style={{ fontSize: 18 }}>{m.doneTitle}</h2>
        <p className={css.note}>{m.doneText} {m.account}</p>
        <Link href={`/correo/preferencias?t=${t}`} className="link" style={{ alignSelf: "flex-start", minHeight: 44, display: "inline-flex", alignItems: "center" }}>{m.confirmOther}</Link>
      </section>
    );
  } else if (one(q.baja) === "1" && subscribed) {
    body = (
      <section className={css.card}>
        <h2 style={{ fontSize: 18 }}>{m.confirmTitle}</h2>
        <p className={css.note}>{m.confirmText}</p>
        <form method="post" action="/api/crm/unsubscribe" className={css.actions}>
          <input type="hidden" name="t" value={t} />
          <input type="hidden" name="from" value="page" />
          <button className="btn">{m.confirmCta}</button>
          <Link href={`/correo/preferencias?t=${t}`} className="btn btn-secondary">{m.confirmOther}</Link>
        </form>
      </section>
    );
  } else {
    body = (
      <section className={css.card}>
        <PrefsSwitches m={m} token={t} email={subscribed} sms={c.sms_consent} phone={c.phone ? `••• ${c.phone.slice(-3)}` : null} />
        <p className={css.note}>{m.account}</p>
      </section>
    );
  }

  return (
    <div className={css.page}>
      <main className={css.wrap}>
        <Link href="/entrar" style={{ display: "flex" }}>
          <Image src="/brand/logo-360.webp" alt={m.logoAlt} width={900} height={219} priority style={{ height: 40, width: "auto", maxWidth: "100%" }} />
        </Link>
        <h1 className={css.title}>{m.title}</h1>
        {c ? <p className={css.lead}>{fill(m.lead, { email: maskEmail(c.email) })}</p> : null}
        {body}
      </main>
    </div>
  );
}
