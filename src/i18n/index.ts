// Textos de la app. Español primero; inglés como segundo idioma (fase 3).
// Cada módulo define sus textos junto a su pantalla: `const M = { es: {...}, en: {...} } satisfies Messages<...>`
// y los lee con `M[locale]`. Así nadie inventa textos y el inglés nunca queda incompleto (lo exige el tipo).

export type Locale = "es" | "en";
export const LOCALES: Locale[] = ["es", "en"];
export type Messages<T> = { es: T; en: T };
export const asLocale = (v: string | null | undefined): Locale => (v === "en" ? "en" : "es");

/** Reemplaza {nombre} en un texto: fill("Hola, {name}", { name: "Ana" }) */
export function fill(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}
