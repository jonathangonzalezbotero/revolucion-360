// Metas amables: hitos, ritmo, aportes desde Movimientos y lo que sobró al cerrar el mes.
import { describe, expect, it } from "vitest";
import {
  autoWindow, boostStep, choiceOfEntry, etaDate, goalChoiceValue, goalOutlook, isChallenge, leftoverMonthIsRecent, leftoverOf, legFor,
  milestonesCrossed, milestonesReached, monthContributions, nextMilestone, paceCents, parseGoalChoice, planSync, savedByGoal, sharedAccounts,
  wantedEntries, type LinkedEntry, type SyncGoal, type SyncTx,
} from "@/lib/engine/metas";

const today = "2026-11-25";
const G1 = "11111111-1111-4111-8111-111111111111", G2 = "22222222-2222-4222-8222-222222222222";

describe("hitos", () => {
  it("25/50/75/100% con centavos enteros", () => {
    expect(milestonesReached(1_000_000, 840_000)).toEqual([25, 50, 75]);
    expect(milestonesReached(1_000_000, 250_000)).toEqual([25]);
    expect(milestonesReached(1_000_000, 249_999)).toEqual([]);
    expect(milestonesReached(0, 500_000)).toEqual([]); // sin monto no hay hitos
    expect(milestonesReached(1_000_000, 1_200_000)).toEqual([25, 50, 75, 100]);
  });
  it("cruzar: solo los que se suben, varios de una vez, nunca al bajar", () => {
    expect(milestonesCrossed(1_000_000, 200_000, 260_000)).toEqual([25]);
    expect(milestonesCrossed(1_000_000, 200_000, 800_000)).toEqual([25, 50, 75]);
    expect(milestonesCrossed(1_000_000, 800_000, 300_000)).toEqual([]); // usar la plata no quita hitos
    expect(milestonesCrossed(1_000_000, 300_000, 300_000)).toEqual([]);
  });
  it("próximo hito y cuánto falta", () => {
    // mockup: $8,400 de $10,000 → próximo 100%, faltan $1,600
    expect(nextMilestone(1_000_000, 840_000)).toEqual({ pct: 100, missingCents: 160_000 });
    expect(nextMilestone(511_800, 120_000)).toEqual({ pct: 25, missingCents: 7_950 });
    expect(nextMilestone(1_000_000, 1_000_000)).toBeNull();
    expect(nextMilestone(0, 0)).toBeNull();
  });
});

describe("ritmo", () => {
  it("promedio de aportes de los últimos 3 meses; usar la plata no baja el ritmo", () => {
    const e = [
      { date: "2026-06-01", amountCents: 500_000 },          // fuera de la ventana, pero dice que la meta es vieja
      { date: "2026-09-10", amountCents: 80_000 }, { date: "2026-10-10", amountCents: 80_000 }, { date: "2026-11-10", amountCents: 80_000 },
      { date: "2026-11-12", amountCents: -120_000 },         // la usó para lo que era
    ];
    expect(paceCents(e, today)).toBe(80_000);
  });
  it("meta nueva: se divide por el tiempo que lleva (mínimo 1 mes)", () => {
    expect(paceCents([{ date: "2026-11-20", amountCents: 50_000 }], today)).toBe(50_000);
    // 61 días ≈ 2 meses
    expect(paceCents([{ date: "2026-09-25", amountCents: 20_000 }, { date: "2026-10-25", amountCents: 20_000 }, { date: "2026-11-25", amountCents: 20_000 }], today)).toBe(29_939);
    expect(paceCents([], today)).toBe(0);
    expect(paceCents([{ date: "2026-11-01", amountCents: -5_000 }], today)).toBe(0);
  });
  it("a este ritmo llegas en…", () => {
    expect(etaDate(160_000, 80_000, today)).toBe("2027-01-25");
    expect(etaDate(160_001, 80_000, today)).toBe("2027-02-25");
    expect(etaDate(0, 0, today)).toBe(today);
    expect(etaDate(100, 0, today)).toBeNull();
  });
  it("el empujón es un número redondo, sirve en cualquier moneda", () => {
    expect(boostStep(80_000)).toBe(10_000);     // $800 al mes → $100 más
    expect(boostStep(15_000)).toBe(2_000);      // $150 → $20
    expect(boostStep(12_000)).toBe(2_000);
    expect(boostStep(500)).toBe(100);           // mínimo 1 unidad
    expect(boostStep(50_000_000)).toBe(5_000_000); // pesos: $500.000 → $50.000
  });
});

describe("cómo va la meta (siempre en positivo)", () => {
  const base = { targetDate: null, entries: [], today };
  it("sin monto, llegaste, sin fecha ni ritmo", () => {
    expect(goalOutlook({ ...base, targetCents: 0, savedCents: 50_000 })).toEqual({ kind: "setup" });
    expect(goalOutlook({ ...base, targetCents: 100_000, savedCents: 100_000 })).toEqual({ kind: "reached" });
    expect(goalOutlook({ ...base, targetCents: 100_000, savedCents: 40_000 })).toEqual({ kind: "open", remainingCents: 60_000 });
  });
  it("con ritmo manda el ritmo, y la idea sin presión solo si de verdad adelanta un mes", () => {
    const entries = [{ date: "2026-06-01", amountCents: 0 }, { date: "2026-09-10", amountCents: 80_000 }, { date: "2026-10-10", amountCents: 80_000 }, { date: "2026-11-10", amountCents: 80_000 }];
    const o = goalOutlook({ targetCents: 1_000_000, savedCents: 840_000, targetDate: "2027-03-31", entries, today });
    // faltan $1,600 a $800 al mes → 2 meses; con $100 más también son 2: no se muestra la idea
    expect(o).toEqual({ kind: "pace", when: "2027-01-25", tip: null });
    const o2 = goalOutlook({ targetCents: 1_000_000, savedCents: 500_000, targetDate: null, entries, today });
    // faltan $5,000 a $800 → 7 meses (jun 2027); a $900 → 6 meses (may 2027)
    expect(o2).toEqual({ kind: "pace", when: "2027-06-25", tip: { boostCents: 10_000, when: "2027-05-25" } });
  });
  it("sin ritmo, la fecha; si ya pasó, se propone el mes que viene (nunca 'vas atrasado')", () => {
    expect(goalOutlook({ ...base, targetCents: 511_800, savedCents: 120_000, targetDate: "2027-12-31" })).toEqual({ kind: "date", monthlyCents: 30_139, when: "2027-12-31" });
    expect(goalOutlook({ ...base, targetCents: 100_000, savedCents: 40_000, targetDate: "2026-10-31" })).toEqual({ kind: "date", monthlyCents: 60_000, when: "2026-12-25" });
  });
  it("lo que apartaste este mes", () => {
    expect(monthContributions([{ date: "2026-11-01", amountCents: 80_000 }, { date: "2026-11-20", amountCents: 15_000 }, { date: "2026-11-21", amountCents: -5_000 }, { date: "2026-10-31", amountCents: 9_000 }], today)).toBe(95_000);
  });
});

describe("lo que sobró al cerrar el mes", () => {
  it("solo si sobró, en centavos enteros", () => {
    expect(leftoverOf(24_000)).toBe(24_000);
    expect(leftoverOf(-5_000)).toBe(0);
    expect(leftoverOf(0)).toBe(0);
    // entró 5,000, salió 4,000 y 800 se fueron por transferencia a la cuenta de la meta (ya contaron como aporte): sobran 200, no 1,000
    expect(leftoverOf(100_000, 80_000)).toBe(20_000);
    // además pagó a mano la línea de la meta (800 de gasto): se ofrece de menos, nunca de más
    expect(leftoverOf(20_000, 80_000)).toBe(0);
  });
  it("el aviso es para el mes pasado o este, no para uno viejo", () => {
    expect(leftoverMonthIsRecent({ year: 2026, month: 11 }, today)).toBe(true);
    expect(leftoverMonthIsRecent({ year: 2026, month: 10 }, today)).toBe(true);
    expect(leftoverMonthIsRecent({ year: 2026, month: 9 }, today)).toBe(false);
    expect(leftoverMonthIsRecent({ year: 2026, month: 12 }, "2027-01-03")).toBe(true);
    expect(leftoverMonthIsRecent({ year: 2026, month: 12 }, today)).toBe(false); // futuro
  });
});

describe("¿tiene que ver con una meta?", () => {
  it("lee y escribe el valor del selector", () => {
    expect(parseGoalChoice("")).toBeNull();
    expect(parseGoalChoice(`in:${G1}`)).toEqual({ role: "in", goalId: G1 });
    expect(parseGoalChoice(`out:${G2}`)).toEqual({ role: "out", goalId: G2 });
    expect(parseGoalChoice("x:1")).toBeUndefined();
    expect(parseGoalChoice("in:no-es-uuid")).toBeUndefined();
    expect(goalChoiceValue({ role: "in", goalId: G1 })).toBe(`in:${G1}`);
    expect(goalChoiceValue(null)).toBe("");
    expect(choiceOfEntry({ goalId: G1, amountCents: -120_000 })).toBe(`out:${G1}`);
    expect(choiceOfEntry({ goalId: G1, amountCents: 0 })).toBe("");
    expect(choiceOfEntry(undefined)).toBe("");
  });
  it("en una transferencia, el aporte va en la punta que entra y el uso en la que sale", () => {
    const out = { id: "a", amountCents: -80_000 }, inn = { id: "b", amountCents: 80_000 };
    expect(legFor("in", out, inn)).toBe("b");
    expect(legFor("in", inn, out)).toBe("b");
    expect(legFor("out", inn, out)).toBe("a");
    expect(legFor("out", { id: "c", amountCents: -5_000 }, null)).toBe("c");
  });
});

describe("transferencias que cuentan solas como aporte", () => {
  const save: SyncGoal = { id: G1, accountId: "save", linkedOn: "2026-11-01", archived: false, completed: false };
  const tx = (p: Partial<SyncTx> & { id: string }): SyncTx => ({ accountId: "save", date: "2026-11-10", amountCents: 80_000, kind: "transfer", pairId: null, deleted: false, isSplit: false, goalId: null, goalRole: null, ...p });

  it("la punta que entra a la cuenta de la única meta activa cuenta como aporte", () => {
    const w = wantedEntries([tx({ id: "in1", pairId: "out1" }), tx({ id: "out1", accountId: "spend", amountCents: -80_000, pairId: "in1" })], [save], []);
    expect([...w]).toEqual([["in1", { goalId: G1, amountCents: 80_000, kind: "auto", date: "2026-11-10" }]]);
  });
  it("nunca transferencias de antes de unir la cuenta, ni gastos normales, ni metas cumplidas o archivadas", () => {
    expect(wantedEntries([tx({ id: "old", date: "2026-10-31" })], [save], []).size).toBe(0);
    expect(wantedEntries([tx({ id: "n", kind: "normal" })], [save], []).size).toBe(0);
    expect(wantedEntries([tx({ id: "t" })], [{ ...save, completed: true }], []).size).toBe(0);
    expect(wantedEntries([tx({ id: "t" })], [{ ...save, archived: true }], []).size).toBe(0);
    expect(wantedEntries([tx({ id: "t" })], [{ ...save, linkedOn: null }], []).size).toBe(0);
  });
  it("dos metas en la misma cuenta: no cuenta sola (se elige en Movimientos)", () => {
    const other: SyncGoal = { ...save, id: G2 };
    expect(wantedEntries([tx({ id: "t" })], [save, other], []).size).toBe(0);
    expect(sharedAccounts([save, other])).toEqual(new Set(["save"]));
    expect(sharedAccounts([save, { ...other, completed: true }])).toEqual(new Set());
  });
  it("dos metas en la cuenta y una se cumple: las transferencias viejas no se van de golpe a la otra; las nuevas sí cuentan", () => {
    const viaje: SyncGoal = { ...save, id: G2, completed: true, endedOn: "2026-11-15" };
    const w = wantedEntries([tx({ id: "vieja", date: "2026-11-10" }), tx({ id: "nueva", date: "2026-11-20" })], [save, viaje], []);
    expect([...w.keys()]).toEqual(["nueva"]);
    expect(w.get("nueva")?.goalId).toBe(G1);
  });
  it("un aporte automático que ya existe se queda en su meta aunque llegue otra meta a la cuenta", () => {
    const prev: LinkedEntry = { id: "e1", transactionId: "t", goalId: G1, amountCents: 80_000, kind: "auto", date: "2026-11-10" };
    const w = wantedEntries([tx({ id: "t", amountCents: 90_000 })], [save, { ...save, id: G2 }], [prev]);
    expect(w.get("t")).toEqual({ goalId: G1, amountCents: 90_000, kind: "auto", date: "2026-11-10" });
  });
  it("lo que el usuario elige manda; 'Ninguna' apaga el automático; nunca se cuenta dos veces", () => {
    expect(wantedEntries([tx({ id: "t", goalRole: "none" })], [save], []).size).toBe(0);
    const w = wantedEntries([
      tx({ id: "out1", accountId: "spend", amountCents: -80_000, pairId: "in1", goalId: G2, goalRole: "in" }),
      tx({ id: "in1", pairId: "out1" }),
    ], [save, { ...save, id: G2, accountId: "otra" }], []);
    expect([...w.keys()]).toEqual(["out1"]);
    expect(w.get("out1")).toEqual({ goalId: G2, amountCents: 80_000, kind: "tx_in", date: "2026-11-10" });
  });
  it("'Pagado con…' resta (un logro), también con una meta cumplida; con una archivada no", () => {
    const pasajes = tx({ id: "p", kind: "normal", accountId: "card", amountCents: -120_000, goalId: G1, goalRole: "out" });
    expect(wantedEntries([pasajes], [{ ...save, completed: true }], []).get("p")).toEqual({ goalId: G1, amountCents: -120_000, kind: "used", date: "2026-11-10" });
    expect(wantedEntries([pasajes], [{ ...save, archived: true }], []).size).toBe(0);
  });
  it("un movimiento borrado o dividido no cuenta", () => {
    expect(wantedEntries([tx({ id: "d", deleted: true })], [save], []).size).toBe(0);
    expect(wantedEntries([tx({ id: "s", isSplit: true, kind: "normal", goalId: G1, goalRole: "in" })], [save], []).size).toBe(0);
  });

  it("plan de sincronización: crea, cambia y quita sin tocar lo que ya está bien", () => {
    const existing: LinkedEntry[] = [
      { id: "keep", transactionId: "t1", goalId: G1, amountCents: 80_000, kind: "auto", date: "2026-11-10" },
      { id: "chg", transactionId: "t2", goalId: G1, amountCents: 50_000, kind: "auto", date: "2026-11-10" },
      { id: "gone", transactionId: "t3", goalId: G1, amountCents: 10_000, kind: "tx_in", date: "2026-11-10" },
    ];
    const wanted = new Map([
      ["t1", { goalId: G1, amountCents: 80_000, kind: "auto" as const, date: "2026-11-10" }],
      ["t2", { goalId: G1, amountCents: 55_000, kind: "auto" as const, date: "2026-11-10" }],
      ["t4", { goalId: G2, amountCents: -9_000, kind: "used" as const, date: "2026-11-11" }],
    ]);
    expect(planSync(wanted, existing)).toEqual({
      insert: [{ transactionId: "t4", goalId: G2, amountCents: -9_000, kind: "used", date: "2026-11-11" }],
      update: [{ id: "chg", goalId: G1, amountCents: 55_000, kind: "auto", date: "2026-11-10" }],
      remove: ["gone"],
    });
    expect(planSync(new Map([["t1", { goalId: G1, amountCents: 80_000, kind: "auto" as const, date: "2026-11-10" }]]), existing.slice(0, 1))).toEqual({ insert: [], update: [], remove: [] });
  });
  it("suma por meta y ventana de fechas", () => {
    expect(savedByGoal([{ goalId: G1, amountCents: 80_000 }, { goalId: G1, amountCents: -20_000 }, { goalId: G2, amountCents: 5 }])).toEqual(new Map([[G1, 60_000], [G2, 5]]));
    expect(autoWindow([save, { ...save, id: G2, linkedOn: "2026-10-15" }], today)).toEqual({ from: "2026-10-15", to: "2026-11-26" });
    expect(autoWindow([{ ...save, accountId: null }], today)).toBeNull();
  });
});

describe("retos", () => {
  it("lista fija", () => {
    expect(isChallenge("delivery")).toBe(true);
    expect(isChallenge("otro")).toBe(false);
  });
});
