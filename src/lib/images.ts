// Rutas de las imágenes del diseño (WebP en /public, hechas por scripts/optimize-images.ts).

/** Ilustraciones decorativas (512 px, fondo transparente). */
export const ILLU = {
  onbPlan: "/ilustraciones/onb-plan.webp",
  onbMetas: "/ilustraciones/onb-metas.webp",
  onbSeguridad: "/ilustraciones/onb-seguridad.webp",
  onbCategorias: "/ilustraciones/onb-categorias.webp",
  vacioMovimientos: "/ilustraciones/vacio-movimientos.webp",
  vacioDeudas: "/ilustraciones/vacio-deudas.webp",
  vacioMetas: "/ilustraciones/vacio-metas.webp",
  vacioInversiones: "/ilustraciones/vacio-inversiones.webp",
  vacioAnalisis: "/ilustraciones/vacio-analisis.webp",
  vacioCuentas: "/ilustraciones/vacio-cuentas.webp",
  metaViaje: "/ilustraciones/meta-viaje.webp",
  metaEmergencia: "/ilustraciones/meta-emergencia.webp",
  metaComprar: "/ilustraciones/meta-comprar.webp",
  metaDeuda: "/ilustraciones/meta-deuda.webp",
  metaInversion: "/ilustraciones/meta-inversion.webp",
  metaOtra: "/ilustraciones/meta-otra.webp",
  celHito: "/ilustraciones/cel-hito.webp",
  celMeta: "/ilustraciones/cel-meta.webp",
  celCierre: "/ilustraciones/cel-cierre.webp",
  celRacha: "/ilustraciones/cel-racha.webp",
} as const;

/** Insignia (los .jpg viejos siguen en /public, pero se pinta el .webp). */
export const badgeSrc = (key: string) => `/insignias/${key}.webp`;

/**
 * Portada de curso al mostrarla. La base guarda las portadas de fábrica como "/cursos/curso-NN.jpg";
 * se pinta su versión .webp. Cualquier otra URL (externa o propia) pasa igual. Nunca se usa para guardar.
 */
export function coverSrc(url: string): string {
  return /^\/cursos\/curso-\d{2}\.jpg$/.test(url) ? url.replace(/\.jpg$/, ".webp") : url;
}
