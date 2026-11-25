// Teléfono → E.164 (+61412345678). PURO, probado en tests/crm.test.ts.
// profiles.phone es texto libre; para SMS hace falta el número internacional exacto.

/** Código de país (países de la app). Un número sin "+" de otro país no se adivina: se pide con "+". */
export const CALLING_CODES: Record<string, string> = {
  AU: "61", NZ: "64", US: "1", CA: "1", GB: "44", ES: "34", CO: "57", MX: "52", CL: "56", PE: "51", AR: "54", EC: "593", VE: "58",
};

/** Devuelve el número en E.164 o null si no se puede saber con certeza. */
export function toE164(raw: string | null | undefined, country?: string | null): string | null {
  const t = (raw ?? "").trim();
  if (!t || !/^[+0-9 ()\-.]+$/.test(t)) return null;
  let digits = t.replace(/\D/g, "");
  if (t.startsWith("+")) return valid(`+${digits}`);
  if (digits.startsWith("00")) return valid(`+${digits.slice(2)}`);
  const cc = country ? CALLING_CODES[country.toUpperCase()] : undefined;
  if (!cc) return null;
  if (digits.startsWith(cc) && digits.length > cc.length + 8) return valid(`+${digits}`); // ya traía el código sin "+"
  if (digits.startsWith("0")) digits = digits.slice(1); // 0412… (AU), 021… (NZ)
  return valid(`+${cc}${digits}`);
}
const valid = (e: string) => (/^\+[1-9][0-9]{6,14}$/.test(e) ? e : null);
