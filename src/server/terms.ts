import type { Session } from "./session";

const FALLBACK: Record<string, { es: string; en: string }> = {
  retirement: { es: "Jubilación", en: "Retirement" },
  freelance: { es: "Trabajo independiente", en: "Self-employment" },
  bnpl: { es: "Compra ahora, paga después", en: "Buy now, pay later" },
  tax_office: { es: "Oficina de impuestos", en: "Tax office" },
  company: { es: "Empresa", en: "Company" },
};
export type TermKey = "retirement" | "freelance" | "bnpl" | "tax_office" | "company";

/** Término local (super, ABN, ATO…): primero el que renombró el usuario, luego el del país, luego el genérico. */
export function term(s: Session, key: TermKey, countryTerms?: Record<string, string>): string {
  return s.profile.terms[key] || countryTerms?.[key] || FALLBACK[key][s.locale];
}
