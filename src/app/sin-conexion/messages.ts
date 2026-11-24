// Textos de la página sin conexión (la muestra el service worker cuando no hay red).
import type { Messages } from "@/i18n";

export const M = {
  es: {
    title: "Sin conexión",
    h1: "No hay internet en este momento",
    text: "Tus datos están a salvo. Cuando vuelva la conexión, abre la app de nuevo y sigue donde ibas.",
    retry: "Reintentar",
    logoAlt: "Revolución 360",
  },
  en: {
    title: "Offline",
    h1: "No internet right now",
    text: "Your data is safe. When you're back online, open the app again and pick up where you left off.",
    retry: "Try again",
    logoAlt: "Revolución 360",
  },
} satisfies Messages<{ title: string; h1: string; text: string; retry: string; logoAlt: string }>;
