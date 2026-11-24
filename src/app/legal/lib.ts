// Cálculos puros de las páginas legales.
export type LegalInfo = { company: string; abn: string; contact: string; address: string; updated: string; version: string };
export const PLACEHOLDERS: LegalInfo = { company: "[RAZÓN SOCIAL]", abn: "[ABN]", contact: "[CORREO DE CONTACTO]", address: "[DIRECCIÓN]", updated: "[FECHA]", version: "0.1" };

/** Mezcla lo que escribió el admin con los marcadores: un campo vacío nunca se pinta en blanco. */
export function mergeLegal(raw: unknown): LegalInfo {
  const v = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const pick = (k: keyof LegalInfo) => (typeof v[k] === "string" && (v[k] as string).trim() ? (v[k] as string).trim() : PLACEHOLDERS[k]);
  return { company: pick("company"), abn: pick("abn"), contact: pick("contact"), address: pick("address"), updated: pick("updated"), version: pick("version") };
}

