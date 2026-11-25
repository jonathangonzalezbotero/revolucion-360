import type { Metadata } from "next";
import { must } from "@/server/data";
import { requireAdmin } from "@/server/session";
import css from "../_shared/admin.module.css";
import { FEATURE_KEYS, FLAG_KEYS, MENU_KEYS, POINT_KEYS, valuesToForm } from "./lib";
import { M } from "./messages";
import { MenuView } from "./MenuView";

export const metadata: Metadata = { title: "Menú y funciones" };

export default async function AdminMenu() {
  const s = await requireAdmin();
  const m = M[s.locale];
  const c = s.config;
  // `admin_mfa_required` no está en s.config: se lee tal cual (la base lo da por encendido si falta).
  const mfaRow = must(await s.supabase.from("app_config").select("value").eq("key", "admin_mfa_required").maybeSingle());
  const form = valuesToForm({
    menu: Object.fromEntries(MENU_KEYS.map((k) => [k, c.menu[k] ?? "on"])) as typeof c.menu,
    features: Object.fromEntries(FEATURE_KEYS.map((k) => [k, c.features[k] ?? "free"])) as Record<(typeof FEATURE_KEYS)[number], "free" | "pro">,
    flags: Object.fromEntries(FLAG_KEYS.map((k) => [k, c.flags[k] === true])) as typeof c.flags,
    limits: { free_goals: Number.isInteger(c.limits.free_goals) ? c.limits.free_goals : 2 },
    gamification_enabled: c.gamification,
    admin_mfa_required: mfaRow?.value !== false,
    points: Object.fromEntries(POINT_KEYS.map((k) => [k, Number.isInteger(c.points[k]) ? c.points[k] : 0])) as Record<(typeof POINT_KEYS)[number], number>,
    levels: c.levels.map((l) => ({ name: String(l.name ?? ""), min: Number(l.min) || 0 })),
  });
  const names = Object.fromEntries(["inicio", ...MENU_KEYS].map((k) => [k, s.t.nav[k as keyof typeof s.t.nav]])) as Record<"inicio" | (typeof MENU_KEYS)[number], string>;
  return (
    <main className={css.page}>
      {/* La clave fuerza a empezar de cero cuando lo guardado cambia (después de guardar). */}
      <MenuView key={JSON.stringify(form)} m={m} names={names} initial={form} aal2={s.aal === "aal2"} />
    </main>
  );
}
