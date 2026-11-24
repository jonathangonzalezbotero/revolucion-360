import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { asLocale } from "@/i18n";
import { M } from "./messages";
import css from "./auth.module.css";

// Entrar a la app: uno de los pocos lugares donde va el bloque oscuro.
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const m = M[asLocale((await cookies()).get("r360_locale")?.value)];
  return (
    <div className={css.wrap}>
      <aside className={css.aside}>
        <Image src="/brand/logo-360-dark.png" alt="Revolución 360 · Revolución del Dinero" width={900} height={333} priority style={{ height: 48, width: "auto", alignSelf: "flex-start" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: 480 }}>
          <p className="big" style={{ fontSize: 40, lineHeight: 1.12 }}>{m.hero1} <span style={{ color: "var(--amarillo)" }}>{m.hero2}</span></p>
          <figure style={{ margin: 0, display: "flex", gap: 14, alignItems: "flex-start" }}>
            <div role="img" aria-label={m.photoAlt} style={{ width: 56, height: 56, borderRadius: "50%", flex: "none", background: "rgba(255,255,255,.12)", border: "1px dashed rgba(255,255,255,.5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "var(--oscuro-texto-2)" }}>{m.photo}</div>
            <blockquote style={{ margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              <p style={{ fontSize: 16, color: "var(--linea)", lineHeight: 1.55 }}>&ldquo;{m.quote}&rdquo;</p>
              <figcaption style={{ fontSize: 13, color: "var(--oscuro-texto-3)" }}>{m.quoteBy}</figcaption>
            </blockquote>
          </figure>
        </div>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 14 }}>
          {m.trust.map(([title, text]) => (
            <li key={title} style={{ display: "flex", gap: 12 }}>
              <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--amarillo)", marginTop: 7, flex: "none" }} />
              <span style={{ display: "flex", flexDirection: "column", gap: 2 }}><strong style={{ fontSize: 14 }}>{title}</strong><span style={{ fontSize: 13, color: "var(--oscuro-texto)" }}>{text}</span></span>
            </li>
          ))}
        </ul>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Image src="/brand/sello-dark.png" alt="Revolución del Dinero" width={40} height={40} />
          <span style={{ fontSize: 12, color: "var(--oscuro-texto)" }}>{m.endorsement} <strong style={{ color: "var(--blanco)" }}>Revolución del Dinero</strong></span>
        </div>
      </aside>
      <main className={css.main}>
        <div className={css.mobileLogo}>
          <Image src="/brand/logo-360.png" alt="Revolución 360 · Revolución del Dinero" width={900} height={333} priority style={{ height: 36, width: "auto" }} />
        </div>
        <div className={css.box}>{children}</div>
        <p className={css.footDesktop}>app.revoluciondeldinero.com · <Link href="/legal/terminos">{m.terms}</Link> · <Link href="/legal/privacidad">{m.privacy}</Link></p>
        <p className={css.footMobile}>{m.footMobile} · <Link href="/legal/privacidad">{m.privacy}</Link></p>
      </main>
    </div>
  );
}
