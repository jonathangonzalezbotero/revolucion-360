import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fill } from "@/i18n";
import { formatDate, type ISODate } from "@/lib/engine";
import { crmEvent } from "@/server/crm";
import { fetchAll, must } from "@/server/data";
import { award, notify, tryChallengeBadge } from "@/server/rewards";
import type { Session } from "@/server/session";
import {
  dayNumber, dotsFor, goalShown, imageSrc, isDaily, joinable, phaseOf, rangeLabel, wildcardsLeft,
  type Action, type Audience, type Dot, type Measure,
} from "./lib";
import { M, type RetosMessages } from "./messages";

/**
 * Tablas y funciones de la migración 20261125000037_retos.sql (challenges, challenge_members, challenge_marks,
 * challenge_join, challenge_checkin, challenge_count, challenge_info, challenge_board). Hasta que se aplique y se
 * regeneren los tipos se consultan sin tipos y cada fila se tipa a mano.
 */
export const raw = (s: Session) => s.supabase as unknown as SupabaseClient;

/** La migración aún no está aplicada (tabla o función que no existe). */
export const notReady = (e: { code?: string } | null | undefined) => !!e && ["42P01", "42883", "PGRST202", "PGRST205"].includes(e.code ?? "");

type ChallengeRow = {
  id: string; title: string; description: string; image: string; measure: Measure; action: Action | null; wildcards: number; days: number;
  starts_on: ISODate | null; audience: Audience; points: number; badge_name: string | null; show_board: boolean; status: string; target: number;
};
type MemberRow = { id: string; challenge_id: string; start_on: ISODate; status: "active" | "done" | "left" | "ended"; show_on_board: boolean; joined_at: string };
type MarkRow = { member_id: string; key: string; day: ISODate; state: "yes" | "no" | "auto" };
type InfoRow = { challenge_id: string; group_name: string | null; creator: string | null; people: number; for_me: boolean };

const COLS = "id, title, description, image, measure, action, wildcards, days, starts_on, audience, points, badge_name, show_board, status, target";

export type ActiveView = {
  memberId: string; challengeId: string; title: string; who: string; how: string; img: string; progress: string;
  dots: Dot[]; dotsLabel: string; daily: boolean;
  mode: "ask" | "yes" | "no" | "auto" | "before";
  startsText: string; prize: string; wildText: string; peopleText: string;
};
export type AvailableView = { challengeId: string; title: string; who: string; how: string; img: string; start: string; prize: string };
export type FinishedView = { memberId: string; title: string; detail: string; points: number };
export type BoardView = { memberId: string; title: string; on: boolean; rows: { pos: number; name: string; days: string; me: boolean }[] };
export type RetosData = { active: ActiveView[]; available: AvailableView[]; finished: FinishedView[]; board: BoardView | null };

/** "+100 pts y la insignia "Colchón listo"" · "+30 pts" · "solo el hábito". Puntos solo si los logros están encendidos. */
export function prizeText(m: RetosMessages, points: number, badge: string | null, gamification: boolean): string {
  const pts = gamification ? points : 0;
  if (pts > 0 && badge) return fill(m.prizeBoth, { n: pts, name: badge });
  if (pts > 0) return fill(m.prizePts, { n: pts });
  if (badge && gamification) return fill(m.prizeBadge, { name: badge });
  return m.noPrize;
}

function whoText(m: RetosMessages, c: ChallengeRow, info: InfoRow | undefined): string {
  if (c.audience === "all") return m.forAll;
  const who = c.audience === "group" ? info?.group_name || m.forAll : m.byCode;
  return info?.creator ? fill(m.createdBy, { who, name: info.creator }) : who;
}

function howText(m: RetosMessages, c: ChallengeRow): string {
  if (c.description.trim()) return c.description;
  return c.measure === "checkin" ? fill(m.how.checkin, { n: c.days }) : m.how[c.action ?? "open_app"];
}

const progressText = (m: RetosMessages, c: ChallengeRow, count: number) =>
  fill(c.action === "lesson" ? m.progress.lesson : c.action === "closure" ? m.progress.closure : m.progress.day,
    { n: count, total: goalShown(c.measure, c.action, c.days, c.target) });

/** Todo lo que pinta /retos. `null` si la migración aún no está aplicada. */
export async function loadRetos(s: Session): Promise<RetosData | null> {
  const m = M[s.locale];
  const db = raw(s);
  const [chRes, memRes, infoRes] = await Promise.all([
    db.from("challenges").select(COLS).eq("status", "published").order("published_at", { ascending: false }),
    db.from("challenge_members").select("id, challenge_id, start_on, status, show_on_board, joined_at").eq("user_id", s.userId).order("joined_at", { ascending: false }),
    db.rpc("challenge_info"),
  ]);
  if (notReady(chRes.error) || notReady(memRes.error) || notReady(infoRes.error)) return null;
  const challenges = must(chRes) as ChallengeRow[];
  const members = must(memRes) as MemberRow[];
  const info = new Map((must(infoRes) as InfoRow[]).map((r) => [r.challenge_id, r]));
  const byId = new Map(challenges.map((c) => [c.id, c]));
  const marks = members.length
    ? await fetchAll<MarkRow>((a, b) => db.from("challenge_marks").select("member_id, key, day, state").eq("user_id", s.userId).order("member_id").order("key").range(a, b))
    : [];
  const pointsRows = s.config.gamification && members.length
    ? await fetchAll<{ kind: string; ref: string; points: number }>((a, b) => s.supabase.from("point_events").select("kind, ref, points")
      .eq("user_id", s.userId).in("kind", ["challenge_day", "challenge_done"]).order("id").range(a, b))
    : [];

  const marksOf = new Map<string, MarkRow[]>();
  marks.forEach((k) => marksOf.set(k.member_id, [...(marksOf.get(k.member_id) ?? []), k]));
  const pointsOf = (memberId: string) => pointsRows.filter((p) => p.ref === memberId || p.ref.startsWith(`${memberId}:`)).reduce((a, p) => a + p.points, 0);
  // La base también deja leer los retos en los que estuvo, aunque ya no sean para la persona (cambió de grupo, venció su
  // acceso, le revocaron el código): esos van a Terminados con lo que logró. `for_me` dice si puede seguir.
  const stillForMe = new Set([...info.values()].filter((r) => r.for_me).map((r) => r.challenge_id));

  const active: ActiveView[] = [], finished: FinishedView[] = [];
  for (const x of members) {
    const c = byId.get(x.challenge_id);
    if (!c) continue;
    const own = marksOf.get(x.id) ?? [];
    const counted = own.filter((k) => k.state !== "no");
    const count = counted.length;
    const progress = progressText(m, c, count);
    const phase = phaseOf(s.today, x.start_on, c.days);
    const eligible = stillForMe.has(c.id);
    if (x.status === "active" && phase !== "ended" && eligible) {
      const daily = isDaily(c.measure, c.action);
      const todayMark = own.find((k) => k.key === s.today);
      const yesBefore = own.filter((k) => k.state === "yes" && k.day < s.today).length;
      const left = c.measure === "checkin"
        ? wildcardsLeft({ wildcards: c.wildcards, start: x.start_on, today: s.today, yesBefore, todayState: todayMark?.state === "yes" ? "yes" : todayMark?.state === "no" ? "no" : null })
        : 0;
      const info1 = info.get(c.id);
      const people = info1?.people ?? 0;
      active.push({
        memberId: x.id, challengeId: c.id, title: c.title, who: whoText(m, c, info1), how: howText(m, c), img: imageSrc(c.image), progress,
        dots: dotsFor({ daily, start: x.start_on, days: c.days, today: s.today, doneDays: new Set(counted.map((k) => k.day)), count, target: c.target }),
        dotsLabel: daily ? m.dotsLabel : m.dotsLabelUnits, daily,
        mode: phase === "before" ? "before" : c.measure === "app" ? "auto" : todayMark ? (todayMark.state === "yes" ? "yes" : "no") : "ask",
        startsText: phase === "before" ? fill(m.startsOn, { date: formatDate(x.start_on, s.locale, "day") }) : "",
        prize: prizeText(m, c.points, c.badge_name, s.config.gamification),
        wildText: left > 0 ? (left === 1 ? m.wildOne : fill(m.wildMany, { n: left })) : "",
        peopleText: people > 1 ? fill(c.audience === "group" ? m.peopleGroup : m.people, { n: people }) : "",
      });
      continue;
    }
    const detail = x.status === "done" ? fill(m.finDone, { progress }) + (c.badge_name ? ` · ${fill(m.finBadge, { name: c.badge_name })}` : "")
      : x.status === "left" ? fill(m.finLeft, { progress })
      : !eligible && phase !== "ended" ? fill(m.finGone, { progress })
      : fill(m.finEnded, { progress });
    finished.push({ memberId: x.id, title: c.title, detail, points: pointsOf(x.id) });
  }

  // Disponibles: publicados para la persona, que aún se pueden empezar, sin un intento activo ni terminado.
  const busy = new Set(members.filter((x) => {
    const c = byId.get(x.challenge_id);
    return x.status === "done" || (x.status === "active" && !!c && phaseOf(s.today, x.start_on, c.days) !== "ended");
  }).map((x) => x.challenge_id));
  const available: AvailableView[] = challenges
    .filter((c) => stillForMe.has(c.id) && !busy.has(c.id) && joinable(c.starts_on, c.days, s.today))
    .map((c) => ({
      challengeId: c.id, title: c.title, who: whoText(m, c, info.get(c.id)), how: howText(m, c), img: imageSrc(c.image),
      start: c.starts_on ? rangeLabel(c.starts_on, c.days, s.locale, m) : m.startOpen,
      prize: prizeText(m, c.points, c.badge_name, s.config.gamification),
    }));

  // Tabla del grupo: el primer reto activo (o terminado) que la tiene encendida.
  let board: BoardView | null = null;
  const withBoard = members.find((x) => (x.status === "active" || x.status === "done") && byId.get(x.challenge_id)?.show_board && stillForMe.has(x.challenge_id));
  if (withBoard) {
    const c = byId.get(withBoard.challenge_id)!;
    const rows = must(await db.rpc("challenge_board", { p_challenge: c.id })) as { name: string; days: number; me: boolean }[];
    board = {
      memberId: withBoard.id, title: c.title, on: withBoard.show_on_board,
      rows: rows.map((r, i) => ({ pos: i + 1, name: r.me ? m.boardMe : r.name || "—", days: r.days === 1 ? m.boardDay : fill(m.boardDays, { n: r.days }), me: r.me })),
    };
  }
  return { active, available, finished, board };
}

/** Las 3 tarjetas de "Retos opcionales" en Metas: primero los tuyos activos, luego los disponibles. */
export type MetasReto = { challengeId: string; memberId: string | null; title: string; text: string };
export async function loadMetasRetos(s: Session): Promise<MetasReto[] | null> {
  const data = await loadRetos(s);
  if (!data) return null;
  return [
    ...data.active.map((a) => ({ challengeId: a.challengeId, memberId: a.memberId, title: a.title, text: a.how })),
    ...data.available.map((a) => ({ challengeId: a.challengeId, memberId: null, title: a.title, text: a.how })),
  ].slice(0, 3);
}

/** Día de hoy de un intento ("Día 3 de 30") para el aviso del check-in. */
export const dayOf = (today: ISODate, start: ISODate) => dayNumber(today, start);

type Finish = { memberId: string; challengeId: string; title: string; badge: string | null };
/** Terminó un reto: premio (la base lo recuenta y nunca lo da dos veces), insignia, aviso en la app y evento del CRM. */
export async function finishRewards(s: Session, f: Finish): Promise<number> {
  const m = M[s.locale];
  const points = await award(s, "challenge_done", f.memberId);
  if (f.badge) await tryChallengeBadge(s, f.challengeId, f.badge);
  await notify(s, "logro", fill(m.doneNotice, { name: f.title }).slice(0, 140), m.doneNoticeBody, "/retos", `reto-done-${f.memberId}`);
  await crmEvent({ userId: s.userId }, "challenge_done", `${f.challengeId}:${f.memberId}`); // solo ids; nunca lanza
  return points;
}

type CountRow = { memberId: string; key: string; challengeId: string; title: string; count: number; target: number; finished: boolean; points: number; badge: string | null };

/**
 * La app cuenta sola una acción para los retos que la miden (registrar un gasto, cierre, aporte a una meta, clase, abrir la
 * app). La base comprueba el hecho; aquí se dan el punto del día y, si lo terminó, el premio. NUNCA lanza ni frena la
 * acción que lo llama: si algo falla (o la migración no está aplicada), solo queda un aviso sin datos personales.
 * Devuelve los puntos ganados.
 */
export async function countChallenge(s: Session, action: Action, ref = ""): Promise<number> {
  if (!s.canEdit || !s.active) return 0;
  try {
    const r = await raw(s).rpc("challenge_count", { p_action: action, p_ref: ref });
    if (r.error) {
      if (!notReady(r.error)) console.error("[retos] no se pudo contar", action, r.error.code ?? "");
      return 0;
    }
    let points = 0;
    for (const row of (Array.isArray(r.data) ? r.data : []) as CountRow[]) {
      points += await award(s, "challenge_day", `${row.memberId}:${row.key}`);
      if (row.finished) points += await finishRewards(s, row);
    }
    return points;
  } catch (e) {
    console.error("[retos] no se pudo contar", action, e instanceof Error ? e.message.slice(0, 60) : "error"); // sin datos personales
    return 0;
  }
}
