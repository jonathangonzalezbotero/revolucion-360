import "server-only";
import { escapeHtml } from "@/lib/email/lib";

// Páginas mínimas que devuelven las direcciones públicas del CRM a quien envía un formulario normal (sin JavaScript) o
// abre el enlace de confirmación. Sin sesión ni datos personales. Colores del sistema de diseño en hex (globals.css):
// esta respuesta no carga la hoja de estilos de la app.
const C = { tinta: "#141612", tinta2: "#3A3D36", papel: "#F6F5F0", blanco: "#FFFFFF", linea: "#E6E4DC", amarillo: "#F2CD00" } as const;

export const PUBLIC_TEXTS = {
  es: {
    thanksTitle: "¡Listo!", thanksText: "Recibimos tus datos. Gracias.",
    pendingText: "Te mandamos un correo: haz clic en el enlace para confirmar que es tuyo.",
    errorTitle: "No se pudo enviar",
    errors: {
      email: "Falta el correo o no es válido.", antibot: "No pudimos comprobar que no eres un robot. Vuelve a la página e intenta de nuevo.",
      origin: "Este formulario no está permitido en esta página.", paused: "Este formulario no está recibiendo datos por ahora.",
      rate: "Demasiados envíos seguidos. Espera un minuto e intenta de nuevo.", invalid: "Algo en el formulario no sirve. Revisa los datos.",
      server: "Tuvimos un problema. Intenta de nuevo en unos minutos.", too_large: "El formulario manda demasiados datos.",
    } as Record<string, string>,
    back: "Volver",
    confirmTitle: "Confirma tu correo", confirmText: "Toca el botón para confirmar que este correo es tuyo.", confirmButton: "Confirmar mi correo",
    confirmedTitle: "Correo confirmado", confirmedText: "Gracias. Ya quedó.",
    confirmBad: "Este enlace ya se usó o venció. Si quieres, vuelve a llenar el formulario.",
  },
  en: {
    thanksTitle: "Done!", thanksText: "We got your details. Thank you.",
    pendingText: "We sent you an email: click the link to confirm it's yours.",
    errorTitle: "Couldn't send",
    errors: {
      email: "The email is missing or isn't valid.", antibot: "We couldn't check you're not a robot. Go back to the page and try again.",
      origin: "This form isn't allowed on this page.", paused: "This form isn't taking submissions right now.",
      rate: "Too many submissions in a row. Wait a minute and try again.", invalid: "Something in the form doesn't work. Check your details.",
      server: "We had a problem. Try again in a few minutes.", too_large: "The form sends too much data.",
    } as Record<string, string>,
    back: "Go back",
    confirmTitle: "Confirm your email", confirmText: "Tap the button to confirm this email is yours.", confirmButton: "Confirm my email",
    confirmedTitle: "Email confirmed", confirmedText: "Thanks. All set.",
    confirmBad: "This link was already used or has expired. You can fill in the form again.",
  },
} as const;
export type PublicLocale = keyof typeof PUBLIC_TEXTS;

/** Página simple: título, texto y, opcional, un formulario POST (confirmación) o un enlace para volver. */
export function publicPage(o: { locale: PublicLocale; title: string; text: string; status?: number; form?: { action: string; token: string; button: string }; back?: string | null }): Response {
  const form = o.form
    ? `<form method="POST" action="${escapeHtml(o.form.action)}"><input type="hidden" name="t" value="${escapeHtml(o.form.token)}"><button type="submit">${escapeHtml(o.form.button)}</button></form>`
    : "";
  const back = o.back ? `<p><a href="${escapeHtml(o.back)}">${escapeHtml(PUBLIC_TEXTS[o.locale].back)}</a></p>` : "";
  const html = `<!doctype html><html lang="${o.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(o.title)}</title>
<style>body{margin:0;background:${C.papel};color:${C.tinta};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}
main{background:${C.blanco};border:1px solid ${C.linea};border-radius:16px;padding:28px;max-width:440px;width:100%;box-sizing:border-box}
h1{margin:0 0 10px;font-size:24px;font-weight:600}p{margin:0 0 14px;font-size:15px;line-height:1.6;color:${C.tinta2}}
button{font:inherit;font-size:15px;font-weight:600;min-height:46px;padding:0 20px;border:0;border-radius:12px;background:${C.tinta};color:${C.blanco};cursor:pointer}
a{color:${C.tinta};text-decoration-color:${C.amarillo};text-decoration-thickness:2px;text-underline-offset:3px}:focus-visible{outline:2px solid ${C.tinta};outline-offset:2px}</style></head>
<body><main><h1>${escapeHtml(o.title)}</h1><p>${escapeHtml(o.text)}</p>${form}${back}</main></body></html>`;
  return new Response(html, { status: o.status ?? 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}
