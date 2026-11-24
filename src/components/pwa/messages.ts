// Textos del aviso para instalar la app y activar notificaciones.
import type { Messages } from "@/i18n";

export type PwaTexts = {
  label: string; installTitle: string; installText: string; install: string;
  notifyTitle: string; notifyText: string; notify: string; later: string;
  notifyOn: string; notifyDenied: string; notifyError: string;
};

export const M = {
  es: {
    label: "Revolución 360 en tu teléfono",
    installTitle: "Instala la app",
    installText: "Ábrela desde tu pantalla de inicio, como cualquier app.",
    install: "Instalar la app",
    notifyTitle: "Recibe tus avisos",
    notifyText: "Te avisamos del cierre de mes y de tu racha. Nunca montos.",
    notify: "Activar notificaciones",
    later: "Ahora no",
    notifyOn: "Notificaciones activadas.",
    notifyDenied: "El navegador bloqueó las notificaciones. Puedes activarlas en sus ajustes.",
    notifyError: "No pudimos activar las notificaciones. Intenta de nuevo.",
  },
  en: {
    label: "Revolución 360 on your phone",
    installTitle: "Install the app",
    installText: "Open it from your home screen, like any app.",
    install: "Install the app",
    notifyTitle: "Get your reminders",
    notifyText: "We remind you to close your month and about your streak. Never amounts.",
    notify: "Turn on notifications",
    later: "Not now",
    notifyOn: "Notifications on.",
    notifyDenied: "Your browser blocked notifications. You can turn them on in its settings.",
    notifyError: "We couldn't turn on notifications. Try again.",
  },
} satisfies Messages<PwaTexts>;
