import type { Metadata } from "next";
import { LegalDoc } from "../LegalDoc";

export const metadata: Metadata = { title: "Privacidad" };

export default function PrivacidadPage() {
  return <LegalDoc doc="privacy" />;
}
