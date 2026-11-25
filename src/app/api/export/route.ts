import type { NextRequest } from "next/server";
import { fetchAll, must } from "@/server/data";
import { getSession } from "@/server/session";
import { ENTITLEMENT_COLUMNS, EXPORT_TABLES, exportFilename, isMissingTable, OPTIONAL_TABLES, SELECT_OVERRIDE, transactionsCsv, type TxCsvRow } from "./lib";

export const dynamic = "force-dynamic";

/**
 * GET /api/export → todos mis datos en JSON · GET /api/export?formato=csv → mis movimientos en CSV.
 * Solo con la sesión del usuario (RLS): nunca la clave de servicio. Funciona también en solo lectura.
 * Cada descarga queda anotada en privacy_requests (kind export, status done).
 */
export async function GET(request: NextRequest) {
  const s = await getSession();
  if (!s) return new Response("No autorizado", { status: 401, headers: { "Cache-Control": "no-store" } });
  const csv = request.nextUrl.searchParams.get("formato") === "csv";
  try {
    const headers = (name: string, type: string) => ({
      "Content-Type": type, "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    });
    let body: string;
    if (csv) {
      const [txs, cats, accs] = await Promise.all([
        fetchAll<TxCsvRow>((a, b) => s.supabase.from("transactions").select("date, description, amount_cents, kind, status, note, account_id, category_id, is_split, deleted_at").eq("user_id", s.userId).order("date").order("id").range(a, b)),
        fetchAll<{ id: string; name: string }>((a, b) => s.supabase.from("categories").select("id, name").eq("user_id", s.userId).order("id").range(a, b)),
        fetchAll<{ id: string; name: string }>((a, b) => s.supabase.from("accounts").select("id, name").eq("user_id", s.userId).order("id").range(a, b)),
      ]);
      body = transactionsCsv(txs, new Map(cats.map((c) => [c.id, c.name])), new Map(accs.map((c) => [c.id, c.name])));
    } else {
      const tables: Record<string, unknown[]> = {};
      await Promise.all(EXPORT_TABLES.map(async ([table, order]) => {
        if (OPTIONAL_TABLES.includes(table)) {
          const probe = await s.supabase.from(table as "accounts").select("user_id").limit(1); // GET, no HEAD: el error trae su código
          if (isMissingTable(probe.error)) return; // migración aún sin aplicar: el resto se exporta igual
        }
        tables[table] = await fetchAll<unknown>((a, b) => {
          // Nombre de tabla dinámico: el tipo de una sola tabla basta para armar la consulta (todas tienen user_id).
          let q = s.supabase.from(table as "accounts").select(SELECT_OVERRIDE[table] ?? "*").eq("user_id", s.userId);
          for (const col of order) q = q.order(col as "id");
          return q.range(a, b);
        });
      }));
      // Los mensajes de soporte no tienen user_id: se filtran por mis casos (un admin ve todos por RLS).
      const ticketIds = (tables.support_tickets as { id: string }[]).map((t) => t.id);
      tables.ticket_messages = ticketIds.length
        ? await fetchAll<unknown>((a, b) => s.supabase.from("ticket_messages").select("*").in("ticket_id", ticketIds).order("created_at").order("id").range(a, b))
        : [];
      const [profile, entitlement] = await Promise.all([
        s.supabase.from("profiles").select("*").eq("id", s.userId).single(),
        s.supabase.from("entitlements").select(ENTITLEMENT_COLUMNS).eq("user_id", s.userId).maybeSingle(),
      ]);
      body = JSON.stringify({
        app: "Revolución 360", format: 1, exported_at: new Date().toISOString(), money: "Montos en centavos enteros (amount_cents: 1234 = 12.34).",
        profile: must(profile), entitlement: entitlement.error ? null : entitlement.data, tables,
      });
    }
    const now = new Date().toISOString();
    await s.supabase.from("privacy_requests").insert({ user_id: s.userId, kind: "export", status: "done", requested_at: now, due_at: now, done_at: now });
    return new Response(body, { headers: csv ? headers(exportFilename(s.today, "csv"), "text/csv; charset=utf-8") : headers(exportFilename(s.today, "json"), "application/json; charset=utf-8") });
  } catch (e) {
    console.error("[export]", e instanceof Error ? e.message : "error"); // sin montos ni datos personales
    return new Response(s.t.errors.generic, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
