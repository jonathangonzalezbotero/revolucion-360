"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { fill } from "@/i18n";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/client";
import { toggleMark } from "../../actions";
import css from "../../plan.module.css";

export type MarkText = { pending: string; paidManual: string; mark: string; undo: string; hintMark: string; hintUndo: string; actAria: string; marked: string; unmarked: string };

/**
 * "Pendiente" ↔ "Pagado · a mano". Borde punteado: se toca para cambiar de estado y se puede deshacer.
 * `pill` muestra el estado (escritorio); `action` muestra lo que hace el toque (móvil).
 */
export function MarkButton({ lineId, month, name, paid, variant, t }: { lineId: string; month: number; name: string; paid: boolean; variant: "pill" | "action"; t: MarkText }) {
  const [on, setOn] = useState(paid);
  const [busy, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const act = on ? t.undo : t.mark;

  function toggle() {
    const next = !on;
    setOn(next);
    start(async () => {
      const r = await toggleMark({ lineId, month, paid: next });
      if (!r.ok) { setOn(!next); toast(r.error); return; }
      toast(fill(next ? t.marked : t.unmarked, { name }), r.points);
      router.refresh();
    });
  }

  if (variant === "action") {
    return <button type="button" className={`${css.tap} ${css.tapAct}`} aria-pressed={on} aria-label={fill(t.actAria, { action: act, name })} disabled={busy} onClick={toggle}>{act}</button>;
  }
  return (
    <button type="button" className={css.tap} aria-pressed={on} title={on ? t.hintUndo : t.hintMark} disabled={busy} onClick={toggle}>
      {on ? t.paidManual : t.pending}<Icon name="edit" size={11} />
    </button>
  );
}
