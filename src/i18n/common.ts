import type { Messages } from "./index";

/** Textos compartidos por toda la app: menú, botones y estados. */
export const COMMON = {
  es: {
    brand: "Revolución 360", endorsement1: "Una herramienta de", endorsement2: "Revolución del Dinero",
    nav: {
      groupMoney: "Tu plata", groupNumbers: "Entiende tus números", groupLearn: "Aprende",
      inicio: "Inicio", plan: "Plan anual", planShort: "Plan", movimientos: "Movimientos", cuentas: "Cuentas", metas: "Metas",
      proyeccion: "Proyección", analisis: "Análisis", deudas: "Deudas e impuestos", inversiones: "Inversiones", academia: "Academia",
      cierre: "Cierre de mes", diagnostico: "Diagnóstico", suscripcion: "Suscripción", perfil: "Mi perfil", notificaciones: "Notificaciones",
      ayuda: "Ayuda", mas: "Más", admin: "Administración", soon: "Pronto", pts: "pts", principal: "Principal", salir: "Salir",
      retos: "Retos", retosActive: "Tienes un reto activo", retosPending: "Falta marcar hoy", masPending: "Más · falta marcar tu reto de hoy",
    },
    closeCta: { title: "Cierra {month}", sub: "5 minutos · quedan {days} días", subLast: "5 minutos · hoy es el último día", done: "{month}, cerrado" },
    actions: { save: "Guardar", cancel: "Cancelar", add: "Agregar", edit: "Editar", remove: "Eliminar", close: "Cerrar", back: "Volver", next: "Siguiente", done: "Listo", confirm: "Confirmar", see: "Ver", saving: "Guardando…", retry: "Intentar de nuevo" },
    status: { paid: "Pagado", paidManual: "Pagado · a mano", pending: "Pendiente", review: "Por revisar", edited: "Editado", transfer: "Transferencia", partial: "Pago parcial", over: "Pagaste de más" },
    readOnly: {
      title: "Tu cuenta está en solo lectura", body: "Tus datos siguen aquí y puedes exportarlos cuando quieras. Para volver a editar, reactiva tu cuenta.", cta: "Reactivar mi cuenta",
      monthly: "Reactivar por {price} USD al mes", yearly: "O {price} USD al año · {free} meses gratis", yearlyPlain: "O {price} USD al año", export: "Exportar mis datos",
    },
    errors: { generic: "Algo no salió bien. Intenta de nuevo.", readOnly: "Tu cuenta está en solo lectura.", required: "Falta {field}.", amount: "Falta el monto.", name: "Falta el nombre.", date: "Falta la fecha.", notFound: "No encontramos eso.", inactive: "Activa tu cuenta para usar esto." },
    disclaimer: "Esto es información general, no asesoría financiera personal.",
    month: "mes", week: "semana", year: "año", today: "hoy", of: "de", yes: "Sí", no: "No", optional: "opcional",
  },
  en: {
    brand: "Revolución 360", endorsement1: "A tool by", endorsement2: "Revolución del Dinero",
    nav: {
      groupMoney: "Your money", groupNumbers: "Understand your numbers", groupLearn: "Learn",
      inicio: "Home", plan: "Yearly plan", planShort: "Plan", movimientos: "Transactions", cuentas: "Accounts", metas: "Goals",
      proyeccion: "Forecast", analisis: "Insights", deudas: "Debts & taxes", inversiones: "Investments", academia: "Academy",
      cierre: "Month close", diagnostico: "Check-up", suscripcion: "Subscription", perfil: "My profile", notificaciones: "Notifications",
      ayuda: "Help", mas: "More", admin: "Admin", soon: "Soon", pts: "pts", principal: "Main", salir: "Sign out",
      retos: "Challenges", retosActive: "You have an active challenge", retosPending: "Not marked today", masPending: "More · today's challenge isn't marked yet",
    },
    closeCta: { title: "Close {month}", sub: "5 minutes · {days} days left", subLast: "5 minutes · today is the last day", done: "{month}, closed" },
    actions: { save: "Save", cancel: "Cancel", add: "Add", edit: "Edit", remove: "Delete", close: "Close", back: "Back", next: "Next", done: "Done", confirm: "Confirm", see: "View", saving: "Saving…", retry: "Try again" },
    status: { paid: "Paid", paidManual: "Paid · by hand", pending: "Pending", review: "To review", edited: "Edited", transfer: "Transfer", partial: "Partly paid", over: "Overpaid" },
    readOnly: {
      title: "Your account is read-only", body: "Your data is still here and you can export it any time. Reactivate your account to edit again.", cta: "Reactivate my account",
      monthly: "Reactivate for {price} USD a month", yearly: "Or {price} USD a year · {free} months free", yearlyPlain: "Or {price} USD a year", export: "Export my data",
    },
    errors: { generic: "Something went wrong. Try again.", readOnly: "Your account is read-only.", required: "{field} is missing.", amount: "The amount is missing.", name: "The name is missing.", date: "The date is missing.", notFound: "We couldn't find that.", inactive: "Activate your account to use this." },
    disclaimer: "This is general information, not personal financial advice.",
    month: "month", week: "week", year: "year", today: "today", of: "of", yes: "Yes", no: "No", optional: "optional",
  },
} satisfies Messages<unknown>;
export type Common = (typeof COMMON)["es"];
