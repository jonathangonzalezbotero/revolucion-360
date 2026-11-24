import Image from "next/image";
import Link from "next/link";
import { fill } from "@/i18n";
import { loadLegal } from "./data";
import { M } from "./messages";
import css from "./legal.module.css";

/** Términos o privacidad. Páginas públicas, sin el menú de la app. Las pestañas del mockup son enlaces entre las dos rutas. */
export async function LegalDoc({ doc }: { doc: "terms" | "privacy" }) {
  const { legal, locale, signedIn } = await loadLegal();
  const m = M[locale];
  const vars = { company: legal.company, abn: legal.abn, contact: legal.contact, address: legal.address };
  const sections = doc === "terms" ? m.termsSections : m.privacySections;
  return (
    <div className={css.page}>
      <div className={css.wrap}>
        <div className="row-between">
          <Link href={signedIn ? "/inicio" : "/entrar"} style={{ display: "flex" }}>
            <Image src="/brand/logo-360.png" alt={m.logoAlt} width={900} height={333} priority style={{ height: 40, width: "auto", maxWidth: "100%" }} />
          </Link>
          <Link href={signedIn ? "/perfil#privacidad" : "/entrar"} className={css.back}>{m.back}</Link>
        </div>
        <h1 className={css.title}>{m.title}</h1>
        <p className={css.lead}>{m.lead}</p>
        <div role="note" className={css.draft}><strong>{m.draftStrong}</strong> {m.draft}</div>
        <nav aria-label={m.tabs} className={css.tabs}>
          <Link href="/legal/terminos" aria-current={doc === "terms" ? "page" : undefined}>{m.terms}</Link>
          <Link href="/legal/privacidad" aria-current={doc === "privacy" ? "page" : undefined}>{m.privacy}</Link>
        </nav>
        <span className="small muted">{fill(m.updated, { date: legal.updated, version: legal.version })}</span>
        <div>
          {sections.map((sec, i) => (
            <section key={sec.h} id={`s${i}`} className={css.section}>
              <h2>{sec.h}</h2>
              <p>{fill(sec.p, vars)}</p>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
