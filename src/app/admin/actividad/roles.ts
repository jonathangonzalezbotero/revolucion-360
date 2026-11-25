// Subroles del panel (migración 20261125000033_admin_roles.sql). Funciones puras: las usan `requireAdmin`,
// la navegación y las pruebas. La base de datos impone lo mismo con `is_admin_owner()` e `is_admin_of()`.

export const ADMIN_ROLES = ["owner", "content", "support"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

/**
 * Secciones del panel (las mismas claves que la navegación) más "administradores" (invitar y asignar subroles) y "crm"
 * (Contactos, Campañas de correo y Automatizaciones: solo el Dueño; la base lo impone con is_admin_owner()).
 */
export const ADMIN_SECTIONS = [
  "resumen", "usuarios", "grupos", "menu", "academia", "planes", "paises", "soporte", "actividad", "administradores", "crm",
  "retos", // Retos (20261125000037_retos.sql): solo el Dueño — al publicar crea automatizaciones del CRM y usa códigos de acceso
] as const;
export type AdminSection = (typeof ADMIN_SECTIONS)[number];

/**
 * Qué puede usar cada subrol. Todos ven Resumen y su propia actividad.
 * Menú y funciones queda para el Dueño: cambia qué ve cada estado de cuenta y los 2 pasos del panel.
 * Grupos va con Usuarios y accesos (sirve para dar acceso a varios a la vez).
 */
export const ROLE_SECTIONS: Record<AdminRole, readonly AdminSection[]> = {
  owner: ADMIN_SECTIONS,
  content: ["resumen", "actividad", "academia", "paises"],
  support: ["resumen", "actividad", "usuarios", "grupos", "soporte"],
};

export const isAdminRole = (v: unknown): v is AdminRole => typeof v === "string" && (ADMIN_ROLES as readonly string[]).includes(v);

export const canUse = (role: AdminRole, section: AdminSection) => ROLE_SECTIONS[role].includes(section);

/** Rutas del CRM: Contactos, Campañas, Automatizaciones y Conexiones web son una sola sección ("crm"). */
export const CRM_ROUTES = ["crm", "campanas", "automatizaciones", "conexiones"] as const;
/** Ruta de "Conexiones web" (la navegación la agrega en "CRM y correos"). */
export const CONEXIONES_PATH = "/admin/conexiones";

/** Ruta de "Retos" (la navegación la agrega en "La app"; sección "retos", solo el Dueño). */
export const RETOS_PATH = "/admin/retos";

/** Sección de una ruta del panel; null si no es del panel o no es una sección conocida. */
export function sectionOf(path: string): AdminSection | null {
  const m = /^\/admin(?:\/([^/?#]+))?(?:[/?#]|$)/.exec(path);
  if (!m) return null;
  if (!m[1]) return "resumen";
  if ((CRM_ROUTES as readonly string[]).includes(m[1])) return "crm";
  return (ADMIN_SECTIONS as readonly string[]).includes(m[1]) && m[1] !== "resumen" && m[1] !== "administradores" ? (m[1] as AdminSection) : null;
}
