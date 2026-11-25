import "server-only";
import {
  advance, AudienceSchema, automationSourceKey, BlocksSchema, campaignSendAt, campaignSourceKey, campaignStartsAt, chargeRef, chargeWindow, compile,
  enrollmentRef, exitFor, ExitRulesSchema, inactiveRef, inactiveWindow, isUpcomingCharge, legalReady, matchesTrigger, mayMarket, renderMarketingEmail,
  maySms, parseTestNumbers, renderSms, resolveTz, retryAt, smsSendAt, stageFor, StepsSchema, TriggerSchema, unsubscribeHeaders, unsubscribeUrl, TRIGGER_KINDS,
  type ExitRules, type Facts, type LeafStepT, type Program, type Stage, type Step, type Trigger,
} from "@/lib/crm";
import { isProduction, sendEmailDetailed } from "@/lib/email/send";
import { chunks, mayEmail } from "@/lib/email/lib";
import { audienceBatch } from "./audience";
import { appUrl, CONTACT_COLS, crmFrom, crmReplyTo, loadLegal, must, type AutomationRow, type CampaignRow, type ContactRow, type Db, type EnrollmentRow, type MessageRow } from "./db";
import { addTag, applyStage, contactForUser, recordEvent, removeTag } from "./events";
import { sendSms, twilioConfig } from "./sms";

const BATCH = 500;
const EMAIL_BATCH = () => Math.max(1, Math.min(500, Number(process.env.CRM_EMAIL_BATCH) || 150));
const SMS_BATCH = () => Math.max(1, Math.min(200, Number(process.env.CRM_SMS_BATCH) || 50));

export type Auto = { id: string; name: string; status: AutomationRow["status"]; trigger: Trigger; steps: Step[]; program: Program; exit: ExitRules };

/** Automatizaciones válidas (las que no pasan la validación se ignoran y se cuentan). */
export function parseAutomation(r: AutomationRow): Auto | null {
  const t = TriggerSchema.safeParse(r.trigger), s = StepsSchema.safeParse(r.steps), x = ExitRulesSchema.safeParse(r.exit_rules ?? {});
  if (!t.success || !s.success || !x.success) return null;
  return { id: r.id, name: r.name, status: r.status, trigger: t.data, steps: s.data, program: compile(s.data), exit: x.data };
}

export type RunReport = Record<string, number | string | boolean | undefined>;

/**
 * Una corrida del motor (POST/GET /api/crm/run cada 10 minutos desde pg_cron). Idempotente: correr dos veces seguidas
 * no manda nada dos veces (eventos, inscripciones y mensajes son únicos; la cola se toma de forma atómica).
 * 1) Etapas al día · 2) detecta "no abre la app" y "faltan X días para un cobro" · 3) inscribe y saca de automatizaciones ·
 * 4) avanza los pasos que tocan · 5) encola campañas (hora de cada persona) · 6) envía la cola (correo y SMS).
 */
export async function runCrm(db: Db, opts: { now?: Date; budgetMs?: number } = {}): Promise<RunReport> {
  const started = Date.now();
  const deadline = started + (opts.budgetMs ?? 240_000);
  const left = () => Date.now() < deadline;
  const now = opts.now ?? new Date();
  const report: RunReport = {};

  const rows = must(await db.from("crm_automations").select("*").in("status", ["active", "paused"])) as AutomationRow[];
  const autos = rows.map(parseAutomation).filter((a): a is Auto => !!a);
  report.invalidAutomations = rows.length - autos.length;
  const active = autos.filter((a) => a.status === "active");

  // Cada etapa aislada: un error en una (una fila rara, una etiqueta borrada) no frena las demás; el envío siempre corre.
  const stage = async (name: string, fn: () => Promise<RunReport>) => {
    if (!left()) return;
    try {
      Object.assign(report, await fn());
    } catch (e) {
      report[`error_${name}`] = true;
      console.error(`[crm] ${name}`, e instanceof Error ? e.message.slice(0, 120) : "error"); // sin datos personales
    }
  };
  await stage("reconcile", () => reconcile(db, left));
  await stage("detect", () => detectTimeEvents(db, active, now));
  await stage("events", () => processEvents(db, autos, active, now, left));
  await stage("enrollments", () => advanceEnrollments(db, active, now, left));
  await stage("campaigns", () => enqueueCampaigns(db, now, left));
  await stage("email", () => drainEmail(db, left));
  await stage("sms", () => drainSms(db, left));
  await stage("counts", async () => { await refreshCampaigns(db); return {}; });
  report.ms = Date.now() - started;
  return report;
}

// ───────── 1) Usuarios ↔ contactos y etapas ─────────
type Ent = { user_id: string; state: string; stripe_status: string | null };
type Prof = { id: string; timezone: string | null; locale: string | null; country: string | null };

/** Etapa (etiqueta de sistema) al día para todos los contactos con cuenta. Las tareas diarias y el panel cambian estados sin avisar al CRM. */
async function reconcile(db: Db, left: () => boolean) {
  let linked = 0, stageChanges = 0, synced = 0;
  // Red de seguridad del disparador perfil → contacto: cuentas de los últimos 3 días sin contacto.
  const recent = must(await db.from("profiles").select("id").gte("created_at", new Date(Date.now() - 3 * 86_400_000).toISOString()).limit(1000)) as { id: string }[];
  for (const ids of chunks(recent.map((r) => r.id), 100)) {
    const have = new Set((must(await db.from("crm_contacts").select("user_id").in("user_id", ids)) as { user_id: string }[]).map((r) => r.user_id));
    for (const id of ids) if (!have.has(id) && (await contactForUser(db, id))) linked++;
  }
  let after: string | null = null;
  while (left()) {
    let q = db.from("crm_contacts").select("id, user_id, stage, timezone, locale, country").not("user_id", "is", null);
    if (after) q = q.gt("id", after);
    const cs = must(await q.order("id").limit(BATCH)) as { id: string; user_id: string; stage: Stage; timezone: string | null; locale: string; country: string | null }[];
    if (!cs.length) break;
    const uids = cs.map((c) => c.user_id);
    const ents = new Map<string, Ent>(), profs = new Map<string, Prof>();
    for (const ids of chunks(uids, 100)) {
      for (const e of must(await db.from("entitlements").select("user_id, state, stripe_status").in("user_id", ids)) as Ent[]) ents.set(e.user_id, e);
      for (const p of must(await db.from("profiles").select("id, timezone, locale, country").in("id", ids)) as Prof[]) profs.set(p.id, p);
    }
    for (const c of cs) {
      const e = ents.get(c.user_id);
      if (await applyStage(db, c, stageFor({ hasUser: true, state: e?.state ?? "free", stripeStatus: e?.stripe_status ?? null }))) stageChanges++;
      const p = profs.get(c.user_id);
      if (!p) continue;
      const patch: Record<string, string> = {};
      if (p.timezone && p.timezone !== c.timezone) patch.timezone = p.timezone;
      if ((p.locale === "es" || p.locale === "en") && p.locale !== c.locale) patch.locale = p.locale;
      if (p.country && p.country !== c.country) patch.country = p.country.slice(0, 8);
      if (Object.keys(patch).length) {
        must(await db.from("crm_contacts").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", c.id).select("id"));
        synced++;
      }
    }
    if (cs.length < BATCH) break;
    after = cs[cs.length - 1].id;
  }
  return { linked, stageChanges, synced };
}

// ───────── 2) Detecciones por tiempo ─────────
async function contactsByUser(db: Db, userIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const ids of chunks([...new Set(userIds)], 100)) {
    for (const r of must(await db.from("crm_contacts").select("id, user_id").in("user_id", ids)) as { id: string; user_id: string }[]) out.set(r.user_id, r.id);
  }
  return out;
}

async function pageAll<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const rows = must(await q(from, from + 999)) as T[];
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

async function detectTimeEvents(db: Db, active: Auto[], now: Date) {
  let inactive = 0, charges = 0;
  const inactiveDays = [...new Set(active.filter((a) => a.trigger.kind === "inactive_days").map((a) => a.trigger.days!))];
  for (const days of inactiveDays) {
    const w = inactiveWindow(now, days);
    const seen = await pageAll<{ id: string; last_active_at: string }>((a, b) => db.from("profiles").select("id, last_active_at").gte("last_active_at", w.from).lte("last_active_at", w.to).order("id").range(a, b));
    const never = await pageAll<{ id: string; created_at: string }>((a, b) => db.from("profiles").select("id, created_at").is("last_active_at", null).gte("created_at", w.from).lte("created_at", w.to).order("id").range(a, b));
    const list = [...seen.map((p) => ({ id: p.id, at: p.last_active_at })), ...never.map((p) => ({ id: p.id, at: p.created_at }))];
    const byUser = await contactsByUser(db, list.map((p) => p.id));
    for (const p of list) {
      const c = byUser.get(p.id);
      if (c && (await recordEvent(db, c, "inactive_days", inactiveRef(days, p.at)))) inactive++;
    }
  }
  const chargeDays = [...new Set(active.filter((a) => a.trigger.kind === "charge_upcoming").map((a) => a.trigger.days!))];
  for (const days of chargeDays) {
    const w = chargeWindow(now, days);
    const ents = await pageAll<{ user_id: string; state: string; stripe_status: string | null; cancel_at_period_end: boolean; pro_until: string | null }>((a, b) =>
      db.from("entitlements").select("user_id, state, stripe_status, cancel_at_period_end, pro_until").eq("state", "pro").eq("cancel_at_period_end", false)
        .in("stripe_status", ["trialing", "active"]).gte("pro_until", w.from).lte("pro_until", w.to).order("user_id").range(a, b));
    const byUser = await contactsByUser(db, ents.map((e) => e.user_id));
    for (const e of ents) {
      if (!isUpcomingCharge({ state: e.state, stripeStatus: e.stripe_status, cancelAtPeriodEnd: e.cancel_at_period_end, proUntil: e.pro_until })) continue;
      const c = byUser.get(e.user_id);
      if (c && (await recordEvent(db, c, "charge_upcoming", chargeRef(days, e.pro_until!, e.stripe_status === "trialing")))) charges++;
    }
  }
  return { inactiveDetected: inactive, chargesDetected: charges };
}

// ───────── 3) Eventos → inscripciones y salidas ─────────
type Ev = { id: number; contact_id: string; kind: string; ref: string; at: string };
type ActiveEnr = { id: string; automation_id: string; contact_id: string; trigger_event_id: number | null };

async function processEvents(db: Db, autos: Auto[], active: Auto[], now: Date, left: () => boolean) {
  let processed = 0, enrolled = 0, exited = 0;
  const byId = new Map(autos.map((a) => [a.id, a]));
  for (let round = 0; round < 10 && left(); round++) {
    const evs = must(await db.from("crm_events").select("id, contact_id, kind, ref, at").is("processed_at", null).order("id").limit(BATCH)) as Ev[];
    if (!evs.length) break;
    const enrs = new Map<string, ActiveEnr[]>();
    for (const ids of chunks([...new Set(evs.map((e) => e.contact_id))], 100)) {
      for (const r of must(await db.from("crm_enrollments").select("id, automation_id, contact_id, trigger_event_id").eq("status", "active").in("contact_id", ids)) as ActiveEnr[]) {
        enrs.set(r.contact_id, [...(enrs.get(r.contact_id) ?? []), r]);
      }
    }
    for (const e of evs) {
      const mine = enrs.get(e.contact_id) ?? [];
      for (const r of [...mine]) {
        const a = byId.get(r.automation_id);
        if (!a || (r.trigger_event_id ?? 0) >= e.id) continue;
        const reason = exitFor(a.exit, a.trigger, e);
        if (!reason) continue;
        must(await db.from("crm_enrollments").update({ status: "exited", exit_reason: reason, finished_at: now.toISOString(), next_at: null }).eq("id", r.id).eq("status", "active").select("id"));
        mine.splice(mine.indexOf(r), 1);
        exited++;
      }
      if ((TRIGGER_KINDS as readonly string[]).includes(e.kind)) {
        for (const a of active) {
          if (!a.program.first || mine.some((r) => r.automation_id === a.id) || !matchesTrigger(a.trigger, e)) continue;
          const ins = await db.from("crm_enrollments").insert({
            automation_id: a.id, contact_id: e.contact_id, trigger_ref: enrollmentRef(e), trigger_event_id: e.id,
            current_step_id: a.program.first, next_at: now.toISOString(),
          }).select("id").maybeSingle();
          if (ins.error) {
            if (ins.error.code === "23505") continue; // ya inscrito por este mismo hecho, o ya tiene una inscripción activa
            throw new Error(`db: ${ins.error.message}`);
          }
          if (ins.data) {
            mine.push({ id: (ins.data as { id: string }).id, automation_id: a.id, contact_id: e.contact_id, trigger_event_id: e.id });
            enrolled++;
          }
        }
      }
      enrs.set(e.contact_id, mine);
    }
    must(await db.from("crm_events").update({ processed_at: now.toISOString() }).in("id", evs.map((e) => e.id)).select("id"));
    processed += evs.length;
    if (evs.length < BATCH) break;
  }
  return { eventsProcessed: processed, enrolled, exited };
}

// ───────── 4) Avanzar inscripciones ─────────
const iso = (s: string | null | undefined) => (s ? new Date(s).toISOString() : null);
const CHECK_KINDS = [...TRIGGER_KINDS, "signup", "paying"];

async function insertMessage(db: Db, m: { contact_id: string; channel: "email" | "sms"; source_key: string; scheduled_for: Date; campaign_id?: string; automation_id?: string; enrollment_id?: string; step_id?: string }): Promise<boolean> {
  const r = must(await db.from("crm_messages").upsert({ ...m, scheduled_for: m.scheduled_for.toISOString() }, { onConflict: "source_key,contact_id", ignoreDuplicates: true }).select("id")) as unknown[];
  return r.length > 0;
}

async function countryTz(db: Db): Promise<Map<string, string>> {
  const rows = must(await db.from("countries").select("code, timezone")) as { code: string; timezone: string }[];
  return new Map(rows.map((r) => [r.code, r.timezone]));
}

async function advanceEnrollments(db: Db, active: Auto[], now: Date, left: () => boolean) {
  let advanced = 0, queued = 0, finished = 0, errors = 0, tagErrors = 0;
  if (!active.length) return { advanced, queuedFromAutomations: queued, finished };
  const byId = new Map(active.map((a) => [a.id, a]));
  const tzByCountry = await countryTz(db);
  for (let round = 0; round < 5 && left(); round++) {
    const due = must(await db.from("crm_enrollments").select("*").eq("status", "active").lte("next_at", now.toISOString())
      .in("automation_id", [...byId.keys()]).order("next_at").limit(200)) as EnrollmentRow[];
    if (!due.length) break;
    const cids = [...new Set(due.map((d) => d.contact_id))];
    const contacts = new Map<string, ContactRow>(), tags = new Map<string, Set<string>>(), events = new Map<string, Map<string, string[]>>();
    for (const ids of chunks(cids, 100)) {
      for (const c of must(await db.from("crm_contacts").select(CONTACT_COLS).in("id", ids)) as ContactRow[]) contacts.set(c.id, c);
      for (const t of must(await db.from("crm_contact_tags").select("contact_id, tag_id").in("contact_id", ids)) as { contact_id: string; tag_id: string }[]) {
        tags.set(t.contact_id, (tags.get(t.contact_id) ?? new Set()).add(t.tag_id));
      }
      const evs = await pageAll<{ contact_id: string; kind: string; at: string }>((a, b) => db.from("crm_events").select("contact_id, kind, at").in("contact_id", ids).in("kind", CHECK_KINDS).order("id").range(a, b));
      for (const e of evs) {
        const m = events.get(e.contact_id) ?? new Map<string, string[]>();
        m.set(e.kind, [...(m.get(e.kind) ?? []), iso(e.at)!]);
        events.set(e.contact_id, m);
      }
    }
    const uids = [...contacts.values()].map((c) => c.user_id).filter((x): x is string => !!x);
    const lastActive = new Map<string, string | null>(), chargeAt = new Map<string, string | null>();
    for (const ids of chunks(uids, 100)) {
      for (const p of must(await db.from("profiles").select("id, last_active_at").in("id", ids)) as { id: string; last_active_at: string | null }[]) lastActive.set(p.id, iso(p.last_active_at));
      for (const e of must(await db.from("entitlements").select("user_id, state, stripe_status, cancel_at_period_end, pro_until").in("user_id", ids)) as { user_id: string; state: string; stripe_status: string | null; cancel_at_period_end: boolean; pro_until: string | null }[]) {
        chargeAt.set(e.user_id, isUpcomingCharge({ state: e.state, stripeStatus: e.stripe_status, cancelAtPeriodEnd: e.cancel_at_period_end, proUntil: e.pro_until }) ? iso(e.pro_until) : null);
      }
    }
    for (const enr of due) {
      if (!left()) break;
      const a = byId.get(enr.automation_id), c = contacts.get(enr.contact_id);
      if (!a || !c) continue;
      try {
      // Se toma la inscripción (otra corrida a la vez no la avanza dos veces).
      const claim = must(await db.from("crm_enrollments").update({ next_at: new Date(now.getTime() + 5 * 60_000).toISOString() })
        .eq("id", enr.id).eq("status", "active").eq("next_at", enr.next_at!).select("id")) as unknown[];
      if (!claim.length) continue;
      const facts: Facts = {
        hasAccount: !!c.user_id, stage: c.stage as Stage, tagIds: new Set(tags.get(c.id) ?? []), events: events.get(c.id) ?? new Map(),
        enrolledAt: iso(enr.enrolled_at)!, lastActiveAt: c.user_id ? lastActive.get(c.user_id) ?? null : null, chargeAt: c.user_id ? chargeAt.get(c.user_id) ?? null : null,
      };
      const { actions, outcome } = advance(a.program, enr.current_step_id, facts, now);
      const tz = resolveTz(c.timezone, c.country ? tzByCountry.get(c.country) : null);
      for (const act of actions) {
        const key = automationSourceKey(a.id, act.step.id, enr.id);
        if (act.type === "email" && (await insertMessage(db, { contact_id: c.id, channel: "email", source_key: key, scheduled_for: now, automation_id: a.id, enrollment_id: enr.id, step_id: act.step.id }))) queued++;
        if (act.type === "sms" && c.phone && (await insertMessage(db, { contact_id: c.id, channel: "sms", source_key: key, scheduled_for: smsSendAt(now, tz), automation_id: a.id, enrollment_id: enr.id, step_id: act.step.id }))) queued++;
        if (act.type === "tag") {
          // Una etiqueta borrada (o de sistema) no frena la automatización: el paso se salta.
          try {
            if (act.step.action === "add") await addTag(db, c.id, act.step.tagId, "automation"); else await removeTag(db, c.id, act.step.tagId);
          } catch { tagErrors++; }
        }
      }
      const patch = outcome.status === "active"
        ? { current_step_id: outcome.nextStepId, next_at: outcome.nextAt.toISOString() }
        : outcome.status === "done"
          ? { status: "done", current_step_id: null, next_at: null, finished_at: now.toISOString() }
          : { status: "exited", exit_reason: "deleted_step", next_at: null, finished_at: now.toISOString() };
      must(await db.from("crm_enrollments").update(patch).eq("id", enr.id).select("id"));
      advanced++;
      if (outcome.status !== "active") finished++;
      } catch (e) {
        // Esta inscripción queda tomada 5 minutos y se reintenta en la próxima corrida; las demás siguen.
        errors++;
        console.error("[crm] inscripción", e instanceof Error ? e.message.slice(0, 120) : "error");
      }
    }
    if (due.length < 200) break;
  }
  return { advanced, queuedFromAutomations: queued, finished, enrollmentErrors: errors, tagErrors };
}

// ───────── 5) Campañas → cola (hora de cada persona) ─────────
async function enqueueCampaigns(db: Db, now: Date, left: () => boolean) {
  let started = 0, queued = 0;
  const list = must(await db.from("crm_campaigns").select("*").in("status", ["scheduled", "sending"]).is("enqueued_at", null)) as CampaignRow[];
  const tzByCountry = list.length ? await countryTz(db) : new Map<string, string>();
  for (const c of list) {
    if (!left()) break;
    if (c.status === "scheduled") {
      const startsAt = c.send_mode === "local" && c.scheduled_local ? campaignStartsAt(c.scheduled_local) : c.scheduled_at ? new Date(c.scheduled_at) : now;
      if (startsAt > now) continue;
      const ok = must(await db.from("crm_campaigns").update({ status: "sending", updated_at: now.toISOString() }).eq("id", c.id).eq("status", "scheduled").select("id")) as unknown[];
      if (!ok.length) continue;
      started++;
    }
    const audience = AudienceSchema.safeParse(c.audience ?? {});
    if (!audience.success) {
      must(await db.from("crm_campaigns").update({ status: "cancelled", updated_at: now.toISOString() }).eq("id", c.id).select("id"));
      continue;
    }
    let cursor = c.enqueue_cursor;
    for (;;) {
      if (!left()) break;
      const batch = await audienceBatch(db, audience.data, cursor, BATCH);
      const rows = batch.map((p) => ({
        contact_id: p.id, channel: "email", source_key: campaignSourceKey(c.id), campaign_id: c.id,
        scheduled_for: campaignSendAt(c.send_mode, c.scheduled_local, resolveTz(p.timezone, p.country ? tzByCountry.get(p.country) : null), now).toISOString(),
      }));
      if (rows.length) queued += (must(await db.from("crm_messages").upsert(rows, { onConflict: "source_key,contact_id", ignoreDuplicates: true }).select("id")) as unknown[]).length;
      cursor = batch.length ? batch[batch.length - 1].id : cursor;
      const done = batch.length < BATCH;
      const patch: Record<string, unknown> = { enqueue_cursor: cursor, updated_at: new Date().toISOString() };
      if (done) {
        const r = await db.from("crm_messages").select("id", { count: "exact", head: true }).eq("campaign_id", c.id);
        if (r.error) throw new Error(`db: ${r.error.message}`);
        Object.assign(patch, { enqueued_at: new Date().toISOString(), recipients_count: r.count ?? 0 });
      }
      must(await db.from("crm_campaigns").update(patch).eq("id", c.id).select("id"));
      if (done) break;
    }
  }
  return { campaignsStarted: started, queuedFromCampaigns: queued };
}

// ───────── 6) Enviar la cola ─────────
type Content = { subject: string; preheader: string; blocks: unknown };

async function contentFor(db: Db, msgs: MessageRow[]) {
  const campaigns = new Map<string, Content>(), steps = new Map<string, LeafStepT>();
  const cids = [...new Set(msgs.map((m) => m.campaign_id).filter((x): x is string => !!x))];
  if (cids.length) for (const c of must(await db.from("crm_campaigns").select("id, subject, preheader, blocks").in("id", cids)) as (Content & { id: string })[]) campaigns.set(c.id, c);
  const aids = [...new Set(msgs.map((m) => m.automation_id).filter((x): x is string => !!x))];
  if (aids.length) {
    for (const r of must(await db.from("crm_automations").select("*").in("id", aids)) as AutomationRow[]) {
      const a = parseAutomation(r);
      if (!a) continue;
      for (const s of a.steps) for (const leaf of s.type === "condition" ? [...s.yes, ...s.no] : [s]) steps.set(`${a.id}:${leaf.id}`, leaf);
    }
  }
  return { campaigns, steps };
}

async function contactsAndSuppressions(db: Db, msgs: MessageRow[]) {
  const contacts = new Map<string, ContactRow>();
  for (const ids of chunks([...new Set(msgs.map((m) => m.contact_id))], 100)) {
    for (const c of must(await db.from("crm_contacts").select(CONTACT_COLS).in("id", ids)) as ContactRow[]) contacts.set(c.id, c);
  }
  const values = [...contacts.values()].flatMap((c) => [c.email, c.phone].filter((x): x is string => !!x));
  const suppressed = new Set<string>();
  for (const vs of chunks(values, 100)) {
    for (const s of must(await db.from("crm_suppressions").select("channel, value").in("value", vs).is("lifted_at", null)) as { channel: string; value: string }[]) suppressed.add(`${s.channel}:${s.value}`);
  }
  const consent = (c: ContactRow) => ({
    emailConsent: c.email_consent, emailUnsubscribedAt: c.email_unsubscribed_at, smsConsent: c.sms_consent, smsUnsubscribedAt: c.sms_unsubscribed_at,
    phone: c.phone, emailSuppressed: suppressed.has(`email:${c.email}`), smsSuppressed: !!c.phone && suppressed.has(`sms:${c.phone}`),
  });
  return { contacts, consent };
}

/** Deja el motivo en los mensajes que tocan y no pueden salir (falta configuración): siguen en la cola. */
async function markWaiting(db: Db, channel: "email" | "sms", reason: string) {
  if (!isProduction()) return; // una corrida local (contra la base de producción) no escribe motivos en la cola real
  must(await db.from("crm_messages").update({ error: reason }).eq("channel", channel).eq("status", "queued").lte("scheduled_for", new Date().toISOString())
    .or(`error.is.null,error.neq.${reason}`).select("id"));
}

const finish = (db: Db, id: string, patch: Record<string, unknown>) => db.from("crm_messages").update({ locked_at: null, ...patch }).eq("id", id).select("id").then(must);

async function drainEmail(db: Db, left: () => boolean) {
  let sent = 0, skipped = 0, failed = 0;
  if (!(process.env.RESEND_API_KEY ?? "").trim() || !crmFrom()) {
    await markWaiting(db, "email", "missing_resend_api_key");
    return { emailSent: 0, emailWaiting: "missing_resend_api_key" };
  }
  const legal = await loadLegal(db);
  if (!legalReady(legal)) {
    await markWaiting(db, "email", "legal_incomplete");
    return { emailSent: 0, emailWaiting: "legal_incomplete" };
  }
  const total = EMAIL_BATCH(), app = appUrl();
  let done = 0;
  while (done < total && left()) {
    const msgs = must(await db.rpc("crm_claim_messages", { p_channel: "email", p_limit: Math.min(25, total - done) })) as MessageRow[];
    if (!msgs.length) break;
    done += msgs.length;
    const { campaigns, steps } = await contentFor(db, msgs);
    const { contacts, consent } = await contactsAndSuppressions(db, msgs);
    let released = 0;
    for (const m of msgs) {
      const c = contacts.get(m.contact_id);
      // Fuera de producción (local o preview, contra la MISMA base) solo salen correos a @revolucion360.test: los demás se
      // devuelven a la cola intactos para que la corrida de producción los envíe (nunca se marcan "skipped").
      if (c && !mayEmail(c.email, isProduction())) { await finish(db, m.id, { status: "queued", attempts: m.attempts - 1 }); released++; continue; }
      const step = m.automation_id && m.step_id ? steps.get(`${m.automation_id}:${m.step_id}`) : undefined;
      const content: Content | null = m.campaign_id ? campaigns.get(m.campaign_id) ?? null : step?.type === "email" ? step : null;
      const blocks = BlocksSchema.safeParse(content?.blocks);
      if (!c || !content || !blocks.success || !content.subject) { await finish(db, m.id, { status: "skipped", error: "missing_content" }); skipped++; continue; }
      const may = mayMarket("email", consent(c));
      if (!may.ok) { await finish(db, m.id, { status: "skipped", error: may.reason }); skipped++; continue; }
      const r = renderMarketingEmail({ subject: content.subject, preheader: content.preheader, blocks: blocks.data, locale: c.locale, appUrl: app, name: c.name, legal, token: c.token, fromLabel: "" });
      const res = await sendEmailDetailed(c.email, r, "crm", { from: crmFrom(), replyTo: crmReplyTo(), headers: unsubscribeHeaders(unsubscribeUrl(app, c.token)), idempotencyKey: `crm-${m.id}` });
      if (res.status === "sent") {
        await finish(db, m.id, { status: "sent", provider_id: res.id ?? null, sent_at: new Date().toISOString(), error: null });
        await recordEvent(db, c.id, "email_sent", m.id);
        sent++;
      } else if (res.status === "skipped") {
        await finish(db, m.id, { status: "skipped", error: res.error ?? "skipped" });
        skipped++;
      } else {
        const again = retryAt(m.attempts, new Date());
        await finish(db, m.id, again ? { status: "queued", scheduled_for: again.toISOString(), error: res.error ?? "failed" } : { status: "failed", error: res.error ?? "failed" });
        failed++;
      }
    }
    if (released) break; // fuera de producción: una sola tanda, para no volver a tomar los mismos
  }
  return { emailSent: sent, emailSkipped: skipped, emailFailed: failed };
}

async function drainSms(db: Db, left: () => boolean) {
  let sent = 0, skipped = 0, failed = 0, deferred = 0;
  // Un SMS que quedó "enviando" no se reintenta solo (Twilio no deduplica): queda fallido para revisarlo.
  if (isProduction()) {
    must(await db.from("crm_messages").update({ status: "failed", error: "stuck_unknown", locked_at: null }).eq("channel", "sms").eq("status", "sending")
      .lt("locked_at", new Date(Date.now() - 15 * 60_000).toISOString()).select("id"));
  }
  if (!twilioConfig()) {
    await markWaiting(db, "sms", "missing_twilio_config");
    return { smsSent: 0, smsWaiting: "missing_twilio_config" };
  }
  const tzByCountry = await countryTz(db);
  const total = SMS_BATCH();
  let done = 0;
  while (done < total && left()) {
    const msgs = must(await db.rpc("crm_claim_messages", { p_channel: "sms", p_limit: Math.min(25, total - done) })) as MessageRow[];
    if (!msgs.length) break;
    done += msgs.length;
    const { steps } = await contentFor(db, msgs);
    const { contacts, consent } = await contactsAndSuppressions(db, msgs);
    let released = 0;
    const testNumbers = parseTestNumbers(process.env.SMS_TEST_NUMBERS);
    for (const m of msgs) {
      const c = contacts.get(m.contact_id);
      // Fuera de producción solo a SMS_TEST_NUMBERS; los demás vuelven a la cola intactos (como los correos).
      if (c?.phone && !maySms(c.phone, isProduction(), testNumbers)) { await finish(db, m.id, { status: "queued", attempts: m.attempts - 1 }); released++; continue; }
      const step = m.automation_id && m.step_id ? steps.get(`${m.automation_id}:${m.step_id}`) : undefined;
      if (!c || step?.type !== "sms") { await finish(db, m.id, { status: "skipped", error: "missing_content" }); skipped++; continue; }
      const may = mayMarket("sms", consent(c));
      if (!may.ok) { await finish(db, m.id, { status: "skipped", error: may.reason }); skipped++; continue; }
      // Nunca de noche en su hora (un SMS que esperó configuración puede llegar a deshoras).
      const at = smsSendAt(new Date(), resolveTz(c.timezone, c.country ? tzByCountry.get(c.country) : null));
      if (at.getTime() > Date.now() + 60_000) { await finish(db, m.id, { status: "queued", scheduled_for: at.toISOString(), attempts: m.attempts - 1 }); deferred++; continue; }
      const res = await sendSms(c.phone!, renderSms(step.body, c.locale, c.name));
      if (res.status === "sent") {
        await finish(db, m.id, { status: "sent", provider_id: res.id, sent_at: new Date().toISOString(), error: null });
        await recordEvent(db, c.id, "sms_sent", m.id);
        sent++;
      } else if (res.status === "skipped") {
        await finish(db, m.id, { status: "skipped", error: res.error });
        skipped++;
      } else {
        if (res.optedOut) await db.rpc("crm_apply_consent", { p_contact: c.id, p_channel: "sms", p_on: false, p_source: "sms_stop" });
        const again = res.retry ? retryAt(m.attempts, new Date()) : null;
        await finish(db, m.id, again ? { status: "queued", scheduled_for: again.toISOString(), error: res.error } : { status: "failed", error: res.error });
        failed++;
      }
    }
    if (released) break;
  }
  return { smsSent: sent, smsSkipped: skipped, smsFailed: failed, smsDeferred: deferred };
}

/** Conteos de enviados / abiertos / clics de las campañas recientes (los abiertos y clics llegan por el webhook de Resend). */
async function refreshCampaigns(db: Db) {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const ids = (must(await db.from("crm_campaigns").select("id").or(`status.eq.sending,sent_at.gte.${since}`)) as { id: string }[]).map((r) => r.id);
  if (ids.length) must(await db.rpc("crm_refresh_campaigns", { p_ids: ids }));
}
