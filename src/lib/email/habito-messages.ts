// Textos de los avisos del hábito (en la app y al celular). Español del mockup Repaso ("Avisos que mantienen el hábito").
// A diferencia de los correos, estos SÍ llevan montos (así los pide el mockup), por eso nunca salen por correo
// y nunca se escriben en los registros. Tono amable: nunca "vas atrasado", nunca rojo. {vars} con `fill`.
import type { Messages } from "@/i18n";

export type HabitTexts = {
  daily: { title: string; body: string; bodyLast: string };
  weekly: { title: string; body: string; bodyOne: string; bodyNone: string };
  goal: { title: string; titleDone: string; body: string; bodyNoDate: string; bodyDone: string };
  due: { title: string; titleMany: string; body: string; bodyMany: string };
  close: { title: string; body: string; bodyNoPoints: string };
};

export const HM = {
  es: {
    daily: { title: "Hoy puedes gastar {amount}", body: "Te quedan {remaining} para el día a día hasta fin de mes.", bodyLast: "Te quedan {remaining} para hoy, el último día del mes." },
    weekly: { title: "Tu repaso de la semana está listo", body: "Registraste {n} movimientos. Mira cómo te fue en 2 minutos.", bodyOne: "Registraste 1 movimiento. Mira cómo te fue en 2 minutos.", bodyNone: "Mira cómo te fue y lo que viene en 2 minutos." },
    goal: { title: "¡{pct}% de {goal}!", titleDone: "¡Llegaste a {goal}!", body: "Te faltan {remaining}. A este ritmo llegas en {month}.", bodyNoDate: "Te faltan {remaining}. Cada aporte cuenta.", bodyDone: "Lo lograste. Disfrútalo." },
    due: { title: "Mañana se paga {name}", titleMany: "Mañana se pagan {n} cosas de tu plan", body: "{amount}. Ya está en tu plan.", bodyMany: "{name} y {more} más: {amount} en total. Ya está en tu plan." },
    close: { title: "5 minutos para cerrar {month}", body: "Revisa, ajusta {next} y suma {points} puntos.", bodyNoPoints: "Revisa lo que pasó y ajusta {next}." },
  },
  en: {
    daily: { title: "You can spend {amount} today", body: "You have {remaining} left for day-to-day spending until the end of the month.", bodyLast: "You have {remaining} left for today, the last day of the month." },
    weekly: { title: "Your weekly review is ready", body: "You logged {n} transactions. See how it went in 2 minutes.", bodyOne: "You logged 1 transaction. See how it went in 2 minutes.", bodyNone: "See how it went and what's coming in 2 minutes." },
    goal: { title: "{pct}% of {goal}!", titleDone: "You reached {goal}!", body: "{remaining} to go. At this pace you get there in {month}.", bodyNoDate: "{remaining} to go. Every bit counts.", bodyDone: "You did it. Enjoy it." },
    due: { title: "{name} is due tomorrow", titleMany: "{n} things from your plan are due tomorrow", body: "{amount}. It's already in your plan.", bodyMany: "{name} and {more} more: {amount} in total. It's already in your plan." },
    close: { title: "5 minutes to close {month}", body: "Review, adjust {next} and earn {points} points.", bodyNoPoints: "Review what happened and adjust {next}." },
  },
} satisfies Messages<HabitTexts>;
