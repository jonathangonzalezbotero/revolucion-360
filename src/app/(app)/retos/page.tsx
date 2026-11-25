import type { Metadata } from "next";
import Link from "next/link";
import { Empty, PageHeader } from "@/components/ui/basics";
import { requireUser } from "@/server/session";
import { M } from "./messages";
import { Retos } from "./Retos";
import { loadRetos } from "./server";

export const metadata: Metadata = { title: "Retos" };

/** Retos (menú: junto a Inicio en escritorio, primero en "Más" en el celular; Inicio › "Ver reto ›"): Activos, Disponibles y Terminados, y la tabla del grupo si el reto la tiene. */
export default async function RetosPage({ searchParams }: { searchParams: Promise<{ reto?: string | string[] }> }) {
  const s = await requireUser();
  const m = M[s.locale];
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
        <PageHeader title={m.title} eyebrow={m.eyebrow} />
        <Empty icon="target" title={m.notReadyTitle} text={m.notReadyText} />
      </main>
    );
  }
  // "Ver reto ›" en Inicio abre aquí el reto (`?reto=<id>`): se resalta y se lleva la vista hasta él.
  const q = (await searchParams).reto;
  const focus = typeof q === "string" ? q : "";
  return <Retos data={data} m={m} canEdit={s.canEdit} focus={data.active.some((a) => a.challengeId === focus) ? focus : ""} />;
}
