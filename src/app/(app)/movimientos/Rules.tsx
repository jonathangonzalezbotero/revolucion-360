"use client";
import { useRouter } from "next/navigation";
import { fill } from "@/i18n";
import { Empty } from "@/components/ui/basics";
import { ConfirmButton, useToast } from "@/components/ui/client";
import { deleteRule } from "./actions";
import css from "./mov.module.css";
import type { Ctx } from "./types";

/** Una regla: lo que dice el banco → categoría y, si hay, línea del plan. */
export type RuleItem = { id: string; pattern: string; category: string | null; line: string | null };

/** Reglas: se crean al editar un movimiento ("Hacer lo mismo con los próximos…"). Aquí se ven y se quitan. */
export function Rules({ items, ctx }: { items: RuleItem[]; ctx: Ctx }) {
  const { t } = ctx;
  const router = useRouter();
  const toast = useToast();
  const remove = async (r: RuleItem) => {
    const res = await deleteRule({ id: r.id });
    if (!res.ok) return toast(res.error);
    toast(t.rules.removed);
    router.refresh();
  };
  return (
    <section id="reglas" aria-labelledby="rules-h" className={`${css.card} ${css.recCard}`}>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <h2 id="rules-h" style={{ fontSize: 16 }}>{t.rules.title}</h2>
        <span className="small muted">{t.rules.sub}</span>
      </div>
      {items.length === 0 ? <Empty icon="mov" title={t.rules.emptyTitle} text={t.rules.emptyText} /> : (
        <ul className={css.ruleList}>
          {items.map((r) => (
            <li key={r.id} className={css.rule}>
              <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                <strong style={{ fontSize: 14, overflowWrap: "anywhere" }}>&ldquo;{r.pattern}&rdquo;</strong>
                <span className="xs muted">{fill(t.rules.goesTo, { cat: r.category ?? t.list.noCat })}{r.line ? ` · ${fill(t.rules.line, { name: r.line })}` : ""}</span>
              </span>
              {ctx.canEdit ? <ConfirmButton onConfirm={() => remove(r)} label={t.rules.remove} confirmLabel={t.rec.removeConfirm} className={css.mini} /> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
