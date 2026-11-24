import "server-only";
import type { Session } from "@/server/session";
import { term } from "@/server/terms";
import type { Ctx } from "./lib";
import { M } from "./messages";

/** Nombres y fechas con los que el asistente arma las líneas. La pantalla y la acción usan exactamente lo mismo. */
export function wizardContext(s: Session): { ctx: Ctx; freelance: string; bnpl: string } {
  const m = M[s.locale];
  const freelance = term(s, "freelance"), bnpl = term(s, "bnpl");
  return {
    freelance, bnpl,
    ctx: {
      year: s.year, month: s.month, today: s.today, remesas: s.config.flags.remesas,
      labels: {
        income: m.income.defaultName, home: m.home.lines, basics: m.basics.names, debts: { ...m.debts.names, bnpl },
        debtTypes: m.debts.types, family: m.family.line, goal: m.goals.fallback,
      },
    },
  };
}
