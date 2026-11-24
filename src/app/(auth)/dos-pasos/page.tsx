import type { Metadata } from "next";
import { cookies } from "next/headers";
import { asLocale } from "@/i18n";
import { CodeForm } from "../AuthForms";
import { M } from "../messages";

export const metadata: Metadata = { title: "Verificación en 2 pasos" };
type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Page({ searchParams }: { searchParams: Search }) {
  const q = await searchParams;
  const m = M[asLocale((await cookies()).get("r360_locale")?.value)];
  return <CodeForm m={m} next={one(q.ir)} />;
}
