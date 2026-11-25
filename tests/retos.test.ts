// Retos: cálculos puros (src/app/(app)/retos/lib.ts) y los disparadores del CRM. Las mismas reglas las impone la base
// (supabase/migrations/20261125000037_retos.sql). No toca la base.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  adminStatus, ChallengeInput, challengeProblem, dayNumber, dotsFor, goalShown, isDaily, joinable, lastDay, normalizeChallenge,
  pctOf, phaseOf, POINT_CAP, rangeLabel, retoSignal, targetOf, unitsOf, wildcardsLeft,
} from "@/app/(app)/retos/lib";
import { CHALLENGE_IDLE_DAYS, challengeIdleRef, matchesTrigger } from "@/lib/crm/flow";
import { TriggerSchema, TRIGGER_KINDS } from "@/lib/crm/schema";
import { TRIGGER_LABELS, triggerLabel } from "@/lib/crm/labels";
import { ADMIN_SECTIONS, ROLE_SECTIONS, canUse, sectionOf, RETOS_PATH } from "@/app/admin/actividad/roles";
import { findDangers } from "../scripts/check-migrations";

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

describe("migración 037: seguridad de los retos (revisión del 25 nov 2026)", () => {
  const raw = readFileSync(path.join(import.meta.dirname, "..", "supabase", "migrations", "20261125000037_retos.sql"), "utf8");
  const sql = raw.replace(/--[^\n]*/g, "");
  const fn = (name: string) => new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\n(end )?\\$\\$;`).exec(sql)?.[0] ?? "";
  it("pasa la revisión de migraciones (no borra, no vacía, no renombra)", () => {
    expect(findDangers(raw)).toEqual([]);
    // (y las funciones que revisan las pruebas de abajo se encuentran: nada pasa en vacío)
    for (const n of ["award_points", "award_badge", "challenge_count", "challenge_checkin", "challenge_local_today", "challenge_board", "challenge_set_board",
      "challenge_list", "challenge_info", "protect_challenge_member", "protect_challenge_rules"]) expect(fn(n).length, n).toBeGreaterThan(80);
    expect(fn("challenge_list")).toContain("c.title");
  });
  it("premio e insignia solo con el intento terminado (status = 'done'), nunca solo por contar marcas", () => {
    const ap = fn("award_points");
    expect(ap).toMatch(/where m\.user_id = uid and m\.id::text = p_ref and m\.status = 'done'\), 0\)/); // el monto del premio
    expect(ap).toMatch(/m\.id::text = p_ref and m\.status = 'done' and public\.challenge_progress\(m\.id\) >= c\.target/); // la condición
    expect(fn("award_badge")).toMatch(/m\.status = 'done' and public\.challenge_progress\(m\.id\) >= c\.target/);
  });
  it("el punto del día tiene tope de 5 aunque cambien la configuración", () => {
    expect(fn("award_points")).toMatch(/elsif p_kind = 'challenge_day' then\s+pts := least\(pts, 5\);/);
  });
  it("el usuario no escribe marcas ni intentos por la API: solo lee lo suyo y sale", () => {
    for (const t of ["challenge_marks", "challenge_members"]) {
      expect(sql).not.toMatch(new RegExp(`create policy own_(insert|delete) on public\\.${t}`));
      expect(sql).toMatch(new RegExp(`drop policy if exists own_insert on public\\.${t};`));
      expect(sql).toMatch(new RegExp(`drop policy if exists own_delete on public\\.${t};`));
    }
    expect(sql).not.toMatch(/create policy own_update on public\.challenge_marks/);
    expect(sql).toMatch(/create policy own_update on public\.challenge_members/); // salir, limitado por protect_challenge_member
    expect(fn("protect_challenge_member")).toMatch(/if tg_op = 'INSERT' then raise exception 'forbidden'/);
  });
  it("cada create policy lleva antes su drop policy if exists", () => {
    const creates = [...sql.matchAll(/create policy (\w+) on (public\.\w+)/g)];
    expect(creates.length).toBeGreaterThan(4);
    for (const [, name, table] of creates) expect(sql).toContain(`drop policy if exists ${name} on ${table};`);
  });
  it("cierres: solo meses ya terminados (nunca el mes en curso ni uno futuro)", () => {
    expect(fn("challenge_count")).toMatch(/and make_date\(mc\.year, mc\.month, 1\) < date_trunc\('month', today\)::date\)/);
  });
  it("zona horaria: hoy acotado a ±1 día de la fecha UTC y nunca antes del último día marcado", () => {
    expect(fn("challenge_local_today")).toMatch(/return least\(greatest\(d, utc - 1\), utc \+ 1\);/);
    expect(fn("challenge_checkin")).toMatch(/if today < coalesce\(public\.challenge_last_mark\(p_member\), today\) then raise exception 'day_passed'/);
    expect(fn("challenge_count")).toMatch(/if today < coalesce\(public\.challenge_last_mark\(r\.id\), today\) then continue;/);
  });
  it("clases: máximo 2 por día en cada intento", () => {
    expect(fn("challenge_count")).toMatch(/p_action = 'lesson'[\s\S]*?k\.key like 'lesson:%' and k\.day = today\) >= 2 then\s+continue;/);
  });
  it("tabla del grupo: solo quien aún es del reto; apagar 'aparecer' funciona siempre, prender exige poder escribir", () => {
    expect(fn("challenge_board")).toMatch(/and public\.challenge_can_go\(p_challenge, m\.user_id\)/);
    const sb = fn("challenge_set_board");
    expect(sb).toMatch(/security definer/);
    expect(sb).toMatch(/if p_on and not public\.can_write\(\) then raise exception 'forbidden'/);
    expect(sb).toMatch(/update public\.challenge_members set show_on_board = p_on, updated_at = now\(\)\s+where id = p_member and user_id = uid;/);
  });
  it("el usuario no lee la tabla challenges: usa challenge_list() sin columnas privadas", () => {
    expect(sql).toMatch(/create policy owner_read on public\.challenges for select to authenticated using \(\(select public\.is_admin_owner\(\)\)\)/);
    expect(sql).not.toMatch(/create policy read_live/);
    const list = fn("challenge_list");
    for (const col of ["created_by", "invite_code", "group_id", "reminder_automation_id", "done_automation_id", "legacy_key"]) expect(list).not.toContain(col);
  });
  it("challenge_info: personas solo si quien pregunta puede seguir; la zona de cada quien sale de un join", () => {
    const info = fn("challenge_info");
    expect(info).toMatch(/case when x\.go then coalesce\(l\.n, 0\) else 0 end/);
    expect(info).toMatch(/left join public\.profiles p on p\.id = m\.user_id/);
    expect(info).not.toMatch(/challenge_today_of\(m\.user_id\)/);
  });
  it("las reglas de un reto con gente adentro no cambian (disparador)", () => {
    expect(fn("protect_challenge_rules")).toMatch(/\(new\.measure, new\.action, new\.days, new\.wildcards, new\.audience\) is distinct from/);
    expect(sql).toMatch(/create trigger protect_challenge_rules before update on public\.challenges/);
  });
  it("cada función nueva tiene su revoke y las de la app se dan a authenticated", () => {
    const created = [...sql.matchAll(/create or replace function public\.(\w+)\(/g)].map(([, n]) => n)
      .filter((n) => !["award_points", "award_badge", "protect_challenge_member"].includes(n)); // ya existían o solo son disparador
    const revoked = new Set([...sql.matchAll(/revoke execute on function public\.(\w+)\(/g)].map(([, n]) => n));
    expect(created.filter((n) => !revoked.has(n))).toEqual([]);
    for (const n of ["challenge_set_board(uuid, boolean)", "challenge_list()", "challenge_join(uuid)", "challenge_checkin(uuid, boolean)", "challenge_count(text, text)"]) {
      expect(sql).toContain(`grant execute on function public.${n} to authenticated;`);
    }
  });
});

describe("señal del menú (Retos amarillo y punto en Más)", () => {
  const challenges = new Map([
    ["mano", { measure: "checkin" as const, days: 30 }],
    ["auto", { measure: "app" as const, days: 7 }],
  ]);
  const base = { today: "2026-11-25", canEdit: true, challenges };

  it("sin intentos: nada", () => {
    expect(retoSignal({ ...base, members: [] })).toEqual({ active: 0, pending: false });
  });

  it("reto a mano sin marcar hoy: activo y falta marcar", () => {
    expect(retoSignal({ ...base, members: [{ challengeId: "mano", startOn: "2026-11-20", markedToday: false }] })).toEqual({ active: 1, pending: true });
  });

  it("ya marcó hoy (sí o no): activo, sin punto", () => {
    expect(retoSignal({ ...base, members: [{ challengeId: "mano", startOn: "2026-11-20", markedToday: true }] })).toEqual({ active: 1, pending: false });
  });

  it("lo cuenta la app: activo, nunca pide marcar", () => {
    expect(retoSignal({ ...base, members: [{ challengeId: "auto", startOn: "2026-11-24", markedToday: false }] })).toEqual({ active: 1, pending: false });
  });

  it("aún no empieza: activo, sin punto", () => {
    expect(retoSignal({ ...base, members: [{ challengeId: "mano", startOn: "2026-12-01", markedToday: false }] })).toEqual({ active: 1, pending: false });
  });

  it("con los días vencidos (status sigue 'active' en la base): no cuenta", () => {
    expect(retoSignal({ ...base, members: [{ challengeId: "mano", startOn: "2026-10-01", markedToday: false }] })).toEqual({ active: 0, pending: false });
  });

  it("reto que ya no aparece en la lista: no cuenta", () => {
    expect(retoSignal({ ...base, members: [{ challengeId: "otro", startOn: "2026-11-20", markedToday: false }] })).toEqual({ active: 0, pending: false });
  });

  it("solo lectura: activo, pero sin punto (no puede marcar)", () => {
    expect(retoSignal({ ...base, canEdit: false, members: [{ challengeId: "mano", startOn: "2026-11-20", markedToday: false }] })).toEqual({ active: 1, pending: false });
  });
});
