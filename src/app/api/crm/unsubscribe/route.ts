import { NextResponse, type NextRequest } from "next/server";
import { crmDb } from "@/server/crm";
import { isToken, unsubscribeByToken } from "@/server/crm/token";

export const dynamic = "force-dynamic";

/**
 * Baja en un clic por token (enlace "Darte de baja" y encabezado List-Unsubscribe de cada correo de marketing).
 * - GET: no da de baja (los antivirus de correo abren los enlaces): lleva a la página que pide confirmar.
 * - POST: da de baja. Lo hace Gmail / Apple Mail (List-Unsubscribe-Post: One-Click, responde 200) o el botón de la
 *   página de confirmación (vuelve a la página con "Listo").
 */
export async function GET(request: NextRequest) {
  const t = request.nextUrl.searchParams.get("t") ?? "";
  const url = new URL("/correo/preferencias", request.nextUrl.origin);
  if (isToken(t)) { url.searchParams.set("t", t); url.searchParams.set("baja", "1"); }
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  let t = request.nextUrl.searchParams.get("t") ?? "";
  let fromPage = false;
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("form")) {
    const form = await request.formData().catch(() => null);
    const ft = form?.get("t");
    if (typeof ft === "string" && ft) { t = ft; fromPage = form?.get("from") === "page"; }
  }
  let ok = false;
  try {
    ok = await unsubscribeByToken(crmDb(), t, fromPage ? "preferencias" : "baja_un_clic");
  } catch (e) {
    console.error("[crm-unsubscribe]", e instanceof Error ? e.message.slice(0, 80) : "error");
    return new Response("Error", { status: 500 });
  }
  if (fromPage) {
    const url = new URL("/correo/preferencias", request.nextUrl.origin);
    url.searchParams.set("t", t);
    url.searchParams.set(ok ? "hecho" : "error", "1");
    return NextResponse.redirect(url, 303);
  }
  return new Response(ok ? "OK" : "Not found", { status: ok ? 200 : 404, headers: { "Cache-Control": "no-store" } });
}
