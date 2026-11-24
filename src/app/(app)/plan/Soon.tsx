import Link from "next/link";
import { Empty, PageHeader } from "@/components/ui/basics";

/** Aviso cuando el admin dejó el Plan anual en "Pronto" u oculto. */
export function Soon({ title, t }: { title: string; t: { title: string; text: string; cta: string } }) {
  return (
    <main className="page">
      <PageHeader title={title} />
      <Empty icon="plan" title={t.title} text={t.text}><Link href="/inicio" className="btn btn-secondary btn-sm">{t.cta}</Link></Empty>
    </main>
  );
}
