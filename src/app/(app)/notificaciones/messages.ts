import type { Messages } from "@/i18n";

export const M = {
  es: {
    title: "Notificaciones", unread: "Tienes {n} sin leer", unreadOne: "Tienes 1 sin leer", unreadNone: "Estás al día", unreadShort: "{n} sin leer",
    allRead: "Marcar todas como leídas", allReadShort: "Leer todas", filter: "Filtrar",
    filters: { all: "Todas", unread: "Sin leer", cierre: "Cierre", pago: "Pagos", logro: "Logros", academia: "Academia", acceso: "Acceso", sistema: "Sistema" },
    groups: { today: "Hoy", week: "Esta semana", older: "Antes" },
    cta: { cierre: "Empezar cierre", pago: "Ver detalle", logro: "Ver mis logros", academia: "Ver clase", acceso: "Ver suscripción", sistema: "Revisar" },
    markRead: "Marcar como leída", remove: "Quitar", unreadDot: "Sin leer",
    empty: "Nada por aquí. Estás al día.", emptyFilter: "No hay notificaciones de este tipo.", seeAll: "Ver todas",
    prefs1: "Elige qué te llega por correo y qué al celular en", prefs2: "Mi perfil › Notificaciones",
    doneAll: "Todas leídas.", removed: "Notificación quitada.",
  },
  en: {
    title: "Notifications", unread: "You have {n} unread", unreadOne: "You have 1 unread", unreadNone: "You're up to date", unreadShort: "{n} unread",
    allRead: "Mark all as read", allReadShort: "Read all", filter: "Filter",
    filters: { all: "All", unread: "Unread", cierre: "Month close", pago: "Payments", logro: "Badges", academia: "Academy", acceso: "Access", sistema: "System" },
    groups: { today: "Today", week: "This week", older: "Earlier" },
    cta: { cierre: "Start close", pago: "See details", logro: "See my badges", academia: "See lesson", acceso: "See subscription", sistema: "Review" },
    markRead: "Mark as read", remove: "Remove", unreadDot: "Unread",
    empty: "Nothing here. You're up to date.", emptyFilter: "No notifications of this type.", seeAll: "See all",
    prefs1: "Choose what reaches you by email and what on your phone in", prefs2: "My profile › Notifications",
    doneAll: "All read.", removed: "Notification removed.",
  },
} satisfies Messages<unknown>;
export type NotifMessages = (typeof M)["es"];
