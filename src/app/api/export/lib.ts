// Armado puro de la exportación de datos (JSON con todo + CSV de movimientos). Sin librerías.

/**
 * Tablas del usuario que entran al archivo, con la columna para paginar en orden estable
 * (varias no tienen `id`). Todas se leen con la sesión del usuario: RLS decide qué ve.
 * Fuera a propósito: product_events (sin permiso de lectura), push_subscriptions y mfa_* (técnicas/secretas).
 */
export const EXPORT_TABLES = [
  ["categories", ["sort", "id"]], ["accounts", ["sort", "id"]],
  ["plan_years", ["year"]], ["plan_lines", ["year", "id"]], ["plan_cells", ["line_id", "month"]], ["plan_marks", ["line_id", "month"]],
  ["transactions", ["date", "id"]], ["transaction_history", ["at", "id"]], ["category_rules", ["id"]], ["month_totals", ["year", "month", "category_id"]],
  ["recurring", ["id"]], ["csv_imports", ["created_at", "id"]], ["csv_formats", ["id"]],
  ["goals", ["created_at", "id"]], ["goal_entries", ["date", "id"]], ["debts", ["created_at", "id"]], ["debt_payments", ["date", "id"]],
  ["investments", ["created_at", "id"]], ["investment_entries", ["date", "id"]],
  ["month_closures", ["year", "month"]], ["forecast_scenarios", ["id"]], ["watched_merchants", ["id"]],
  ["tax_settings", ["user_id"]], ["tax_entries", ["date", "id"]], ["company_entries", ["date", "id"]],
  ["point_events", ["at", "id"]], ["user_badges", ["badge"]], ["activity_weeks", ["week_start"]], ["lesson_progress", ["lesson_id"]],
  ["notifications", ["created_at", "id"]], ["support_tickets", ["created_at", "id"]], ["privacy_requests", ["requested_at", "id"]],
] as const;
export type ExportTable = (typeof EXPORT_TABLES)[number][0];

/** Columnas de `entitlements` que sí se exportan (los identificadores de Stripe se quedan fuera). */
export const ENTITLEMENT_COLUMNS = "state, trial_ends_at, trial_used, pro_until, access_until, billing_interval, cancel_at_period_end, updated_at";

/** Centavos enteros → "1234.56" sin pasar por decimales flotantes. */
export function centsToDecimal(cents: number): string {
  const a = Math.abs(Math.trunc(cents));
  return `${cents < 0 ? "-" : ""}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
}

/** Celda CSV: comillas cuando hace falta y protección contra fórmulas en hojas de cálculo (=, +, -, @). */
export function csvCell(v: unknown, text = true): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (text && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n;]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}

export type TxCsvRow = {
  date: string; description: string; amount_cents: number; kind: string; status: string; note: string | null;
  account_id: string | null; category_id: string | null; is_split: boolean; deleted_at: string | null;
};
export const TX_HEADER = ["fecha", "descripcion", "monto", "categoria", "cuenta", "tipo", "estado", "nota"];

/** CSV de movimientos (sin los borrados). Los montos en decimales con punto, entra positivo y sale negativo. */
export function transactionsCsv(rows: TxCsvRow[], categories: Map<string, string>, accounts: Map<string, string>): string {
  const lines = [TX_HEADER.join(",")];
  for (const r of rows) {
    if (r.deleted_at) continue;
    lines.push([
      csvCell(r.date, false), csvCell(r.description), csvCell(centsToDecimal(r.amount_cents), false),
      csvCell(r.category_id ? categories.get(r.category_id) ?? "" : ""), csvCell(r.account_id ? accounts.get(r.account_id) ?? "" : ""),
      csvCell(r.is_split ? "split" : r.kind, false), csvCell(r.status, false), csvCell(r.note ?? ""),
    ].join(","));
  }
  return "﻿" + lines.join("\r\n") + "\r\n"; // BOM: Excel abre bien las tildes
}

export const exportFilename = (today: string, ext: "json" | "csv") => `revolucion360-${ext === "csv" ? "movimientos" : "datos"}-${today}.${ext}`;
