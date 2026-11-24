"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { monthName } from "@/lib/engine";
import type { Locale } from "@/i18n";
import { analisisHref } from "./lib";
import type { AnalisisMessages } from "./messages";
import css from "./analisis.module.css";

/** Filtros por año (segmento) y mes (lista). Viven en la dirección para poder compartir o volver atrás. */
export function Filters({ years, year, month, current, locale, m }: { years: number[]; year: number; month: number | null; current: number; locale: Locale; m: AnalisisMessages }) {
  const router = useRouter();
  return (
    <div className={css.filters}>
      {years.length > 1 ? (
        <nav aria-label={m.year} className="seg">
          {years.map((y) => <Link key={y} href={analisisHref(y, month, current)} aria-current={y === year ? "page" : undefined}>{y}</Link>)}
        </nav>
      ) : null}
      <label htmlFor="mes" className="sr-only">{m.month}</label>
      <select id="mes" className={`select ${css.monthSelect}`} value={month ?? ""} onChange={(e) => router.push(analisisHref(year, e.target.value ? Number(e.target.value) : null, current))}>
        <option value="">{m.allYear}</option>
        {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{monthName(i + 1, locale)}</option>)}
      </select>
    </div>
  );
}
