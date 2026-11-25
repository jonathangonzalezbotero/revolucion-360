// Revisa las migraciones antes de aplicarlas a la base (la de PRODUCCIÓN). Corre solo antes de `npm run db:migrate`.
// Se niega si alguna migración borra o vacía datos (CLAUDE.md, regla 0): DROP TABLE/SCHEMA/DATABASE/COLUMN/VIEW,
// TRUNCATE o DELETE FROM. Recrear políticas, funciones o disparadores (`drop policy`, `drop function`…) sí se permite:
// no toca datos. Si de verdad hace falta quitar algo con datos, lo decide Jonathan y lo aplica a mano con respaldo.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const DIR = path.join(import.meta.dirname, "..", "supabase", "migrations");

const RULES: [RegExp, string][] = [
  [/\bdrop\s+(table|schema|database|materialized\s+view|view|sequence|type|extension)\b/i, "borra un objeto con datos"],
  [/\balter\s+table\b[^;]*\bdrop\s+(column|constraint)\b/i, "borra una columna o restricción"],
  [/\btruncate\b/i, "vacía una tabla"],
  [/\bdelete\s+from\b/i, "borra filas"],
  [/\balter\s+table\b[^;]*\brename\b/i, "renombra una tabla o columna (rompe la app en vivo)"],
];

/** Quita comentarios para no bloquear por una palabra dentro de un comentario. */
const stripComments = (sql: string) => sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");

export function findDangers(sql: string): string[] {
  const clean = stripComments(sql);
  return RULES.filter(([re]) => re.test(clean)).map(([, why]) => why);
}

// Las migraciones ya aplicadas antes de esta regla (25 nov 2026) se revisaron a mano y no borran datos.
const REVIEWED = new Set<string>([
  "20261124000001_core.sql",
  "20261124000002_security.sql",
  "20261124000003_defaults.sql",
  "20261124000004_mfa_backup.sql",
  "20261124000012_cuentas_metas.sql",
  "20261124000013_movimientos.sql",
  "20261124000015_academia.sql",
  "20261124000016_perfil.sql",
  "20261124000020_perfil_extra.sql",
  "20261124000022_analisis.sql",
  "20261124000025_inversiones.sql",
]);

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  const bad = readdirSync(DIR)
    .filter((f) => f.endsWith(".sql") && !REVIEWED.has(f))
    .map((f) => ({ f, why: findDangers(readFileSync(path.join(DIR, f), "utf8")) }))
    .filter((x) => x.why.length);
  if (bad.length) {
    console.error("No se aplican las migraciones: la base nunca se borra (CLAUDE.md, regla 0).");
    for (const b of bad) console.error(`  ${b.f}: ${b.why.join(", ")}`);
    process.exit(1);
  }
  console.log("Migraciones revisadas: ninguna borra datos.");
}
