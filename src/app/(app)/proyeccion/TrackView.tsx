"use client";
import { useEffect, useRef } from "react";
import { trackForecastView } from "./actions";

/** Registra `forecast_view` una vez por visita (no en cada repintado después de guardar un escenario). */
export function TrackView() {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    void trackForecastView();
  }, []);
  return null;
}
