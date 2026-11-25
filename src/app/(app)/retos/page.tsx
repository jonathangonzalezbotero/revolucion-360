import type { Metadata } from "next";
import Link from "next/link";
import { Empty, PageHeader } from "@/components/ui/basics";
import { requireUser } from "@/server/session";
import { M } from "./messages";
import { Retos } from "./Retos";
import { loadRetos } from "./server";

export const metadata: Metadata = { title: "Retos" };

/** Retos (desde Metas › "Ver todos los retos ›"): Activos, Disponibles y Terminados, y la tabla del grupo si el reto la tiene. */
export default async function RetosPage() {
  const s = await requireUser();
  const m = M[s.locale];
  const back = <Link href="/metas" style={{ fontSize: 14, fontWeight: 600 }}>{m.back}</Link>;
  if (s.config.menu.metas !== "on") {
    return (
      <main className="page">
        <PageHeader title={m.title} eyebrow={m.eyebrow} />
        <Empty icon="target" title={m.soonTitle} text={m.soonText}><Link href="/inicio" className="btn btn-secondary btn-sm">{m.goHome}</Link></Empty>
      </main>
    );
  }
  const data = await loadRetos(s);
  if (!data) {
    return (
      <main className="page">
        <PageHeader title={m.title} eyebrow={m.eyebrow}>{back}</PageHeader>
        <Empty icon="target" title={m.notReadyTitle} text={m.notReadyText} />
      </main>
    );
  }
  return <Retos data={data} m={m} canEdit={s.canEdit} />;
}
