// Pruebas de permisos contra Supabase LOCAL. Demuestran que la base de datos impone las reglas, no la pantalla.
// NUNCA corren contra la base de producción: crean y borran usuarios y cambian app_config (CLAUDE.md, regla 0).
// Solo leen .env.local y solo corren si su URL es 127.0.0.1/localhost; con la base remota se saltan.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

try { process.loadEnvFile(".env.local"); } catch { /* sin archivo: se saltan */ }
const RAW_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const isLocal = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(RAW_URL) && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
// Si la URL no es local, el cliente ni siquiera recibe la URL ni las claves reales.
const URL = isLocal ? RAW_URL : "http://127.0.0.1:1";
const ANON = isLocal ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" : "sin-clave";
const SERVICE = isLocal ? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "" : "sin-clave";
// Si Supabase local no está corriendo (Docker apagado), estas pruebas se saltan en vez de fallar.
const up = isLocal && (await fetch(`${URL}/auth/v1/health`, { headers: { apikey: ANON } }).then((r) => r.ok, () => false));
const local = up;

describe.skipIf(!local)("permisos en la base de datos", () => {
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
  const stamp = Date.now();
  const pw = `Prueba-${stamp}-x9`;
  const ids: string[] = [];
  let ana: SupabaseClient, beto: SupabaseClient, jefe: SupabaseClient;
  let anaId = "", betoId = "", jefeId = "", anaTx = "", anaCat = "";

  async function user(name: string) {
    const email = `${name}-${stamp}@prueba.test`;
    const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { name } });
    if (error) throw error;
    ids.push(data.user.id);
    const c = createClient(URL, ANON, { auth: { persistSession: false } });
    const r = await c.auth.signInWithPassword({ email, password: pw });
    if (r.error) throw r.error;
    return { c, id: data.user.id };
  }

  beforeAll(async () => {
    ({ c: ana, id: anaId } = await user("ana"));
    ({ c: beto, id: betoId } = await user("beto"));
    ({ c: jefe, id: jefeId } = await user("jefe"));
    await admin.from("profiles").update({ role: "admin" }).eq("id", jefeId);
    await admin.from("app_config").update({ value: false }).eq("key", "admin_mfa_required");
    const cat = await ana.from("categories").insert({ user_id: anaId, name: "Hogar y básicos", kind: "expense" }).select("id").single();
    anaCat = cat.data!.id;
    const acc = await ana.from("accounts").insert({ user_id: anaId, name: "Ubank", kind: "bank", balance_cents: 500000 }).select("id").single();
    const tx = await ana.from("transactions").insert({ user_id: anaId, account_id: acc.data!.id, date: "2026-11-03", amount_cents: -133000, description: "Home" }).select("id").single();
    anaTx = tx.data!.id;
  });
  afterAll(async () => {
    for (const id of ids) { const r = await admin.auth.admin.deleteUser(id); if (r.error && !/not found/i.test(r.error.message)) throw r.error; }
  });

  it("al registrarse nace con perfil y plan Gratis", async () => {
    const p = await ana.from("profiles").select("role, onboarding_step").single();
    expect(p.data).toMatchObject({ role: "user", onboarding_step: "welcome" });
    expect((await ana.from("entitlements").select("state").single()).data?.state).toBe("free");
  });

  it("un usuario no puede leer datos de otro", async () => {
    for (const t of ["transactions", "accounts", "categories", "plan_lines", "goals", "debts", "investments", "month_closures", "transaction_history"]) {
      const r = await beto.from(t).select("*");
      expect(r.data, t).toEqual([]);
    }
    expect((await beto.from("profiles").select("id")).data).toEqual([{ id: betoId }]);
  });

  it("un usuario no puede escribir ni cambiar datos de otro", async () => {
    const ins = await beto.from("transactions").insert({ user_id: anaId, date: "2026-11-04", amount_cents: -100, description: "intruso" });
    expect(ins.error).not.toBeNull();
    await beto.from("transactions").update({ amount_cents: -1 }).eq("id", anaTx);
    await beto.from("transactions").delete().eq("id", anaTx);
    const still = await ana.from("transactions").select("amount_cents").eq("id", anaTx).single();
    expect(still.data?.amount_cents).toBe(-133000);
  });

  it("nadie se sube el plan ni el rol a sí mismo", async () => {
    await beto.from("entitlements").update({ state: "pro" }).eq("user_id", betoId);
    expect((await beto.from("entitlements").select("state").single()).data?.state).toBe("free");
    await beto.from("profiles").update({ role: "admin" }).eq("id", betoId);
    expect((await beto.from("profiles").select("role").single()).data?.role).toBe("user");
    expect((await beto.rpc("is_admin")).data).toBe(false);
  });

  it("los puntos solo se ganan por hechos reales y una sola vez", async () => {
    expect((await beto.rpc("award_points", { p_kind: "closure", p_ref: "2026-11" })).data).toBe(0); // no cerró nada
    expect((await beto.from("point_events").insert({ user_id: betoId, kind: "x", ref: "y", points: 9999 })).error).not.toBeNull();
    await beto.from("month_closures").insert({ user_id: betoId, year: 2026, month: 11 });
    expect((await beto.rpc("award_points", { p_kind: "closure", p_ref: "2026-11" })).data).toBe(30);
    expect((await beto.rpc("award_points", { p_kind: "closure", p_ref: "2026-11" })).data).toBe(0);
    // reabrir y volver a cerrar no devuelve puntos
    await beto.from("month_closures").delete().eq("user_id", betoId);
    await beto.from("month_closures").insert({ user_id: betoId, year: 2026, month: 11 });
    expect((await beto.rpc("award_points", { p_kind: "closure", p_ref: "2026-11" })).data).toBe(0);
  });

  it("admin no puede ver montos, movimientos, cuentas ni deudas", async () => {
    expect((await jefe.rpc("is_admin")).data).toBe(true);
    for (const t of ["transactions", "accounts", "plan_lines", "plan_cells", "goals", "goal_entries", "debts", "investments", "month_totals", "transaction_history", "tax_entries", "company_entries"]) {
      expect((await jefe.from(t).select("*")).data, t).toEqual([]);
    }
    const users = await jefe.rpc("admin_users", { p_search: `ana-${stamp}` });
    expect(users.data).toHaveLength(1);
    const text = JSON.stringify([users.data, (await jefe.rpc("admin_user", { p_user: anaId })).data, (await jefe.rpc("admin_summary")).data]);
    expect(text).not.toMatch(/cents|133000|500000|balance/);
  });

  it("las funciones de admin están cerradas para los demás", async () => {
    expect((await beto.rpc("admin_users")).error).not.toBeNull();
    expect((await beto.rpc("admin_user", { p_user: anaId })).error).not.toBeNull();
    expect((await beto.rpc("admin_grant_access", { p_user: betoId, p_kind: "fundador", p_expires: null })).error).not.toBeNull();
    expect((await beto.from("admin_audit").select("*")).data).toEqual([]);
    expect((await beto.from("app_config").update({ value: {} }).eq("key", "features").select()).data).toEqual([]);
  });

  it("admin da acceso de alumno y queda en el registro de actividad", async () => {
    const r = await jefe.rpc("admin_grant_access", { p_user: anaId, p_kind: "alumno", p_expires: "2027-02-24T00:00:00Z" });
    expect(r.error).toBeNull();
    expect((await ana.from("entitlements").select("state, access_until").single()).data?.state).toBe("alumno");
    const audit = await jefe.from("admin_audit").select("action, target_user").eq("target_user", anaId);
    expect(audit.data?.map((a) => a.action)).toContain("dar_acceso");
  });

  it("en solo lectura se lee todo pero no se edita, y no se pierde nada", async () => {
    await admin.from("entitlements").update({ state: "read_only" }).eq("user_id", anaId);
    expect((await ana.from("transactions").select("id")).data).toHaveLength(1);
    expect((await ana.from("transactions").insert({ user_id: anaId, date: "2026-11-05", amount_cents: -500, description: "café" })).error).not.toBeNull();
    await ana.from("transactions").update({ amount_cents: -1 }).eq("id", anaTx);
    await ana.from("categories").delete().eq("id", anaCat);
    expect((await ana.from("transactions").select("amount_cents").eq("id", anaTx).single()).data?.amount_cents).toBe(-133000);
    expect((await ana.from("categories").select("id")).data).toHaveLength(1);
  });

  it("acceso vencido pasa a Gratis sin perder datos", async () => {
    await admin.from("entitlements").update({ state: "free", access_until: null }).eq("user_id", anaId);
    expect((await ana.from("transactions").select("id")).data).toHaveLength(1);
    expect((await ana.from("transactions").insert({ user_id: anaId, date: "2026-11-05", amount_cents: -500, description: "café" })).error).toBeNull();
  });

  it("cada edición de un movimiento queda en el historial", async () => {
    await ana.from("transactions").update({ amount_cents: -134000, edited_at: new Date().toISOString() }).eq("id", anaTx);
    const h = await ana.from("transaction_history").select("action").eq("transaction_id", anaTx).order("at");
    expect(h.data?.map((x) => x.action)).toEqual(["create", "update"]);
    expect((await ana.from("transaction_history").delete().eq("transaction_id", anaTx).select()).data).toEqual([]);
  });

  it("más de 1,000 filas: la API corta en 1,000 y por eso los cargadores paginan", async () => {
    const rows = Array.from({ length: 1250 }, (_, i) => ({ user_id: betoId, date: "2026-03-10", amount_cents: -100, description: `fila ${i}` }));
    expect((await beto.from("transactions").insert(rows)).error).toBeNull();
    expect((await beto.from("transactions").select("id").limit(5000)).data).toHaveLength(1000); // el tope del servidor
    const all: unknown[] = [];
    for (let from = 0; ; from += 1000) {
      const { data } = await beto.from("transactions").select("id").order("id").range(from, from + 999);
      all.push(...(data ?? []));
      if ((data ?? []).length < 1000) break;
    }
    expect(all).toHaveLength(1250);
  });

  it("un dato no puede apuntar a un dato de otro usuario", async () => {
    const r = await beto.from("transactions").insert({ user_id: betoId, date: "2026-11-05", amount_cents: -1, description: "x", category_id: anaCat });
    expect(r.error).not.toBeNull();
  });

  it("borrar la cuenta borra todos sus datos", async () => {
    const { c, id } = await user("caro");
    const cat = await c.from("categories").insert({ user_id: id, name: "Hogar", kind: "expense" }).select("id").single();
    const line = await c.from("plan_lines").insert({ user_id: id, year: 2026, category_id: cat.data!.id, name: "Home", kind: "expense" }).select("id").single();
    await c.from("plan_cells").insert({ user_id: id, line_id: line.data!.id, month: 11, amount_cents: 133000 });
    await c.from("transactions").insert({ user_id: id, date: "2026-11-03", amount_cents: -133000, description: "Home", plan_line_id: line.data!.id, category_id: cat.data!.id });
    expect((await c.from("categories").delete().eq("id", cat.data!.id)).error).not.toBeNull(); // una categoría con líneas no se borra
    const del = await admin.auth.admin.deleteUser(id);
    expect(del.error).toBeNull();
    for (const t of ["profiles", "categories", "plan_lines", "plan_cells", "transactions", "transaction_history", "entitlements"] as const) {
      const col = t === "profiles" ? "id" : "user_id";
      expect((await admin.from(t).select("*", { count: "exact", head: true }).eq(col, id)).count, t).toBe(0);
    }
  });

  it("los borradores de la Academia y los videos Pro no se leen por la API", async () => {
    expect((await beto.from("courses").select("slug")).data?.map((x) => x.slug)).toEqual(["empieza-aqui"]);
    const pro = await admin.from("courses").select("id").eq("slug", "sal-de-deudas").single();
    await admin.from("courses").update({ status: "published" }).eq("id", pro.data!.id);
    const lesson = await admin.from("lessons").insert({ course_id: pro.data!.id, title: "Clase Pro", tier: "pro" }).select("id").single();
    await admin.from("lesson_media").insert({ lesson_id: lesson.data!.id, video_url: "https://video.test/pro" });
    expect((await beto.from("lessons").select("title").eq("id", lesson.data!.id)).data).toHaveLength(1);       // ve que existe
    expect((await beto.from("lesson_media").select("video_url").eq("lesson_id", lesson.data!.id)).data).toEqual([]); // pero no el video
    await admin.from("entitlements").update({ state: "alumno", access_until: null }).eq("user_id", betoId);
    expect((await beto.from("lesson_media").select("video_url").eq("lesson_id", lesson.data!.id)).data).toHaveLength(1);
    await admin.from("entitlements").update({ state: "free" }).eq("user_id", betoId);
    await admin.from("lessons").delete().eq("id", lesson.data!.id);
    await admin.from("courses").update({ status: "draft" }).eq("id", pro.data!.id);
  });

  it("sin sesión no se lee nada", async () => {
    const anon = createClient(URL, ANON, { auth: { persistSession: false } });
    for (const t of ["transactions", "profiles", "app_config", "admin_audit"]) expect((await anon.from(t).select("*")).data ?? [], t).toEqual([]);
  });
});

// Subroles de administrador (migración 20261125000033): la base, no la pantalla, decide qué puede cada uno.
describe.skipIf(!local)("subroles de administrador en la base de datos", () => {
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
  const stamp = Date.now();
  const pw = `Prueba-${stamp}-r7`;
  const ids: string[] = [];
  let duena: SupabaseClient, conte: SupabaseClient, sopo: SupabaseClient;
  let duenaId = "", conteId = "", sopoId = "", userId = "", userEmail = "";
  type Rpc = { data: unknown; error: { message: string } | null };
  const rpc = (c: SupabaseClient, fn: string, args: Record<string, unknown> = {}) => c.rpc(fn as never, args as never) as unknown as Promise<Rpc>;

  async function user(name: string) {
    const email = `${name}-${stamp}@prueba.test`;
    const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { name } });
    if (error) throw error;
    ids.push(data.user.id);
    const c = createClient(URL, ANON, { auth: { persistSession: false } });
    const r = await c.auth.signInWithPassword({ email, password: pw });
    if (r.error) throw r.error;
    return { c, id: data.user.id, email };
  }

  beforeAll(async () => {
    ({ c: duena, id: duenaId } = await user("duena"));
    ({ c: conte, id: conteId } = await user("conte"));
    ({ c: sopo, id: sopoId } = await user("sopo"));
    ({ id: userId, email: userEmail } = await user("usuaria"));
    // La dueña queda con admin_role null: así es la cuenta admin que existe hoy (null en un admin = Dueño).
    await admin.from("profiles").update({ role: "admin" }).eq("id", duenaId);
    await admin.from("profiles").update({ role: "admin", admin_role: "content" } as never).eq("id", conteId);
    await admin.from("profiles").update({ role: "admin", admin_role: "support" } as never).eq("id", sopoId);
    await admin.from("app_config").update({ value: false }).eq("key", "admin_mfa_required");
  });
  afterAll(async () => {
    for (const id of ids) { const r = await admin.auth.admin.deleteUser(id); if (r.error && !/not found/i.test(r.error.message)) throw r.error; }
  });

  it("un admin sin subrol es Dueño; cada quien sabe su rol", async () => {
    expect((await rpc(duena, "my_admin_role")).data).toBe("owner");
    expect((await rpc(conte, "my_admin_role")).data).toBe("content");
    expect((await rpc(sopo, "my_admin_role")).data).toBe("support");
  });

  it("nadie se sube el rol ni el subrol desde su propia fila", async () => {
    await conte.from("profiles").update({ admin_role: "owner" } as never).eq("id", conteId);
    await sopo.from("profiles").update({ role: "user", admin_role: "owner" } as never).eq("id", sopoId);
    const rows = await admin.from("profiles").select("id, role, admin_role" as never).in("id", [conteId, sopoId]);
    expect(rows.data).toEqual(expect.arrayContaining([
      { id: conteId, role: "admin", admin_role: "content" }, { id: sopoId, role: "admin", admin_role: "support" },
    ]));
  });

  it("Contenido escribe la Academia y los países, no los precios, cupones, soporte ni accesos", async () => {
    const c = await conte.from("courses").insert({ slug: `prueba-${stamp}`, title: "Curso de prueba" }).select("id").single();
    expect(c.error).toBeNull();
    expect((await sopo.from("courses").update({ title: "x" }).eq("id", c.data!.id).select("id")).data).toEqual([]);
    expect((await conte.from("coupons").select("*")).data).toEqual([]);
    expect((await conte.from("price_regions").update({ monthly_cents: 1 }).eq("region", "DEFAULT").select("region")).data).toEqual([]);
    expect((await conte.from("support_tickets").select("*")).data).toEqual([]);
    expect((await rpc(conte, "admin_grant_access", { p_user: userId, p_kind: "alumno", p_expires: null })).error).not.toBeNull();
    expect((await rpc(conte, "admin_users_v2")).error).not.toBeNull();
    await admin.from("courses").delete().eq("id", c.data!.id);
  });

  it("app_config: Contenido solo toca sus claves; los 2 pasos del panel solo el Dueño", async () => {
    expect((await conte.from("app_config").update({ value: true }).eq("key", "admin_mfa_required").select("key")).data).toEqual([]);
    expect((await sopo.from("app_config").update({ value: true }).eq("key", "admin_mfa_required").select("key")).data).toEqual([]);
    const pts = await admin.from("app_config").select("value").eq("key", "points").single();
    expect((await conte.from("app_config").update({ value: pts.data!.value }).eq("key", "points").select("key")).data).toHaveLength(1);
    expect((await duena.from("app_config").update({ value: false }).eq("key", "admin_mfa_required").select("key")).data).toHaveLength(1);
  });

  it("Soporte da accesos y no puede suspender ni ver la ficha de otro admin", async () => {
    expect((await rpc(sopo, "admin_grant_access", { p_user: userId, p_kind: "alumno", p_expires: null })).error).toBeNull();
    expect((await rpc(sopo, "admin_set_suspended", { p_user: duenaId, p_on: true })).error).not.toBeNull();
    expect((await rpc(sopo, "admin_user", { p_user: duenaId })).data).toBeNull();
    expect((await rpc(sopo, "admin_user", { p_user: userId })).data).not.toBeNull();
    expect((await sopo.from("courses").insert({ slug: `nope-${stamp}`, title: "x" })).error).not.toBeNull();
  });

  it("solo el Dueño invita y cambia roles, y todo queda en el registro", async () => {
    expect((await rpc(sopo, "admin_invite", { p_email: userEmail, p_role: "support" })).error).not.toBeNull();
    expect((await rpc(conte, "admin_set_role", { p_user: userId, p_role: "admin" })).error).not.toBeNull();
    expect((await rpc(duena, "admin_invite", { p_email: `nadie-${stamp}@prueba.test`, p_role: "content" })).data).toBe("not_found");
    expect((await rpc(duena, "admin_invite", { p_email: userEmail.toUpperCase(), p_role: "content" })).data).toBe("ok");
    expect((await rpc(duena, "admin_set_admin_role", { p_user: userId, p_role: "support" })).error).toBeNull();
    expect((await rpc(duena, "admin_set_admin_role", { p_user: duenaId, p_role: "none" })).error).not.toBeNull(); // nunca a sí misma
    expect((await rpc(duena, "admin_set_admin_role", { p_user: userId, p_role: "none" })).error).toBeNull();
    const p = await admin.from("profiles").select("role, admin_role" as never).eq("id", userId).single();
    expect(p.data).toEqual({ role: "user", admin_role: null });
    const log = await duena.from("admin_audit").select("action").eq("target_user", userId);
    expect(log.data?.map((l) => l.action)).toEqual(expect.arrayContaining(["cambiar_rol_invitar", "cambiar_rol_admin", "cambiar_rol_quitar"]));
  });

  it("el registro: el Dueño ve todo, los demás solo lo suyo, y nadie lo borra", async () => {
    const own = await sopo.from("admin_audit").select("admin_id");
    expect(own.data?.length).toBeGreaterThan(0);
    expect(own.data?.every((r) => r.admin_id === sopoId)).toBe(true);
    expect((await duena.from("admin_audit").select("admin_id").eq("admin_id", sopoId)).data?.length).toBeGreaterThan(0);
    expect((await duena.from("admin_audit").delete().eq("admin_id", sopoId).select("id")).data ?? []).toEqual([]);
  });

  it("la tabla de administradores dice el rol y si tiene los 2 pasos, solo a un admin", async () => {
    const team = (await rpc(conte, "admin_admins")).data as { id: string; admin_role: string; mfa: boolean }[];
    expect(team.find((a) => a.id === duenaId)).toMatchObject({ admin_role: "owner", mfa: false });
    const u = createClient(URL, ANON, { auth: { persistSession: false } });
    await u.auth.signInWithPassword({ email: userEmail, password: pw });
    expect((await rpc(u, "admin_admins")).error).not.toBeNull();
  });
});
