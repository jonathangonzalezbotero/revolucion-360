"use client";
import { useState } from "react";
import { ConfirmButton, Modal } from "@/components/ui/client";
import css from "./admin.module.css";

/**
 * Confirmación fuerte: hay que escribir el correo del usuario y luego tocar dos veces el botón.
 * La comprobación real del correo la hace el servidor.
 */
export function ConfirmEmail({ open, onClose, title, help, email, label, button, confirmButton, closeLabel, danger, onConfirm }: {
  open: boolean; onClose: () => void; title: string; help: string; email: string; label: string; button: string; confirmButton: string; closeLabel: string; danger?: boolean;
  onConfirm: (typed: string) => Promise<string | null>;
}) {
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const match = typed.trim().toLowerCase() === email.trim().toLowerCase();
  const close = () => { setTyped(""); setError(null); onClose(); };
  return (
    <Modal open={open} onClose={close} title={title} labelClose={closeLabel}>
      <p className="small" style={{ margin: 0, lineHeight: 1.5 }}>{help}</p>
      <div className="field">
        <label htmlFor="confirm-email">{label}</label>
        <input id="confirm-email" className="input" type="email" autoComplete="off" value={typed} placeholder={email} onChange={(e) => setTyped(e.target.value)} />
      </div>
      {error ? <p role="alert" className={css.err}>{error}</p> : null}
      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
        <button type="button" className="btn btn-secondary" onClick={close}>{closeLabel}</button>
        {match ? (
          <ConfirmButton className={danger ? `btn btn-danger ${css.btnDanger}` : "btn"} label={button} confirmLabel={confirmButton}
            onConfirm={async () => { const e = await onConfirm(typed); if (e) setError(e); else close(); }} />
        ) : <button type="button" className="btn" disabled aria-disabled="true">{button}</button>}
      </div>
    </Modal>
  );
}
