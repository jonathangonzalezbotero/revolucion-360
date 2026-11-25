import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Empty, PageHeader } from "@/components/ui/basics";
import { loadAccounts, loadCategories, must } from "@/server/data";
import { requireUser } from "@/server/session";
import type { SavedFormat } from "./lib";
import { M } from "./messages";
import { Wizard } from "./Wizard";

export const metadata: Metadata = { title: "Importar CSV" };

export default async function ImportarPage() {
  const s = await requireUser();
  const m = M[s.locale];
  if (s.config.menu.movimientos === "off") redirect("/inicio");

  const header = (
    <PageHeader title={m.title} eyebrow={m.eyebrow}>
      <Link href="/movimientos" style={{ fontSize: 14, fontWeight: 600 }}>{m.back}</Link>
    </PageHeader>
  );
  const gate = (body: React.ReactNode) => <main className="page">{header}{body}</main>;

  if (!s.config.flags.csv || s.config.menu.movimientos === "soon") {
    return gate(<Empty icon="upload" title={m.gate.offTitle} text={m.gate.offText}><Link href="/movimientos" className="btn btn-secondary btn-sm">{m.gate.offCta}</Link></Empty>);
  }
  if (!s.canEdit) {
    return gate(<Empty icon="lock" title={s.t.readOnly.title} text={m.gate.roText}><Link href="/suscripcion" className="btn btn-secondary btn-sm">{m.gate.roCta}</Link></Empty>);
  }

  const [accounts, categories, formats] = await Promise.all([
    loadAccounts(s), loadCategories(s),
    s.supabase.from("csv_formats").select("bank, mapping").order("updated_at", { ascending: false }),
  ]);
  if (accounts.length === 0) {
    return gate(<Empty icon="wallet" title={m.gate.noAccTitle} text={m.gate.noAccText}><Link href="/cuentas" className="btn btn-secondary btn-sm">{m.gate.noAccCta}</Link></Empty>);
  }

  return (
    <main className="page">
      {header}
      <Wizard
        accounts={accounts.map((a) => ({ id: a.id, name: a.name, kind: a.kind, institution: a.institution }))}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        formats={must(formats).map((f) => ({ bank: f.bank, mapping: f.mapping as unknown as SavedFormat }))}
        cfg={s.config.matching} fmt={s.fmt} locale={s.locale} t={m}
      />
      <p className="xs muted" style={{ margin: 0 }}>{m.footer}</p>
    </main>
  );
}
