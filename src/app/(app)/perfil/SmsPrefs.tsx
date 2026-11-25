"use client";
import { useState } from "react";
import { Switch } from "@/components/ui/client";
import { saveMarketing } from "./actions";
import { Alert, useAct } from "./Forms";
import type { PerfilMessages } from "./messages";
import css from "./perfil.module.css";

/**
 * Avisos por SMS (consentimiento de marketing en el CRM). El registro no pide teléfono, por eso este interruptor vive aquí:
 * al encenderlo pide el teléfono con código de país (si no hay uno guardado) y solo entonces lo activa.
 */
/** `phone`: el teléfono ya válido para SMS (E.164) guardado en el CRM; `suggested`: el de Datos personales, para prellenar. */
export function SmsPrefsForm({ m, initial, phone, suggested }: { m: PerfilMessages; initial: boolean; phone: string | null; suggested?: string }) {
  const t = m.marketing;
  const [on, setOn] = useState(initial);
  const [asking, setAsking] = useState(false);
  const [value, setValue] = useState(phone ?? suggested ?? "");
  const { error, act } = useAct();
  const save = (v: boolean, withPhone?: string) => act(() => saveMarketing({ sms: v, ...(withPhone ? { phone: withPhone } : {}) }), () => { setOn(v); setAsking(false); }, t.saved);
  return (
    <section className={css.section} style={{ gap: 4 }} aria-labelledby="sms-prefs">
      <div className={css.switchRow}>
        <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}><strong id="sms-prefs" style={{ fontSize: 14 }}>{t.smsT}</strong><span className="xs muted">{t.smsD}</span></span>
        <Switch checked={on || asking} label={t.smsT} onChange={(v) => { if (!v) { setAsking(false); if (on) save(false); } else if (phone) save(true); else setAsking(true); }} />
      </div>
      {asking ? (
        <form style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); save(true, value); }}>
          <div className="field" style={{ flex: "1 1 220px" }}>
            <label htmlFor="sms-phone">{t.phone}</label>
            <input id="sms-phone" className={css.input} type="tel" inputMode="tel" autoComplete="tel" value={value} placeholder={t.phonePh} onChange={(e) => setValue(e.target.value)} required />
            <span className="hint">{t.phoneHint}</span>
          </div>
          <button className="btn" style={{ minHeight: 46 }}>{t.phoneSave}</button>
        </form>
      ) : null}
      <Alert text={error} />
    </section>
  );
}
