import type { Common } from "@/i18n/common";
import type { ISODate, MoneyFormat } from "@/lib/engine";
import type { Msg } from "./messages";

export type Cat = { id: string; name: string; color: string; kind: string };
export type Acc = { id: string; name: string };
export type LineOpt = { id: string; name: string; categoryId: string; kind: "income" | "expense" };
/** Lo que toda pieza de cliente necesita para pintar: textos, moneda, idioma y hoy (en la zona del usuario). */
export type Ctx = { t: Msg; c: Common; fmt: MoneyFormat; locale: "es" | "en"; today: ISODate; canEdit: boolean };
export type AddPayload = {
  amount: string; date: ISODate; description: string; accountId: string | null; toAccountId: string | null; categoryId: string | null; lineId: string | null;
  type: "out" | "in" | "transfer"; note: string; repeat: "" | "weekly" | "fortnightly" | "monthly";
};
