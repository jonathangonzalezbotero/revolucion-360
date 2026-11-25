import type { Messages } from "@/i18n";

type Section = { h: string; p: string };
export type LegalMessages = {
  title: string; lead: string; draftStrong: string; draft: string; tabs: string; terms: string; privacy: string;
  updated: string; back: string; logoAlt: string;
  termsSections: Section[]; privacySections: Section[];
};

// {company}, {abn}, {contact} y {address} salen de app_config.legal; {first}, {monthly} y {yearly}, de app_config.billing (los edita el admin).
export const M = {
  es: {
    title: "Términos y privacidad",
    lead: "En corto: tus datos son tuyos, no los vendemos, no entramos a tu banco y puedes irte con todo cuando quieras.",
    draftStrong: "Borrador.", draft: "Texto base en lenguaje simple. Antes de publicar debe revisarlo un abogado en Australia.",
    tabs: "Documento", terms: "Términos de uso", privacy: "Privacidad",
    updated: "Última actualización: {date} · Versión {version}", back: "‹ Volver", logoAlt: "Revolución 360 · Revolución del Dinero",
    termsSections: [
      { h: "1. Qué es Revolución 360", p: "Una herramienta para planear y registrar tus finanzas personales, ofrecida por {company}, ABN {abn}. No es un banco, no mueve tu dinero y no da asesoría financiera personal." },
      { h: "2. Tu cuenta", p: "Debes tener 18 años o más. Eres responsable de tu contraseña y de activar la verificación en 2 pasos. Avísanos si alguien entra sin tu permiso." },
      { h: "3. Planes y pagos", p: "Hay un solo plan con todas las funciones. El primer mes cuesta {first} USD; después se cobran {monthly} USD al mes o {yearly} USD al año, en dólares americanos, y se renueva solo hasta que lo canceles. Te avisamos antes del primer cobro completo. Puedes cancelar en cualquier momento desde Suscripción: sigues con acceso hasta el final del periodo pagado y luego tu cuenta queda en solo lectura." },
      { h: "4. Accesos de alumno", p: "Revolución del Dinero puede darte acceso gratis por un tiempo definido o de por vida. Al terminar, tus datos quedan en modo lectura y siempre puedes exportarlos." },
      { h: "5. Información general", p: "Los indicadores, diagnósticos y proyecciones son información general basada en los datos que tú registras. No consideran toda tu situación. Para decisiones importantes consulta a un asesor con licencia (AFSL)." },
      { h: "6. Fin del servicio", p: "Puedes borrar tu cuenta cuando quieras. Si cerramos el servicio, te avisaremos con 60 días para que exportes tus datos." },
    ],
    privacySections: [
      { h: "1. Qué datos guardamos", p: "Los que tú escribes o importas: tu plan, movimientos, cuentas, deudas, metas y progreso en la Academia. Además tu nombre, correo, país y datos de pago (estos los guarda Stripe, no nosotros)." },
      { h: "2. Para qué los usamos", p: "Solo para que la app funcione para ti. No vendemos tus datos ni los usamos para publicidad. Los administradores ven tu nombre, plan y acceso, pero no tus montos ni movimientos." },
      { h: "3. Dónde se guardan", p: "En servidores en Sydney, Australia, cifrados en tránsito y en reposo. Cumplimos la Privacy Act 1988 y los Australian Privacy Principles; si vives en la Unión Europea, también el RGPD." },
      { h: "4. Tus derechos", p: "Puedes ver, corregir, exportar y borrar tus datos desde Mi perfil › Privacidad. El borrado es total en 30 días, salvo lo que la ley nos obligue a conservar (facturas)." },
      { h: "5. Si algo sale mal", p: "Si hay una filtración que te afecte, te avisamos a ti y a la OAIC como exige el Notifiable Data Breaches scheme." },
      { h: "6. Contacto", p: "{contact} · {address}" },
    ],
  },
  en: {
    title: "Terms and privacy",
    lead: "In short: your data is yours, we don't sell it, we don't log into your bank and you can leave with everything whenever you want.",
    draftStrong: "Draft.", draft: "Base text in plain language. A lawyer in Australia must review it before it's published.",
    tabs: "Document", terms: "Terms of use", privacy: "Privacy",
    updated: "Last updated: {date} · Version {version}", back: "‹ Back", logoAlt: "Revolución 360 · Revolución del Dinero",
    termsSections: [
      { h: "1. What Revolución 360 is", p: "A tool to plan and track your personal finances, offered by {company}, ABN {abn}. It isn't a bank, it doesn't move your money and it doesn't give personal financial advice." },
      { h: "2. Your account", p: "You must be 18 or older. You're responsible for your password and for turning on 2-step verification. Tell us if someone gets in without your permission." },
      { h: "3. Plans and payments", p: "There's one plan with every feature. The first month costs {first} USD; after that it's {monthly} USD a month or {yearly} USD a year, in US dollars, and it renews on its own until you cancel. We'll let you know before the first full charge. You can cancel any time from Subscription: you keep access until the end of the paid period and then your account becomes read-only." },
      { h: "4. Student access", p: "Revolución del Dinero may give you free access for a set time or for life. When it ends, your data stays read-only and you can always export it." },
      { h: "5. General information", p: "Indicators, check-ups and forecasts are general information based on the data you enter. They don't consider your whole situation. For important decisions, talk to a licensed adviser (AFSL)." },
      { h: "6. End of service", p: "You can delete your account whenever you want. If we shut the service down, we'll give you 60 days' notice to export your data." },
    ],
    privacySections: [
      { h: "1. What data we keep", p: "What you type or import: your plan, transactions, accounts, debts, goals and Academy progress. Also your name, email, country and payment details (Stripe keeps those, not us)." },
      { h: "2. What we use it for", p: "Only so the app works for you. We don't sell your data or use it for advertising. Admins see your name, plan and access, but not your amounts or transactions." },
      { h: "3. Where it's stored", p: "On servers in Sydney, Australia, encrypted in transit and at rest. We follow the Privacy Act 1988 and the Australian Privacy Principles; if you live in the European Union, the GDPR too." },
      { h: "4. Your rights", p: "You can see, correct, export and delete your data from My profile › Privacy. Deletion is complete within 30 days, except what the law requires us to keep (invoices)." },
      { h: "5. If something goes wrong", p: "If there's a breach that affects you, we'll tell you and the OAIC as the Notifiable Data Breaches scheme requires." },
      { h: "6. Contact", p: "{contact} · {address}" },
    ],
  },
} satisfies Messages<LegalMessages>;
