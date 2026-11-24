// Crea un usuario de demostración con el plan 2026 del mockup y un administrador.
// Uso: npm run seed:demo   (lee .env)
// SOLO CREA: nunca borra ni reemplaza. Si alguno de los dos usuarios ya existe, se detiene sin tocar nada (CLAUDE.md, regla 0).
import { createClient } from "@supabase/supabase-js";
import { GROUPS } from "../tests/fixtures/plan2026";

process.loadEnvFile(".env");
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!, SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const EMAIL = process.env.DEMO_EMAIL!, ADMIN_EMAIL = process.env.DEMO_ADMIN_EMAIL!, PASSWORD = process.env.DEMO_PASSWORD!;
if (!URL || !SERVICE) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env");
if (!EMAIL || !ADMIN_EMAIL || !PASSWORD) throw new Error("Faltan DEMO_EMAIL, DEMO_ADMIN_EMAIL o DEMO_PASSWORD en .env");
const db = createClient(URL, SERVICE, { auth: { persistSession: false } });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const must = (r: { data: any; error: { message: string } | null }): any => { if (r.error) throw new Error(r.error.message); return r.data; };

async function existing(email: string) {
  for (let page = 1; ; page++) {
    const { users } = must(await db.auth.admin.listUsers({ page, perPage: 1000 }));
    if (users.some((u: { email?: string }) => u.email === email)) return true;
    if (users.length < 1000) return false;
  }
}

async function freshUser(email: string, name: string) {
  return must(await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { name } })).user.id;
}

async function main() {
  for (const e of [EMAIL, ADMIN_EMAIL]) if (await existing(e)) throw new Error(`${e} ya existe. seed:demo solo crea usuarios nuevos y nunca borra: no se tocó nada.`);
  const uid = await freshUser(EMAIL, "Jonathan");
  const adminId = await freshUser(ADMIN_EMAIL, "Admin");
  must(await db.from("profiles").update({ role: "admin", onboarding_step: "done", name: "Admin" }).eq("id", adminId).select());
  must(await db.from("profiles").update({
    name: "Jonathan", onboarding_step: "done", country: "AU", currency: "AUD", timezone: "Australia/Sydney", pay_frequency: "weekly",
    terms: { retirement: "Super", freelance: "ABN", bnpl: "Afterpay / Zip", tax_office: "ATO", company: "Pty Ltd" },
    first_steps: { plan: true, cuenta: true, gasto: true, clase: true }, created_at: "2026-01-02T00:00:00Z",
  }).eq("id", uid).select());
  must(await db.from("entitlements").update({ state: "alumno", access_until: "2027-02-24T00:00:00Z" }).eq("user_id", uid).select());

  // Categorías, líneas y celdas del plan 2026
  const cat: Record<string, string> = {}, line: Record<string, string> = {};
  for (const [i, g] of GROUPS.entries()) {
    cat[g.name] = must(await db.from("categories").insert({ user_id: uid, name: g.name, kind: g.kind, color: g.color, is_basic: !!g.isBasic, sort: i }).select("id").single()).id;
    for (const [j, [name, months]] of g.rows.entries()) {
      const id = must(await db.from("plan_lines").insert({ user_id: uid, year: 2026, category_id: cat[g.name], name, kind: g.kind === "income" ? "income" : "expense", frequency: "custom", sort: j }).select("id").single()).id;
      line[name] = id;
      must(await db.from("plan_cells").insert(months.map((v, m) => ({ line_id: id, user_id: uid, month: m + 1, amount_cents: v * 100, manual: true }))).select("month"));
    }
  }
  cat["Familia y remesas"] = must(await db.from("categories").insert({ user_id: uid, name: "Familia y remesas", kind: "expense", color: "#8E7CB8", sort: 20 }).select("id").single()).id;

  // Cuentas
  const acc = async (name: string, kind: string, balance: number, extra: Record<string, unknown> = {}) =>
    must(await db.from("accounts").insert({ user_id: uid, name, kind, institution: name.split(" ")[0], balance_cents: balance * 100, balance_date: "2026-11-01", ...extra }).select("id").single()).id;
  const ubank = await acc("Ubank Spend", "bank", 3190), nab = await acc("NAB", "bank", 2200);
  const save = await acc("Ubank Save", "savings", 1200, { is_emergency_fund: true });
  await acc("Tarjeta NAB", "card", -1920);
  await acc("Efectivo", "cash", 800);
  await acc("Easy Aussie Pty Ltd", "business", 4300, { in_networth: false, in_forecast: false });

  // Movimientos de noviembre (los que el mockup muestra como pagados)
  const tx = (description: string, amount: number, date: string, account: string, lineName: string | null, category: string, extra: Record<string, unknown> = {}) =>
    ({ user_id: uid, description, raw_description: "", amount_cents: amount * 100, date, account_id: account, plan_line_id: lineName ? line[lineName] : null, category_id: cat[category], status: "ok", source: "manual", ...extra });
  must(await db.from("transactions").insert([
    tx("Sueldo", 5418, "2026-11-13", ubank, "Sueldo", "Ingresos"),
    tx("Home", -1330, "2026-11-03", ubank, "Home", "Hogar y básicos", { source: "csv", raw_description: "RENT PAYMENT REF 2231" }),
    tx("Groceries", -400, "2026-11-15", nab, "Groceries", "Hogar y básicos"),
    tx("Suscripciones", -125, "2026-11-05", ubank, "Suscripciones", "Hogar y básicos"),
    tx("Seguro de salud", -128, "2026-11-06", ubank, "Seguro de salud", "Hogar y básicos"),
    tx("Inner Circle", -700, "2026-11-10", ubank, "Inner Circle", "Deudas"),
    tx("Car expenses", -180, "2026-11-08", nab, "Car expenses", "Vehículo"),
    tx("Bike expenses", -90, "2026-11-09", nab, "Bike expenses", "Vehículo"),
    tx("Gasolina", -100, "2026-11-12", nab, "Gasolina", "Vehículo"),
    tx("Seguro de la moto", -80, "2026-11-12", ubank, "Seguro de la moto", "Vehículo"),
    tx("Bike Payment", -100, "2026-11-14", ubank, "Bike Payment", "Deudas"),
    tx("Food and Entertainment", -400, "2026-11-16", nab, "Food and Entertainment", "Comida y ocio"),
    tx("Investment S&P500", -150, "2026-11-17", ubank, "Investment S&P500", "Ahorro e inversión"),
    tx("Emergency fund", -100, "2026-11-17", ubank, "Emergency fund", "Ahorro e inversión"),
    tx("Aportes a Easy Aussie", -400, "2026-11-18", ubank, "Aportes a Easy Aussie", "Negocio"),
    tx("Woolworths", -86, "2026-11-20", ubank, null, "Hogar y básicos", { status: "review", source: "csv", raw_description: "WOOLWORTHS 1234 SYDNEY" }),
    tx("McDonald's", -18, "2026-11-21", ubank, null, "Comida y ocio", { source: "csv", raw_description: "MCDONALDS PARRAMATTA" }),
  ]).select("id"));

  // Metas, deudas e inversiones
  const viaje = must(await db.from("goals").insert({ user_id: uid, name: "Viaje a Colombia", kind: "Viaje", target_cents: 1_200_000, target_date: "2027-03-01" }).select("id").single()).id;
  const fondo = must(await db.from("goals").insert({ user_id: uid, name: "Fondo de emergencia", kind: "Fondo de emergencia", target_cents: 600_000, is_emergency_fund: true }).select("id").single()).id;
  must(await db.from("goal_entries").insert([
    { user_id: uid, goal_id: viaje, date: "2026-09-15", amount_cents: 200_000 }, { user_id: uid, goal_id: viaje, date: "2026-10-15", amount_cents: 190_000 },
    { user_id: uid, goal_id: fondo, date: "2026-10-30", amount_cents: 120_000 },
  ]).select("id"));
  must(await db.from("plan_lines").update({ goal_id: viaje }).eq("id", line["Viaje a Colombia"]).select("id"));
  const inner = must(await db.from("debts").insert({ user_id: uid, name: "Inner Circle", kind: "personal", start_balance_cents: 1_539_500, balance_cents: 700_000, rate_bps: 0, payment_cents: 70_000, next_due: "2026-12-10" }).select("id").single()).id;
  must(await db.from("plan_lines").update({ debt_id: inner }).eq("id", line["Inner Circle"]).select("id"));
  must(await db.from("debts").insert({ user_id: uid, name: "Tarjeta NAB", kind: "card", start_balance_cents: 192_000, balance_cents: 192_000, rate_bps: 2099, payment_cents: 20_000 }).select("id"));
  const sp = must(await db.from("investments").insert({ user_id: uid, platform: "Stake", name: "S&P500", contributed_cents: 135_000, value_cents: 148_200, value_date: "2026-11-01" }).select("id").single()).id;
  must(await db.from("plan_lines").update({ investment_id: sp }).eq("id", line["Investment S&P500"]).select("id"));
  must(await db.from("company_entries").insert([
    { user_id: uid, date: "2026-06-30", kind: "aporte", amount_cents: 840_500, note: "Aportes 2026" },
    { user_id: uid, date: "2026-06-30", kind: "retiro", amount_cents: 1_105_000, note: "Retiros 2026" },
  ]).select("id"));

  // Cierres, puntos y racha
  must(await db.from("month_closures").insert([9, 10].map((month) => ({ user_id: uid, year: 2026, month, closed_at: `2026-${month + 1}-02T00:00:00Z` }))).select("month"));
  must(await db.from("point_events").insert([
    { user_id: uid, kind: "closure", ref: "2026-09", points: 30 }, { user_id: uid, kind: "closure", ref: "2026-10", points: 30 },
    { user_id: uid, kind: "first_step", ref: "plan", points: 10 }, { user_id: uid, kind: "first_step", ref: "cuenta", points: 10 },
    { user_id: uid, kind: "first_step", ref: "gasto", points: 10 }, { user_id: uid, kind: "first_step", ref: "clase", points: 10 },
  ]).select("id"));
  must(await db.from("user_badges").insert([{ user_id: uid, badge: "grid" }, { user_id: uid, badge: "check" }]).select("badge"));
  must(await db.from("activity_weeks").insert(["2026-11-09", "2026-11-16", "2026-11-23"].map((week_start) => ({ user_id: uid, week_start }))).select("week_start"));
  must(await db.from("notifications").insert([
    { user_id: uid, kind: "cierre", title: "Quedan pocos días para cerrar noviembre", body: "5 minutos para revisar el mes y ajustar diciembre.", href: "/cierre", dedupe: "cierre-2026-11" },
    { user_id: uid, kind: "logro", title: "Nueva insignia: Primer cierre", body: "", href: "/perfil#insignias", dedupe: "badge-check" },
  ]).select("id"));
  void save;
  console.log(`Listo.\n  Usuario: ${EMAIL}\n  Admin:   ${ADMIN_EMAIL}\n  La contraseña de ambos está en DEMO_PASSWORD de .env`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
