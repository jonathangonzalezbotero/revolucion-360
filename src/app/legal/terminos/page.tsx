import type { Metadata } from "next";
import { LegalDoc } from "../LegalDoc";

export const metadata: Metadata = { title: "Términos de uso" };

export default function TerminosPage() {
  return <LegalDoc doc="terms" />;
}
