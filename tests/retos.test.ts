// Retos: cálculos puros (src/app/(app)/retos/lib.ts) y los disparadores del CRM. Las mismas reglas las impone la base
// (supabase/migrations/20261125000037_retos.sql). No toca la base.
import { describe, expect, it } from "vitest";
import {
  adminStatus, ChallengeInput, challengeProblem, dayNumber, dotsFor, goalShown, isDaily, joinable, lastDay, normalizeChallenge,
  pctOf, phaseOf, POINT_CAP, rangeLabel, targetOf, unitsOf, wildcardsLeft,
} from "@/app/(app)/retos/lib";
import { CHALLENGE_IDLE_DAYS, challengeIdleRef, matchesTrigger } from "@/lib/crm/flow";
import { TriggerSchema, TRIGGER_KINDS } from "@/lib/crm/schema";
import { TRIGGER_LABELS, triggerLabel } from "@/lib/crm/labels";
import { ADMIN_SECTIONS, ROLE_SECTIONS, canUse, sectionOf, RETOS_PATH } from "@/app/admin/actividad/roles";

const base = {
  id: null, title: "Tu fondo de emergencia en 30 días", description: "", image: "meta-emergencia", measure: "checkin", action: null, wildcards: 1,
  days: 30, startsOn: null, audience: "all", groupId: null, inviteCode: null, points: 30, badgeName: null, showBoard: false, publish: true,
} as const;
const parse = (o: Record<string, unknown>) => ChallengeInput.parse({ ...base, ...o });

describe("meta del reto (igual que la columna generada challenges.target)", () => {
  it("días − comodines; mínimo 1", () => {
    expect(targetOf(null, 30, 1)).toBe(29);
    expect(targetOf("expense", 7, 0)).toBe(7);
    expect(targetOf("lesson", 7, 2)).toBe(5); // "Termina 5 clases en 7 días"
    expect(targetOf(null, 1, 5)).toBe(1);
  });
  it("cierre de mes: cierres = ⌈días / 30⌉ − comodines", () => {
    expect(unitsOf("closure", 90)).toBe(3); // "Cierra 3 meses seguidos"
    expect(unitsOf("closure", 91)).toBe(4);
    expect(targetOf("closure", 90, 0)).toBe(3);
    expect(targetOf("closure", 30, 0)).toBe(1);
  });
  it("lo diario se muestra sobre los días (\"11 de 30 días\"); clases y cierres sobre la meta", () => {
    expect(isDaily("checkin", null)).toBe(true);
    expect(isDaily("app", "open_app")).toBe(true);
    expect(isDaily("app", "lesson")).toBe(false);
    expect(goalShown("checkin", null, 30, 29)).toBe(30);
    expect(goalShown("app", "lesson", 7, 5)).toBe(5);
  });
});

describe("ventana de días", () => {
  it("último día, fase y día del reto", () => {
    expect(lastDay("2026-12-01", 7)).toBe("2026-12-07");
    expect(phaseOf("2026-11-30", "2026-12-01", 7)).toBe("before");
    expect(phaseOf("2026-12-07", "2026-12-01", 7)).toBe("running");
    expect(phaseOf("2026-12-08", "2026-12-01", 7)).toBe("ended");
    expect(dayNumber("2026-12-11", "2026-12-01")).toBe(11);
  });
  it("se puede unir si es siempre abierto o la fecha fija aún no termina", () => {
    expect(joinable(null, 7, "2027-05-01")).toBe(true);
    expect(joinable("2026-12-01", 7, "2026-12-07")).toBe(true);
    expect(joinable("2026-12-01", 7, "2026-12-08")).toBe(false);
  });
});

describe("comodines: sin castigo", () => {
  const o = { wildcards: 1, start: "2026-11-01", today: "2026-11-12", yesBefore: 11, todayState: null } as const;
  it("si cumplió todos los días pasados, conserva el comodín", () => expect(wildcardsLeft(o)).toBe(1));
  it("\"Hoy no\" gasta el comodín de hoy", () => expect(wildcardsLeft({ ...o, todayState: "no" })).toBe(0));
  it("un día pasado sin marcar también lo gasta; nunca baja de 0", () => {
    expect(wildcardsLeft({ ...o, yesBefore: 10 })).toBe(0);
    expect(wildcardsLeft({ ...o, yesBefore: 3, todayState: "no" })).toBe(0);
  });
  it("el primer día no se descuenta nada", () => expect(wildcardsLeft({ ...o, today: "2026-11-01", yesBefore: 0 })).toBe(1));
});

describe("avance por día", () => {
  it("diario: hecho, hoy en amarillo y lo que falta", () => {
    const d = dotsFor({ daily: true, start: "2026-11-01", days: 5, today: "2026-11-03", doneDays: new Set(["2026-11-01"]), count: 1, target: 5 });
    expect(d).toEqual(["done", "open", "today", "open", "open"]);
    const marked = dotsFor({ daily: true, start: "2026-11-01", days: 3, today: "2026-11-03", doneDays: new Set(["2026-11-03"]), count: 1, target: 3 });
    expect(marked[2]).toBe("done");
  });
  it("por unidad (clases, cierres): los primeros hechos y el siguiente en amarillo", () => {
    expect(dotsFor({ daily: false, start: "2026-12-01", days: 7, today: "2026-12-02", doneDays: new Set(), count: 2, target: 5 }))
      .toEqual(["done", "done", "today", "open", "open"]);
  });
});

describe("panel: estado y totales (solo totales, nunca personas)", () => {
  it("estado del reto", () => {
    expect(adminStatus({ status: "draft", startsOn: null, days: 30 }, "2026-11-25")).toBe("draft");
    expect(adminStatus({ status: "published", startsOn: null, days: 30 }, "2026-11-25")).toBe("open");
    expect(adminStatus({ status: "published", startsOn: "2026-12-01", days: 7 }, "2026-11-25")).toBe("scheduled");
    expect(adminStatus({ status: "published", startsOn: "2026-11-20", days: 7 }, "2026-11-25")).toBe("active");
    expect(adminStatus({ status: "published", startsOn: "2026-11-01", days: 7 }, "2026-11-25")).toBe("ended");
  });
  it("porcentaje de los que se unieron", () => {
    expect(pctOf(11, 62)).toBe("18%");
    expect(pctOf(0, 0)).toBe("—");
  });
  it("rango de fechas", () => {
    expect(rangeLabel("2026-12-01", 7, "es", { range: "Del {from} al {to}" })).toBe("Del 1 al 7 de diciembre");
    expect(rangeLabel("2026-11-28", 8, "es", { range: "Del {from} al {to}" })).toBe("Del 28 de noviembre al 5 de diciembre");
  });
});

describe("formulario del panel", () => {
  it("premios: check-in máximo 50 (no se puede comprobar); lo que mide la app, 200", () => {
    expect(POINT_CAP).toEqual({ checkin: 50, app: 200 });
    expect(challengeProblem(parse({ points: 100 }), "2026-11-25")).toBe("points");
    expect(challengeProblem(parse({ points: 50 }), "2026-11-25")).toBeNull();
    expect(challengeProblem(parse({ measure: "app", action: "expense", points: 200 }), "2026-11-25")).toBeNull();
    expect(challengeProblem(parse({ measure: "app", action: "expense", points: 201 }), "2026-11-25")).toBe("points");
  });
  it("lo que mide la app necesita la acción; un grupo, el grupo; un código, el código", () => {
    expect(challengeProblem(parse({ measure: "app", action: null }), "2026-11-25")).toBe("action");
    expect(challengeProblem(parse({ audience: "group" }), "2026-11-25")).toBe("group");
    expect(challengeProblem(parse({ audience: "code" }), "2026-11-25")).toBe("code");
  });
  it("los comodines dejan algo por cumplir; no se publica un reto que ya habría terminado", () => {
    expect(challengeProblem(parse({ wildcards: 30 }), "2026-11-25")).toBe("wildcards");
    expect(challengeProblem(parse({ measure: "app", action: "closure", days: 90, wildcards: 3 }), "2026-11-25")).toBe("wildcards");
    expect(challengeProblem(parse({ startsOn: "2026-10-01", days: 7 }), "2026-11-25")).toBe("start");
    expect(challengeProblem(parse({ startsOn: "2026-10-01", days: 7, publish: false }), "2026-11-25")).toBeNull();
  });
  it("normaliza: acción solo si lo mide la app; grupo y código solo si aplican; código en mayúsculas", () => {
    const n = normalizeChallenge(parse({ action: "expense", audience: "code", inviteCode: "ruta2026", groupId: "6f1f4c8e-5b7e-4f61-9d1a-2a7d1f9b1c11" }));
    expect(n.action).toBeNull();
    expect(n.group_id).toBeNull();
    expect(n.invite_code).toBe("RUTA2026");
  });
  it("rechaza días fuera de rango y una ilustración que no existe", () => {
    expect(ChallengeInput.safeParse({ ...base, days: 0 }).success).toBe(false);
    expect(ChallengeInput.safeParse({ ...base, days: 121 }).success).toBe(false);
    expect(ChallengeInput.safeParse({ ...base, image: "../../etc" }).success).toBe(false);
  });
});

describe("CRM: Reto: recordatorio y ¡lo lograste!", () => {
  const ch = "0f4d1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b", mem = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
  it("son disparadores con texto en los dos idiomas", () => {
    expect(TRIGGER_KINDS).toContain("challenge_idle");
    expect(TRIGGER_KINDS).toContain("challenge_done");
    expect(TRIGGER_LABELS.es.challenge_idle).toBeTruthy();
    expect(TRIGGER_LABELS.en.challenge_done).toBeTruthy();
    expect(triggerLabel({ kind: "challenge_idle", days: 3 }, "es")).toBe("Reto: no marca en 3 días");
  });
  it("recordatorio: mismos días y, si dice cuál, el mismo reto", () => {
    const e = { kind: "challenge_idle", ref: challengeIdleRef(3, ch, mem, "2026-11-20") };
    expect(matchesTrigger(TriggerSchema.parse({ kind: "challenge_idle", days: 3, challengeId: ch }), e)).toBe(true);
    expect(matchesTrigger(TriggerSchema.parse({ kind: "challenge_idle" }), e)).toBe(CHALLENGE_IDLE_DAYS === 3);
    expect(matchesTrigger(TriggerSchema.parse({ kind: "challenge_idle", days: 5 }), e)).toBe(false);
    expect(matchesTrigger(TriggerSchema.parse({ kind: "challenge_idle", days: 3, challengeId: mem }), e)).toBe(false);
  });
  it("¡lo lograste!: el reto de la automatización (o cualquiera)", () => {
    const e = { kind: "challenge_done", ref: `${ch}:${mem}` };
    expect(matchesTrigger(TriggerSchema.parse({ kind: "challenge_done", challengeId: ch }), e)).toBe(true);
    expect(matchesTrigger(TriggerSchema.parse({ kind: "challenge_done" }), e)).toBe(true);
    expect(matchesTrigger(TriggerSchema.parse({ kind: "challenge_done", challengeId: mem }), e)).toBe(false);
  });
  it("el ref solo lleva ids y una fecha (nunca nombres ni montos)", () => {
    expect(challengeIdleRef(3, ch, mem, "2026-11-20")).toMatch(/^[0-9a-f:-]+$/);
  });
});

describe("panel: Retos es solo del Dueño", () => {
  it("sección propia, solo el Dueño", () => {
    expect(ADMIN_SECTIONS).toContain("retos");
    expect(canUse("owner", "retos")).toBe(true);
    expect(ROLE_SECTIONS.content).not.toContain("retos");
    expect(ROLE_SECTIONS.support).not.toContain("retos");
    expect(sectionOf(RETOS_PATH)).toBe("retos");
  });
});
