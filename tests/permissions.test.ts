// Pruebas de permisos contra Supabase LOCAL. Demuestran que la base de datos impone las reglas, no la pantalla.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

try { process.loadEnvFile(".env.local"); } catch { /* sin archivo: se saltan */ }
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const isLocal = /127\.0\.0\.1|localhost/.test(URL) && !!SERVICE;
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
