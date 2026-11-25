import { NextResponse, type NextRequest } from "next/server";
import { crmDb } from "@/server/crm";
import { confirmPending, isConfirmToken } from "@/server/crm/connections";
import { publicPage, PUBLIC_TEXTS, type PublicLocale } from "@/server/crm/publicPage";

export const dynamic = "force-dynamic";

/**
 * Confirmación por correo de una Conexión web ("Pedir confirmación por correo", docs/CRM.md).
 * - GET: NO confirma (los antivirus de correo abren los enlaces): muestra una página con el botón "Confirmar mi correo".
 * - POST: confirma (el botón). Recién ahí se crea o actualiza el contacto, se ponen las etiquetas y se deja
 *   "Confirmó su correo" (puede iniciar una automatización). Lleva a la URL de gracias de la conexión, si tiene.
 */
const lang = (request: NextRequest): PublicLocale => ((request.headers.get("accept-language") ?? "").toLowerCase().startsWith("en") ? "en" : "es");

export async function GET(request: NextRequest) {
  const locale = lang(request);
  const t = PUBLIC_TEXTS[locale];
  const token = request.nextUrl.searchParams.get("t") ?? "";
  if (!isConfirmToken(token)) return publicPage({ locale, status: 404, title: t.confirmTitle, text: t.confirmBad });
  return publicPage({ locale, title: t.confirmTitle, text: t.confirmText, form: { action: "/api/crm/confirmar", token, button: t.confirmButton } });
}

export async function POST(request: NextRequest) {
  let locale = lang(request);
  const form = await request.formData().catch(() => null);
  const token = form?.get("t");
  try {
    const r = await confirmPending(crmDb(), token);
    if (!r.ok) return publicPage({ locale, status: 410, title: PUBLIC_TEXTS[locale].confirmTitle, text: PUBLIC_TEXTS[locale].confirmBad });
    locale = r.locale;
    if (r.thanksUrl) return NextResponse.redirect(r.thanksUrl, 303);
    return publicPage({ locale, title: PUBLIC_TEXTS[locale].confirmedTitle, text: PUBLIC_TEXTS[locale].confirmedText });
  } catch (e) {
    console.error("[crm-confirmar]", e instanceof Error ? e.message.slice(0, 80) : "error"); // sin datos personales
    return publicPage({ locale, status: 500, title: PUBLIC_TEXTS[locale].errorTitle, text: PUBLIC_TEXTS[locale].errors.server });
  }
}
