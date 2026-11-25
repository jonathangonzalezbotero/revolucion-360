import type { Messages } from "@/i18n";

/** Textos del recorrido general (la primera vez en la app). */
export const TOUR_M = {
  es: {
    label: "Recorrido por la app",
    count: "{n} de {total}",
    next: "Siguiente ›",
    done: "Listo",
    skip: "Saltar",
    stops: {
      inicio: "Aquí ves cuánto te sobra este mes y cuánto puedes gastar hoy.",
      plan: "Tu año completo. Marca aquí lo que ya pagaste. Llenar los meses que pasaron es opcional.",
      movimientos: "Anota tus gastos del día a día con + Gasto, o importa el archivo de tu banco.",
      metas: "Agrega tus deudas y tus metas: así el plan te dice cuánto apartar.",
      cierre: "Una vez al mes, 5 minutos: revisas, ajustas y sumas puntos.",
    },
  },
  en: {
    label: "App tour",
    count: "{n} of {total}",
    next: "Next ›",
    done: "Done",
    skip: "Skip",
    stops: {
      inicio: "Here you see how much you have left this month and how much you can spend today.",
      plan: "Your whole year. Tick off what you've already paid here. Filling in past months is optional.",
      movimientos: "Log your day-to-day spending with + Expense, or import your bank's file.",
      metas: "Add your debts and your goals: that way the plan tells you how much to set aside.",
      cierre: "Once a month, 5 minutes: you review, adjust and earn points.",
    },
  },
} satisfies Messages<unknown>;
export type TourMessages = (typeof TOUR_M)["es"];
