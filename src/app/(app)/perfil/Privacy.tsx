"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { fill } from "@/i18n";
import { ConfirmButton } from "@/components/ui/client";
import { cancelDeletion, requestDeletion } from "./actions";
import { Alert, useAct } from "./Forms";
import { confirmsWord } from "./lib";
import type { PerfilMessages } from "./messages";
import css from "./perfil.module.css";

export function Privacy({ m, pending }: { m: PerfilMessages; pending: { id: string; due: string } | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState("");
  const { error, act } = useAct();
  const ready = confirmsWord(word, m.delWord);
  return (
    <section className={css.section} style={{ gap: 16 }}>
      <p className={css.privacyNote}>{m.privacyNote}</p>
      <div className={css.secRow} style={{ borderTop: 0, paddingTop: 0 }}>
        <div className="row-between wrap" style={{ width: "100%" }}>
          <span style={{ display: "flex", flexDirection: "column", gap: 2, flex: "1 1 260px" }}><strong style={{ fontSize: 15 }}>{m.export}</strong><span className="xs muted">{m.exportSub}</span></span>
          {/* <a> y no <Link>: la descarga anota la solicitud y no debe precargarse. */}
          <span className="row wrap" style={{ gap: 8 }}>
            <a href="/api/export" download className="btn btn-sm" style={{ minHeight: 42 }}>{m.exportJson}</a>
            <a href="/api/export?formato=csv" download className="btn btn-secondary btn-sm" style={{ minHeight: 42 }}>{m.exportCsv}</a>
          </span>
        </div>
      </div>
      <div className={css.secRow}>
        <div className="row-between wrap" style={{ width: "100%" }}>
          <span style={{ display: "flex", flexDirection: "column", gap: 2 }}><strong style={{ fontSize: 15 }}>{m.policy}</strong><span className="xs muted">{m.policySub}</span></span>
          <Link href="/legal/privacidad" className="link" style={{ fontSize: 13, minHeight: 44, display: "inline-flex", alignItems: "center" }}>{m.read}</Link>
        </div>
      </div>
      <div className={css.secRow}>
        {pending ? (
          <div className={css.deleteBox}>
            <strong style={{ fontSize: 15, color: "var(--rojo)" }}>{fill(m.delPending, { date: pending.due })}</strong>
            <span className="small">{m.delPendingSub}</span>
            <button type="button" className="btn btn-secondary btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => act(() => cancelDeletion(pending.id), undefined, m.delUndone)}>{m.delUndo}</button>
            <Alert text={error} />
          </div>
        ) : (
          <>
            <div className="row-between wrap" style={{ width: "100%" }}>
              <span style={{ display: "flex", flexDirection: "column", gap: 2 }}><strong style={{ fontSize: 15, color: "var(--rojo)" }}>{m.del}</strong><span className="xs muted">{m.delSub}</span></span>
              {!open ? <button type="button" className="btn btn-danger btn-sm" onClick={() => setOpen(true)}>{m.delBtn}</button> : null}
            </div>
            {open ? (
              <div className={css.deleteBox}>
                <p className="small" style={{ lineHeight: 1.5 }}>{m.delWhat}</p>
                <div className="field" style={{ maxWidth: 280 }}>
                  <label htmlFor="del-word">{fill(m.delType, { word: m.delWord })}</label>
                  <input id="del-word" className={css.input} value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" spellCheck={false} />
                </div>
                <Alert text={error} />
                <div className="row wrap">
                  {ready ? (
                    <ConfirmButton className="btn btn-danger" label={m.delConfirm} confirmLabel={m.delConfirm2}
                      onConfirm={() => act(() => requestDeletion({ word }), () => router.push("/entrar"))} />
                  ) : <button type="button" className="btn btn-danger" disabled>{m.delConfirm}</button>}
                  <button type="button" className="btn btn-secondary" onClick={() => { setOpen(false); setWord(""); }}>{m.delCancel}</button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
