"use client";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { fill } from "@/i18n";
import { Switch, useToast } from "@/components/ui/client";
import { ILLU } from "@/lib/images";
import type { Result } from "@/server/action";
import { checkIn, joinChallenge, leaveChallenge, setBoard } from "./actions";
import type { RetosMessages } from "./messages";
import css from "./retos.module.css";
import type { ActiveView, RetosData } from "./server";

type Tab = "act" | "av" | "fin";
const TABS: Tab[] = ["act", "av", "fin"];

export function Retos({ data, m, canEdit }: { data: RetosData; m: RetosMessages; canEdit: boolean }) {
  const [tab, setTab] = useState<Tab>("act");
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  const go = (fn: () => Promise<Result<{ text: string }>>, after?: () => void) => start(async () => {
    const r = await fn();
    if (!r.ok) { toast(r.error); return; }
    toast(r.data.text, r.points, ILLU.celRacha);
    after?.();
    router.refresh();
  });

  return (
    <main className="page">
      <header className={css.head}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className={css.eyebrow}><span className="only-desktop">{m.eyebrow}</span><span className="only-mobile">{m.eyebrowShort}</span></span>
          <h1 className={css.title}>{m.title}</h1>
        </div>
        <Link href="/metas" className={css.back}><span className="only-desktop">{m.back}</span><span className="only-mobile">{m.backShort}</span></Link>
      </header>

      <div role="radiogroup" aria-label={m.tabsLabel} className={css.tabs}>
        {TABS.map((t) => (
          <button key={t} type="button" role="radio" aria-checked={tab === t} className={css.tab} onClick={() => setTab(t)}>{m.tabs[t]}</button>
        ))}
      </div>

      <div className={css.grid}>
        <div className={css.col}>
          {tab === "act" ? (
            data.active.length ? data.active.map((r) => (
              <ActiveCard key={r.memberId} r={r} m={m} canEdit={canEdit} pending={pending}
                onYes={() => go(() => checkIn({ memberId: r.memberId, done: true }))}
                onNo={() => go(() => checkIn({ memberId: r.memberId, done: false }))}
                onLeave={() => go(() => leaveChallenge({ memberId: r.memberId }))} />
            )) : <p className={css.empty}>{m.noAct}</p>
          ) : null}

          {tab === "av" ? (
            data.available.length ? (
              <div className={css.avGrid}>
                {data.available.map((r) => (
                  <article key={r.challengeId} className={css.av}>
                    <Image src={r.img} alt="" aria-hidden="true" width={96} height={96} sizes="96px" className={css.avImg} />
                    <span className={css.who}>{r.who}</span>
                    <strong className={css.avTitle}>{r.title}</strong>
                    <span className={css.avHow}>{r.how}</span>
                    <span className={css.avMeta}>{r.start} · {m.prize} <strong>{r.prize}</strong></span>
                    {canEdit ? (
                      <button type="button" className={css.join} disabled={pending}
                        onClick={() => go(async () => joinChallenge({ challengeId: r.challengeId }), () => setTab("act"))}>{m.join}</button>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : <p className={css.empty}>{m.noAv}</p>
          ) : null}

          {tab === "fin" ? (
            data.finished.length ? (
              <ul className={css.fin}>
                {data.finished.map((f) => (
                  <li key={f.memberId} className={css.finRow}>
                    <Image src={ILLU.celMeta} alt="" aria-hidden="true" width={56} height={56} sizes="56px" className={css.finImg} />
                    <span className={css.finText}><strong className={css.finTitle}>{f.title}</strong><span className={css.finDetail}>{f.detail}</span></span>
                    {f.points > 0 ? <span className={`${css.pts} num`}>{fill(m.finPts, { n: f.points })}</span> : null}
                  </li>
                ))}
              </ul>
            ) : <p className={css.empty}>{m.noFin}</p>
          ) : null}
        </div>

        <div className={css.col}>
          {data.board ? (
            <section aria-labelledby="rt-board" className={css.board}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <h2 id="rt-board" className={css.boardTitle}>{fill(m.board, { name: data.board.title })}</h2>
                <span className={css.boardSub}>{m.boardSub}</span>
              </div>
              {data.board.rows.length ? (
                <ol className={css.boardList} aria-label={m.boardListLabel}>
                  {data.board.rows.map((b) => (
                    <li key={`${b.pos}-${b.name}`} className={css.boardRow} data-me={b.me}>
                      <span className={`${css.boardPos} num`}>{b.pos}</span>
                      <span className={css.boardName}>{b.name}</span>
                      <span className="num">{b.days}</span>
                    </li>
                  ))}
                </ol>
              ) : <p className={css.boardSub} style={{ margin: 0 }}>{m.boardEmpty}</p>}
              {/* Apagarlo siempre se puede (también en solo lectura); prenderlo, solo si puede escribir. */}
              {canEdit || data.board.on ? (
                <div className={css.boardToggle}>
                  <span>{m.boardToggle}</span>
                  <Switch checked={data.board.on} label={m.boardToggle} disabled={pending || (!canEdit && !data.board.on)}
                    onChange={(on) => go(() => setBoard({ memberId: data.board!.memberId, on }))} />
                </div>
              ) : null}
            </section>
          ) : null}
          <p className={css.legal}>{m.foot}</p>
        </div>
      </div>
    </main>
  );
}

function ActiveCard({ r, m, canEdit, pending, onYes, onNo, onLeave }: {
  r: ActiveView; m: RetosMessages; canEdit: boolean; pending: boolean; onYes: () => void; onNo: () => void; onLeave: () => void;
}) {
  const cols = Math.min(r.dots.length, 30), colsM = Math.min(r.dots.length, 15);
  return (
    <article className={css.card}>
      <div className={css.cardTop}>
        <Image src={r.img} alt="" aria-hidden="true" width={88} height={88} sizes="88px" className={css.cardImg} />
        <div className={css.cardText}>
          <span className={css.who}>{r.who}</span>
          <h3 className={css.cardTitle}>{r.title}</h3>
          <span className={css.how}>{r.how}</span>
        </div>
        <span className={`${css.prog} num`}>{r.progress}</span>
      </div>
      <div role="img" aria-label={`${r.dotsLabel}: ${r.progress}`} className={css.dots} style={{ "--cols": cols, "--cols-m": colsM } as React.CSSProperties}>
        {r.dots.map((d, i) => <span key={i} className={css.dot} data-s={d} />)}
      </div>
      {r.mode === "ask" && canEdit ? (
        <div className={css.ask}>
          <span className={css.askText}>{m.ask}</span>
          <button type="button" className={css.yes} disabled={pending} onClick={onYes}>{m.yes}</button>
          <button type="button" className={css.no} disabled={pending} onClick={onNo}>{m.no}</button>
        </div>
      ) : null}
      {r.mode === "yes" ? <span className={css.noteOk}>{m.marked}</span> : null}
      {r.mode === "no" ? <span className={css.note}>{m.skipped}</span> : null}
      {r.mode === "auto" ? <span className={css.note}>{m.auto}</span> : null}
      {r.mode === "before" ? <span className={css.note}>{r.startsText}</span> : null}
      <div className={css.meta}>
        <span>{m.prize} <strong>{r.prize}</strong></span>
        {r.wildText ? <span>{r.wildText}</span> : null}
      </div>
      <div className={css.foot}>
        {r.peopleText ? <span className={css.people}>{r.peopleText}</span> : null}
        {canEdit ? <button type="button" className={css.leave} disabled={pending} onClick={onLeave}>{m.leave}</button> : null}
      </div>
    </article>
  );
}
