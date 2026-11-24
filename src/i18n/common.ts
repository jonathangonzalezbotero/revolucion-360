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
      ayuda: "Ayuda", mas: "Más", admin: "Administración", soon: "Pronto", pro: "Pro", pts: "pts", principal: "Principal", salir: "Salir",
    },
    closeCta: { title: "Cierra {month}", sub: "5 minutos · quedan {days} días", subLast: "5 minutos · hoy es el último día", done: "{month}, cerrado" },
    actions: { save: "Guardar", cancel: "Cancelar", add: "Agregar", edit: "Editar", remove: "Eliminar", close: "Cerrar", back: "Volver", next: "Siguiente", done: "Listo", confirm: "Confirmar", see: "Ver", saving: "Guardando…", retry: "Intentar de nuevo" },
    status: { paid: "Pagado", paidManual: "Pagado · a mano", pending: "Pendiente", review: "Por revisar", edited: "Editado", transfer: "Transferencia", partial: "Pago parcial", over: "Pagaste de más" },
    readOnly: { title: "Tu cuenta está en solo lectura", body: "Tus datos siguen aquí y puedes exportarlos cuando quieras. Para volver a editar, reactiva Pro.", cta: "Reactivar Pro" },
    pro: { title: "Esto es parte de Pro", cta: "Ver planes", trial: "Probar Pro gratis {days} días" },
    errors: { generic: "Algo no salió bien. Intenta de nuevo.", readOnly: "Tu cuenta está en solo lectura.", required: "Falta {field}.", amount: "Falta el monto.", name: "Falta el nombre.", date: "Falta la fecha.", notFound: "No encontramos eso.", pro: "Esto es parte de Pro." },
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
      ayuda: "Help", mas: "More", admin: "Admin", soon: "Soon", pro: "Pro", pts: "pts", principal: "Main", salir: "Sign out",
    },
    closeCta: { title: "Close {month}", sub: "5 minutes · {days} days left", subLast: "5 minutes · today is the last day", done: "{month}, closed" },
    actions: { save: "Save", cancel: "Cancel", add: "Add", edit: "Edit", remove: "Delete", close: "Close", back: "Back", next: "Next", done: "Done", confirm: "Confirm", see: "View", saving: "Saving…", retry: "Try again" },
    status: { paid: "Paid", paidManual: "Paid · by hand", pending: "Pending", review: "To review", edited: "Edited", transfer: "Transfer", partial: "Partly paid", over: "Overpaid" },
    readOnly: { title: "Your account is read-only", body: "Your data is still here and you can export it any time. Reactivate Pro to edit again.", cta: "Reactivate Pro" },
    pro: { title: "This is part of Pro", cta: "See plans", trial: "Try Pro free for {days} days" },
    errors: { generic: "Something went wrong. Try again.", readOnly: "Your account is read-only.", required: "{field} is missing.", amount: "The amount is missing.", name: "The name is missing.", date: "The date is missing.", notFound: "We couldn't find that.", pro: "This is part of Pro." },
    disclaimer: "This is general information, not personal financial advice.",
    month: "month", week: "week", year: "year", today: "today", of: "of", yes: "Yes", no: "No", optional: "optional",
  },
} satisfies Messages<unknown>;
export type Common = (typeof COMMON)["es"];
