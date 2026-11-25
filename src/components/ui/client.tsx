"use client";
// Piezas con estado: ventana, aviso de éxito, interruptor, botón de envío.
import Image from "next/image";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Icon } from "./Icon";

// ───────── Ventana (hoja inferior en móvil) ─────────
export function Modal({ open, onClose, title, children, labelClose = "Cerrar" }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; labelClose?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="modal" onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }} aria-label={title}>
      {open ? (
        <div className="stack" style={{ gap: 16 }}>
          <div className="row-between">
            <h2 style={{ fontSize: 20 }}>{title}</h2>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label={labelClose} style={{ padding: 0, width: 40 }}><Icon name="x" /></button>
          </div>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}

// ───────── Aviso de éxito con rebote. Los puntos siempre en amarillo. ─────────
type Toast = { id: number; text: string; points?: number; image?: string };
/** `image`: ilustración opcional (p. ej. `ILLU.celHito`) en un cuadro papel de 48 px, como en el mockup de Metas. */
const ToastCtx = createContext<(text: string, points?: number, image?: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children, ptsLabel = "pts" }: { children: React.ReactNode; ptsLabel?: string }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const show = useCallback((text: string, points?: number, image?: string) => setToast({ id: Date.now(), text, points, image }), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(t);
  }, [toast]);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast ? (
        <div key={toast.id} role="status" className="toast">
          {toast.image ? <span aria-hidden="true" className="toast-img"><Image src={toast.image} alt="" width={48} height={48} sizes="48px" /></span> : null}
          <span>{toast.text}</span>
          {toast.points ? <span className="pts num">+{toast.points} {ptsLabel}</span> : null}
        </div>
      ) : null}
    </ToastCtx.Provider>
  );
}

// ───────── Interruptor ─────────
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" disabled={disabled} onClick={() => onChange(!checked)}>
      <span aria-hidden="true" />
    </button>
  );
}

// ───────── Opciones en segmento ─────────
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="group" aria-label={label} className="seg">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

/** Botón de envío de un <form action={...}>: se desactiva mientras guarda. */
export function SubmitButton({ children, pendingText, className = "btn", ...rest }: { children: React.ReactNode; pendingText?: string; className?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();
  return <button type="submit" className={className} disabled={pending || rest.disabled} {...rest}>{pending && pendingText ? pendingText : children}</button>;
}

/** Eliminar con doble confirmación: el primer toque pide confirmar, el segundo ejecuta. */
export function ConfirmButton({ onConfirm, label, confirmLabel, className = "btn btn-danger", ariaLabel, confirmAriaLabel }: { onConfirm: () => void | Promise<void>; label: React.ReactNode; confirmLabel: React.ReactNode; className?: string; ariaLabel?: string; confirmAriaLabel?: string }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button type="button" className={className} disabled={busy} aria-label={armed ? confirmAriaLabel ?? ariaLabel : ariaLabel} style={armed ? { background: "var(--rojo)", color: "var(--blanco)", borderColor: "var(--rojo)" } : undefined}
      onClick={async () => { if (!armed) return setArmed(true); setBusy(true); try { await onConfirm(); } finally { setBusy(false); setArmed(false); } }}>
      {armed ? confirmLabel : label}
    </button>
  );
}
