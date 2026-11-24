import type { Messages } from "@/i18n";

export const M = {
  es: {
    title: "Registro de actividad", eyebrow: "Quién hizo qué en el panel, y quién tiene acceso",
    recent: "Actividad reciente", adminLabel: "Administrador", allAdmins: "Todos los administradores", typeLabel: "Tipo", filter: "Filtrar",
    groups: { all: "Todas las acciones", accesos: "Accesos", cuentas: "Cuentas", soporte: "Soporte y privacidad", precios: "Precios", contenido: "Contenido" } as Record<string, string>,
    colDate: "Fecha", colWho: "Quién", colAction: "Acción", colUser: "Usuario", colDetail: "Detalle",
    empty: "Nada registrado con estos filtros", emptySub: "Cada cambio que hagas en el panel queda aquí.", clear: "Ver todo",
    locked: "El registro no se puede editar ni borrar.",
    admins: "Administradores", invite: "+ Invitar administrador", inviteHelp: "Para sumar a alguien, búscalo en Usuarios y accesos y cámbiale el rol.",
    colName: "Nombre", colEmail: "Correo", colRole: "Rol", colSecurity: "Seguridad", owner: "Administrador", you: "Tú", manage: "Gestionar",
    security: "2 pasos obligatorios", securityOff: "2 pasos desactivados en este entorno", securityNote: "La verificación en dos pasos es obligatoria para entrar al panel.",
  },
  en: {
    title: "Activity log", eyebrow: "Who did what in the panel, and who has access",
    recent: "Recent activity", adminLabel: "Administrator", allAdmins: "All administrators", typeLabel: "Type", filter: "Filter",
    groups: { all: "All actions", accesos: "Access", cuentas: "Accounts", soporte: "Support and privacy", precios: "Pricing", contenido: "Content" } as Record<string, string>,
    colDate: "Date", colWho: "Who", colAction: "Action", colUser: "User", colDetail: "Detail",
    empty: "Nothing logged with these filters", emptySub: "Every change you make in the panel shows up here.", clear: "See all",
    locked: "The log can't be edited or deleted.",
    admins: "Administrators", invite: "+ Invite administrator", inviteHelp: "To add someone, find them in Users and access and change their role.",
    colName: "Name", colEmail: "Email", colRole: "Role", colSecurity: "Security", owner: "Administrator", you: "You", manage: "Manage",
    security: "2-step required", securityOff: "2-step turned off in this environment", securityNote: "Two-step verification is required to enter the panel.",
  },
} satisfies Messages<unknown>;
