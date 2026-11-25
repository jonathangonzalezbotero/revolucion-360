"use client";
import { useEffect } from "react";
import { pingOpenApp } from "./actions";

/**
 * Retos: "abrir la app" cuenta una vez al día. El layout solo pinta esto si la cookie del día no está; aquí se llama una
 * vez a la acción, que cuenta y deja la cookie. No pinta nada ni avisa (si falla, mañana vuelve a intentar).
 */
export function OpenAppPing() {
  useEffect(() => {
    void pingOpenApp().catch(() => undefined);
  }, []);
  return null;
}
