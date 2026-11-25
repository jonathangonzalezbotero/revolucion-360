import type { Metadata } from "next";
import Link from "next/link";
import { Empty, PageHeader } from "@/components/ui/basics";
import { cardDebt, cashToday, expectedBalance, netWorth } from "@/lib/engine";
import { loadAccounts, loadCategories, loadTx, must } from "@/server/data";
import { requireUser } from "@/server/session";
import { term } from "@/server/terms";
import { Cuentas, type AccountView } from "./Cuentas";
import { M } from "./messages";
import { movMode } from "@/lib/engine/registro";

export const metadata: Metadata = { title: "Cuentas" };

export default async function CuentasPage() {
  const s = await requireUser();
  const m = M[s.locale];
  if (s.config.menu.cuentas !== "on") {
    return (
      <main className="page">
        <PageHeader title={m.title} eyebrow={m.eyebrow} />
        <Empty icon="wallet" title={m.soonTitle} text={m.soonText}><Link href="/inicio" className="btn btn-secondary btn-sm">{m.goHome}</Link></Empty>
      </main>
    );
  }

  const [accounts, categories] = await Promise.all([loadAccounts(s), loadCategories(s)]);
  const since = accounts.reduce((min, a) => (a.balanceDate < min ? a.balanceDate : min), s.today);
  const [txs, lasts] = await Promise.all([
    accounts.length ? loadTx(s, since, s.today) : Promise.resolve([]),
    Promise.all(accounts.map(async (a) => must(await s.supabase.from("transactions").select("id, description, amount_cents, kind, category_id")
      .eq("account_id", a.id).is("deleted_at", null).eq("is_split", false).order("date", { ascending: false }).order("created_at", { ascending: false }).limit(4)))),
  ]);
  // Saldo esperado: las transferencias SÍ mueven la cuenta; solo se excluye el padre de un movimiento dividido (cuentan sus partes).
  const moving = txs.filter((t) => !t.isSplit);
  const cat = new Map(categories.map((c) => [c.id, c.name]));

  const views: AccountView[] = accounts.map((a, i) => ({
    id: a.id, name: a.name, institution: a.institution, kind: a.kind, balanceCents: a.balanceCents, balanceDate: a.balanceDate,
    inNetworth: a.inNetworth, inForecast: a.inForecast, isEmergencyFund: a.isEmergencyFund,
    expectedCents: expectedBalance(a, moving),
    // Sin movimientos por cuenta no hay con qué comparar: el aviso solo sale si el usuario los registra.
    reconcile: movMode(s.profile.movLevel) === "diario" || lasts[i].length > 0,
    last: lasts[i].map((t) => ({ id: t.id, title: t.description || m.noCategory, sub: t.kind === "transfer" ? m.between : (t.category_id && cat.get(t.category_id)) || m.noCategory, amountCents: t.amount_cents })),
  }));

  return (
    <Cuentas
      accounts={views} fmt={s.fmt} locale={s.locale} canEdit={s.canEdit} m={m} t={s.t.actions}
      totals={{ net: netWorth(accounts), avail: cashToday(accounts), cards: cardDebt(accounts), businessOut: accounts.some((a) => a.kind === "business" && !a.inNetworth) }}
      company={term(s, "company")} auRule={s.profile.country === "AU"} companyHref={s.config.menu.deudas === "on" ? "/deudas#empresa" : null}
      movHref={s.config.menu.movimientos === "on" ? "/movimientos" : null}
    />
  );
}
