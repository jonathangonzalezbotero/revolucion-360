import type { Metadata } from "next";
import { cookies } from "next/headers";
import { asLocale } from "@/i18n";
import { SignInForm } from "../AuthForms";
import { M } from "../messages";

export const metadata: Metadata = { title: "Entrar" };
type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Page({ searchParams }: { searchParams: Search }) {
  const q = await searchParams;
  const m = M[asLocale((await cookies()).get("r360_locale")?.value)];
  return <SignInForm m={m} next={one(q.ir)} initialError={one(q.error) === "enlace" ? m.errors.link : undefined} />;
}
