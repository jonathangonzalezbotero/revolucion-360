"use client";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { fill } from "@/i18n";
import { useToast } from "@/components/ui/client";
import { ILLU } from "@/lib/images";
import { checkIn } from "../retos/actions";
import type { RetosMessages } from "../retos/messages";
import type { ActiveView } from "../retos/server";
import type { M } from "./messages";
import css from "./reto.module.css";

type T = (typeof M)["es"]["reto"];

/**
 * "Reto de hoy · ¿Lo cumpliste?" (mockup InicioRetoB, opción B). Va arriba en Inicio cuando hay un reto activo.
 * "Sí, lo hice" / "Hoy no" usan la misma acción que /retos (`checkIn`): una marca por día, la base pone las reglas.
 */
export function RetoToday({ r, t, rm, canEdit }: { r: ActiveView; t: T; rm: RetosMessages; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const mark = (done: boolean) => start(async () => {
    const res = await checkIn({ memberId: r.memberId, done });
    if (!res.ok) { toast(res.error); return; }
    toast(res.data.text, res.points, ILLU.celRacha);
    router.refresh();
  });
  const cols = Math.min(r.dots.length, 30), colsM = Math.min(r.dots.length, 15);
  const ask = r.mode === "ask" && canEdit;
  const note = r.mode === "yes" ? rm.marked : r.mode === "no" ? rm.skipped : r.mode === "auto" ? rm.auto : r.mode === "before" ? r.startsText : "";

  return (
    <section aria-labelledby="reto-hoy" className={css.card}>
      <div className={css.left}>
        <div className={css.top}>
          <Image src={r.img} alt="" aria-hidden="true" width={104} height={104} sizes="104px" className={css.img} />
          <div className={css.head}>
            <span className={css.eyebrow}>{t.eyebrow}</span>
            <h2 id="reto-hoy" className={css.title}>{r.title}</h2>
            <span className={css.how}>{r.how}</span>
          </div>
        </div>
        <div className={css.progRow}>
          <span className={css.progLabel}>{t.progress}</span>
          <span className={`num ${css.prog}`}>{r.progress}</span>
        </div>
        <div role="img" aria-label={`${r.dotsLabel}: ${r.progress}`} className={css.dots} style={{ "--cols": cols, "--cols-m": colsM } as React.CSSProperties}>
          {r.dots.map((d, i) => <span key={i} className={css.dot} data-s={d} />)}
        </div>
        <div className={css.meta}>
          {r.daily && r.wildLeft > 0 ? <span>{t.wild} <strong className="num">{r.wildLeft}</strong></span> : null}
          <span>{t.prize} <span className="pill pill-yellow num">{r.prize}</span></span>
          <Link href={`/retos?reto=${r.challengeId}`} className={css.see} aria-label={fill(t.seeAria, { name: r.title })}>{t.see}</Link>
        </div>
      </div>
      {ask || note ? (
        <div className={css.right}>
          {ask ? (
            <div className={css.ask}>
              <span className={css.askText}><strong>{rm.ask}</strong><span className={css.askSub}>{t.askSub}</span></span>
              <div className={css.buttons}>
                <button type="button" className={css.yes} disabled={pending} onClick={() => mark(true)}>{rm.yes}</button>
                <button type="button" className={css.no} disabled={pending} onClick={() => mark(false)}>{rm.no}</button>
              </div>
            </div>
          ) : (
            <div role="status" className={css.note}>{note}</div>
          )}
        </div>
      ) : null}
    </section>
  );
}
