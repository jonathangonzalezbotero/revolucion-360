"use client";
import { useEffect } from "react";
import { visitRepaso } from "./actions";

/** Marca la semana como activa al abrir el repaso (una vez por montaje). No pinta nada. */
export function Visit() {
  useEffect(() => { void visitRepaso(); }, []);
  return null;
}
