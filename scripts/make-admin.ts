// Da el rol de administrador a una cuenta que YA EXISTE (se registró y confirmó su correo).
// Uso: npx tsx scripts/make-admin.ts tu@correo.com   (lee .env)
// Solo cambia `profiles.role` de esa cuenta. No crea, no borra, no toca nada más (CLAUDE.md, regla 0).
// Para entrar a /admin la cuenta necesita además los 2 pasos activos (Perfil → Seguridad), salvo que
// app_config.admin_mfa_required sea false.
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env");
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL, SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env");
const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Uso: npx tsx scripts/make-admin.ts tu@correo.com");

const db = createClient(URL, SERVICE, { auth: { persistSession: false } });

async function findUser(target: string) {
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 1000) return null;
  }
}

async function main() {
  const user = await findUser(email);
  if (!user) throw new Error(`No existe una cuenta con ${email}. Regístrate primero en /registro y confirma el correo.`);
  if (!user.email_confirmed_at) throw new Error(`${email} todavía no confirmó su correo. Confírmalo y vuelve a correr el script.`);
  const { data: profile, error } = await db.from("profiles").select("id, role").eq("id", user.id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!profile) throw new Error("La cuenta existe pero no tiene perfil. No se tocó nada.");
  if (profile.role === "admin") return console.log(`${email} ya es administrador. No se tocó nada.`);
  const upd = await db.from("profiles").update({ role: "admin" }).eq("id", user.id).select("id, role").single();
  if (upd.error) throw new Error(upd.error.message);
  const factors = (user.factors ?? []).filter((f) => f.status === "verified").length;
  console.log(`Listo: ${email} ahora es administrador.`);
  console.log(factors ? "Ya tiene 2 pasos: cierra sesión, vuelve a entrar y abre /admin." : "Falta activar los 2 pasos en Perfil → Seguridad; después cierra sesión, vuelve a entrar y abre /admin.");
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
