export const dynamic = "force-dynamic";

/**
 * POST /api/crm/ingest — RETIRADA (25 nov 2026). La reemplazan las Conexiones web (Admin › Conexiones web): cada
 * formulario tiene su propia dirección (/api/crm/conexiones/<slug>), sus etiquetas, sus páginas permitidas y su clave
 * secreta para enviar desde un servidor (docs/CRM.md › "Conexiones web"). Nadie la usaba todavía (la web seguía con
 * systeme.io). Responde 410 para que un llamador viejo lo note en vez de perder leads en silencio.
 */
export async function POST() {
  return Response.json({ ok: false, error: "gone", use: "/api/crm/conexiones/<slug>" }, { status: 410, headers: { "Cache-Control": "no-store" } });
}
