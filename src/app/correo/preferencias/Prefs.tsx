"use client";
import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/client";
import { fill } from "@/i18n";
import { savePreferences } from "./actions";
import type { PrefMessages } from "./messages";
import css from "./preferencias.module.css";

export function PrefsSwitches({ m, token, email, sms, phone }: { m: PrefMessages; token: string; email: boolean; sms: boolean; phone: string | null }) {
  const [v, setV] = useState({ email, sms });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const save = (channel: "email" | "sms", on: boolean) => {
    const before = v;
    setV({ ...v, [channel]: on });
    start(async () => {
      const r = await savePreferences({ t: token, channel, on });
      if (!r.ok) setV(before);
      setMsg({ ok: r.ok, text: r.ok ? m.saved : r.suppressed ? (channel === "sms" ? m.smsStopped : m.emailBlocked) : m.error });
    });
  };
  return (
    <div className="stack" style={{ gap: 0 }}>
      <div className={css.row}>
        <span className={css.rowText}><strong>{m.emailT}</strong><span className="xs muted">{m.emailD}</span></span>
        <Switch checked={v.email} label={m.emailT} disabled={pending} onChange={(on) => save("email", on)} />
      </div>
      {phone ? (
        <div className={css.row}>
          <span className={css.rowText}><strong>{m.smsT}</strong><span className="xs muted">{fill(m.smsD, { phone })}</span></span>
          <Switch checked={v.sms} label={m.smsT} disabled={pending} onChange={(on) => save("sms", on)} />
        </div>
      ) : null}
      {msg ? <p role={msg.ok ? "status" : "alert"} className={msg.ok ? css.ok : css.alert}>{msg.text}</p> : null}
    </div>
  );
}
