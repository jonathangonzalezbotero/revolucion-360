// Genera un enlace para poner una clave nueva SIN mandar correo (no cuenta para el límite de correos de Supabase).
// Uso: npx tsx scripts/recovery-link.ts tu@correo.com [http://localhost:3000]
// El enlace sirve una sola vez y vence pronto. Ábrelo en el navegador con `npm run dev` corriendo.
// Es como una llave de la cuenta: no lo compartas ni lo pegues en un chat.
// No crea, no borra ni cambia nada en la base (CLAUDE.md, regla 0).
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env");
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL, SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env");
const email = (process.argv[2] ?? "").trim().toLowerCase();
const base = (process.argv[3] ?? "http://localhost:3000").replace(/\/$/, "");
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Uso: npx tsx scripts/recovery-link.ts tu@correo.com [http://localhost:3000]");

const db = createClient(URL, SERVICE, { auth: { persistSession: false } });

async function main() {
  const { data, error } = await db.auth.admin.generateLink({ type: "recovery", email });
  if (error) throw new Error(/not.*found/i.test(error.message) ? `No existe una cuenta con ${email}.` : error.message);
  const hash = data.properties?.hashed_token;
  if (!hash) throw new Error("Supabase no devolvió el enlace. No se tocó nada.");
  const link = `${base}/auth/confirm?token_hash=${encodeURIComponent(hash)}&type=recovery&next=${encodeURIComponent("/nueva-clave")}`;
  console.log("Abre este enlace en el navegador (una sola vez) y pon tu clave nueva:\n");
  console.log(link);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
