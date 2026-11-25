// Textos de los correos automáticos (docs/mockup/Correos.dc.html) y de los avisos en la app que crean las tareas programadas.
// Nunca llevan montos ni datos financieros del usuario. El único dinero que aparece es el PRECIO del plan
// ({monthly}, {yearly}, {price}: salen de app_config.billing o de la suscripción en Stripe). {vars} se llenan con `fill`.
import type { Messages } from "@/i18n";

export type EmailTexts = {
  brandAlt: string;
  signature: string;
  footer: { account: string; access: string; important: string; firstCharge: string; prefs: string; company: string };
  welcome: { subject: string; label: string; titleName: string; titleNoName: string; p1: string; p2Before: string; p2Link: string; p2After: string; cta: string };
  close: { subject: string; label: string; title: string; titleLate: string; p1: string; streak: string; streakOne: string; streakN: string; points: string; pointsN: string; cta: string };
  access: { subject: string; subjectOne: string; label: string; title: string; p1: string; p2: string; cta: string };
  payment: { subject: string; label: string; title: string; p1: string; p2: string; cta: string };
  /** 5 · Fin del primer mes (aviso `customer.subscription.trial_will_end` de Stripe). */
  firstMonth: { subject: string; subjectOne: string; label: string; titleName: string; titleNoName: string; p1Card: string; p1: string; p2: string; cta: string };
  /** Acceso gratis dado desde el panel (casilla "Avisarles por correo"). */
  grant: { subject: string; label: string; titleName: string; titleNoName: string; kinds: Record<"alumno" | "fundador", string>; p1Until: string; p1Life: string; p2Until: string; p2Life: string; cta: string };
  notif: {
    closeTitle: string; closeBody: string;
    accessTitle: string; accessBody: string;
    firstMonthTitle: string; firstMonthBody: string;
    welcomeTitle: string; welcomeBody: string;
    streakTitle: string; streakBody: string;
  };
};

export const M = {
  es: {
    brandAlt: "Revolución 360 · Revolución del Dinero",
    signature: "— Jonathan",
    footer: {
      account: "Recibes este correo porque tienes cuenta en Revolución 360.",
      access: "Te avisamos 30 y 7 días antes de que venza tu acceso.",
      important: "Correo importante sobre tu cuenta: no se puede desactivar.",
      firstCharge: "Te escribimos porque se acerca tu primer cobro completo.",
      prefs: "Elegir qué correos recibo",
      company: "Revolución del Dinero · Sydney, Australia",
    },
    welcome: {
      subject: "Tu año en un solo lugar empieza hoy",
      label: "Bienvenida",
      titleName: "Hola, {name}. Qué bueno tenerte aquí.",
      titleNoName: "Hola. Qué bueno tenerte aquí.",
      p1: "Lo primero es tu plan del año. Son 7 preguntas y 10 minutos, y al final vas a ver cuánto te sobra cada mes y en qué se va tu plata.",
      p2Before: "Si te trabas, la clase ", p2Link: "\"Empieza aquí\"", p2After: " te muestra todo en 4 minutos.",
      cta: "Armar mi plan",
    },
    close: {
      subject: "5 minutos para cerrar {month}",
      label: "Cierre de {month}",
      title: "{Month} se acaba. ¿Cómo te fue?",
      titleLate: "{Month} ya terminó. ¿Cómo te fue?",
      p1: "En 5 minutos revisas lo que gastaste, lo comparas con tu plan y ajustas {next}. Es el hábito que más cambia tus números.",
      streak: "Racha actual", streakOne: "1 cierre", streakN: "{n} cierres",
      points: "Si cierras hoy", pointsN: "+{n} puntos",
      cta: "Cerrar {month}",
    },
    access: {
      subject: "Tu acceso de alumno termina en {n} días",
      subjectOne: "Tu acceso de alumno termina mañana",
      label: "Tu acceso",
      title: "Tu acceso de alumno termina el {date}.",
      p1: "Tus datos no se borran. Si no continúas, todo queda guardado en modo lectura y puedes exportarlo cuando quieras.",
      p2: "Si quieres seguir, son {monthly} USD al mes o {yearly} USD al año. Pones tu tarjeta una vez y sigues sin cortes.",
      cta: "Seguir con mi cuenta",
    },
    payment: {
      subject: "No pudimos cobrar tu suscripción",
      label: "Pagos",
      title: "No pudimos cobrar tu suscripción.",
      p1: "Tu tarjeta fue rechazada el {date}. Lo intentamos de nuevo en unos días.",
      p2: "No pierdes nada mientras tanto. Si quieres, actualiza tu tarjeta ahora y listo.",
      cta: "Actualizar mi tarjeta",
    },
    firstMonth: {
      subject: "Tu primer mes termina en {n} días",
      subjectOne: "Tu primer mes termina mañana",
      label: "Tu suscripción",
      titleName: "{name}, ya llevas casi un mes con tu plan.",
      titleNoName: "Ya llevas casi un mes con tu plan.",
      p1Card: "El {date} cobramos {price} USD a tu tarjeta terminada en {last4} y sigues igual. Si prefieres el plan anual ({yearly} USD, 2 meses gratis), puedes cambiarlo antes.",
      p1: "El {date} cobramos {price} USD a tu tarjeta y sigues igual. Si prefieres el plan anual ({yearly} USD, 2 meses gratis), puedes cambiarlo antes.",
      p2: "Si no quieres seguir, cancelas en un toque desde Suscripción. No te cobramos nada más y tus datos quedan guardados.",
      cta: "Ver mi suscripción",
    },
    grant: {
      subject: "Tienes acceso completo a Revolución 360",
      label: "Tu acceso",
      titleName: "Hola, {name}. Tienes acceso completo.",
      titleNoName: "Hola. Tienes acceso completo.",
      kinds: { alumno: "alumno", fundador: "fundador" },
      p1Until: "Revolución del Dinero te dio acceso de {kind} a todo Revolución 360 hasta el {date}.",
      p1Life: "Revolución del Dinero te dio acceso de {kind} a todo Revolución 360, de por vida.",
      p2Until: "Tus datos nunca se borran. Te avisamos antes de que venza.",
      p2Life: "Tus datos son tuyos y siempre los puedes exportar.",
      cta: "Entrar a la app",
    },
    notif: {
      closeTitle: "5 minutos para cerrar {month}",
      closeBody: "Revisa lo que gastaste, compáralo con tu plan y ajusta {next}.",
      accessTitle: "Tu acceso de alumno termina el {date}",
      accessBody: "Tus datos no se borran. Si no continúas, quedan en modo lectura y puedes exportarlos.",
      firstMonthTitle: "Tu primer mes termina el {date}",
      firstMonthBody: "Ese día cobramos {price} USD y sigues igual. Puedes cambiar a anual o cancelar desde Suscripción.",
      welcomeTitle: "Te damos la bienvenida a Revolución 360",
      welcomeBody: "Lo primero es tu plan del año: 7 preguntas y 10 minutos.",
      streakTitle: "Tu racha se puede salvar",
      streakBody: "La semana del {date} quedó sin registro. Tienes un comodín para salvar tus {n} semanas seguidas.",
    },
  },
  en: {
    brandAlt: "Revolución 360 · Revolución del Dinero",
    signature: "— Jonathan",
    footer: {
      account: "You're getting this email because you have a Revolución 360 account.",
      access: "We let you know 30 and 7 days before your access ends.",
      important: "Important email about your account: it can't be turned off.",
      firstCharge: "We're writing because your first full charge is coming up.",
      prefs: "Choose which emails I get",
      company: "Revolución del Dinero · Sydney, Australia",
    },
    welcome: {
      subject: "Your whole year in one place starts today",
      label: "Welcome",
      titleName: "Hi, {name}. So glad you're here.",
      titleNoName: "Hi. So glad you're here.",
      p1: "First up is your plan for the year. It's 7 questions and 10 minutes, and at the end you'll see how much you have left each month and where your money goes.",
      p2Before: "If you get stuck, the ", p2Link: "\"Start here\"", p2After: " lesson shows you everything in 4 minutes.",
      cta: "Build my plan",
    },
    close: {
      subject: "5 minutes to close {month}",
      label: "{Month} close",
      title: "{Month} is ending. How did it go?",
      titleLate: "{Month} is over. How did it go?",
      p1: "In 5 minutes you review what you spent, compare it with your plan and adjust {next}. It's the habit that changes your numbers the most.",
      streak: "Current streak", streakOne: "1 close", streakN: "{n} closes",
      points: "If you close today", pointsN: "+{n} points",
      cta: "Close {month}",
    },
    access: {
      subject: "Your student access ends in {n} days",
      subjectOne: "Your student access ends tomorrow",
      label: "Your access",
      title: "Your student access ends on {date}.",
      p1: "Your data isn't deleted. If you don't continue, everything stays saved in read-only mode and you can export it whenever you want.",
      p2: "If you want to keep going, it's {monthly} USD a month or {yearly} USD a year. Add your card once and carry on without a break.",
      cta: "Keep my account",
    },
    payment: {
      subject: "We couldn't charge your subscription",
      label: "Payments",
      title: "We couldn't charge your subscription.",
      p1: "Your card was declined on {date}. We'll try again in a few days.",
      p2: "You don't lose anything in the meantime. If you want, update your card now and you're done.",
      cta: "Update my card",
    },
    firstMonth: {
      subject: "Your first month ends in {n} days",
      subjectOne: "Your first month ends tomorrow",
      label: "Your subscription",
      titleName: "{name}, you're almost a month into your plan.",
      titleNoName: "You're almost a month into your plan.",
      p1Card: "On {date} we'll charge {price} USD to your card ending in {last4} and everything carries on. If you'd rather go yearly ({yearly} USD, 2 months free), you can switch before then.",
      p1: "On {date} we'll charge {price} USD to your card and everything carries on. If you'd rather go yearly ({yearly} USD, 2 months free), you can switch before then.",
      p2: "If you don't want to continue, cancel in one tap from Subscription. We won't charge you anything else and your data stays saved.",
      cta: "See my subscription",
    },
    grant: {
      subject: "You have full access to Revolución 360",
      label: "Your access",
      titleName: "Hi, {name}. You have full access.",
      titleNoName: "Hi. You have full access.",
      kinds: { alumno: "student", fundador: "founder" },
      p1Until: "Revolución del Dinero gave you {kind} access to all of Revolución 360 until {date}.",
      p1Life: "Revolución del Dinero gave you lifetime {kind} access to all of Revolución 360.",
      p2Until: "Your data is never deleted. We'll let you know before it ends.",
      p2Life: "Your data is yours and you can always export it.",
      cta: "Open the app",
    },
    notif: {
      closeTitle: "5 minutes to close {month}",
      closeBody: "Review what you spent, compare it with your plan and adjust {next}.",
      accessTitle: "Your student access ends on {date}",
      accessBody: "Your data isn't deleted. If you don't continue, it stays in read-only mode and you can export it.",
      firstMonthTitle: "Your first month ends on {date}",
      firstMonthBody: "That day we'll charge {price} USD and everything carries on. You can switch to yearly or cancel from Subscription.",
      welcomeTitle: "Welcome to Revolución 360",
      welcomeBody: "First up is your plan for the year: 7 questions and 10 minutes.",
      streakTitle: "Your streak can be saved",
      streakBody: "The week of {date} had nothing logged. You have a wildcard to save your {n}-week streak.",
    },
  },
} satisfies Messages<EmailTexts>;
