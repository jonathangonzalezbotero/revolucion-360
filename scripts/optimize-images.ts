// Convierte las imágenes originales de Jonathan (App/archive, PNG ~1 MB) a WebP optimizado en public/.
// No genera ni dibuja nada: solo recorta, cambia de tamaño, quita el fondo crema de las ilustraciones y comprime.
// Uso: npx tsx scripts/optimize-images.ts "<carpeta archive>" [--solo <nombre>] [--salida <carpeta>]
// No toca la base de datos.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const SRC = process.argv[2];
if (!SRC || !fs.existsSync(SRC)) throw new Error('Uso: npx tsx scripts/optimize-images.ts "<carpeta archive>" [--solo <nombre>] [--salida <carpeta>]');
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const ONLY = arg("--solo");
const OUT = arg("--salida") ?? "public";

/** Portadas: archivo original → nombre en public/cursos (emparejadas por contenido con las JPG anteriores). */
const COURSES: Record<string, string> = {
  "8.png": "curso-01", "3.png": "curso-02", "10.png": "curso-03", "5.png": "curso-04", "9.png": "curso-05",
  "6.png": "curso-06", "2.png": "curso-07", "7.png": "curso-08", "4.png": "curso-09",
};
/** Insignias: archivo original → clave de la insignia en public/insignias. */
const BADGES: Record<string, string> = {
  "insignia-0.png": "unlock", "insignia-1.png": "cap", "insignia-2.png": "star", "insignia-3.png": "sprout", "insignia-4.png": "shield",
  "insignia-5.png": "play", "insignia-6.png": "flag", "insignia-7.png": "flame", "insignia-8.png": "grid", "insignia-9.png": "check",
};

/**
 * Quita el fondo liso de una ilustración: inunda desde los bordes todo lo que se parece al color del fondo
 * (así nunca abre huecos dentro de la pieza) y suaviza el borde con un alfa gradual.
 */
async function removeBackground(file: string): Promise<sharp.Sharp> {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const at = (x: number, y: number) => (y * w + x) * 4;
  // Color del fondo: promedio de las 4 esquinas.
  const corners = [at(2, 2), at(w - 3, 2), at(2, h - 3), at(w - 3, h - 3)];
  const bg = [0, 1, 2].map((c) => corners.reduce((a, i) => a + data[i + c], 0) / 4);
  const dist = (i: number) => Math.hypot(data[i] - bg[0], data[i + 1] - bg[1], data[i + 2] - bg[2]);
  const HARD = 18, SOFT = 46; // < HARD: fondo; entre HARD y SOFT: borde suave
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let x = 0; x < w; x++) { stack.push(x, (h - 1) * w + x); }
  for (let y = 0; y < h; y++) { stack.push(y * w, y * w + w - 1); }
  while (stack.length) {
    const p = stack.pop()!;
    if (seen[p]) continue;
    const i = p * 4, d = dist(i);
    if (d >= SOFT) continue;
    seen[p] = 1;
    data[i + 3] = d <= HARD ? 0 : Math.round(255 * (d - HARD) / (SOFT - HARD));
    if (d > HARD) continue; // el borde suave no sigue inundando
    const x = p % w, y = (p / w) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - w);
    if (y < h - 1) stack.push(p + w);
  }
  return sharp(data, { raw: { width: w, height: h, channels: 4 } });
}

const kb = (f: string) => `${Math.round(fs.statSync(f).size / 1024)} KB`;
async function save(img: sharp.Sharp, dir: string, name: string, opts: { width: number; height?: number; alpha?: boolean }) {
  fs.mkdirSync(path.join(OUT, dir), { recursive: true });
  const out = path.join(OUT, dir, `${name}.webp`);
  await img.resize(opts.width, opts.height, { fit: opts.height ? "cover" : "inside", withoutEnlargement: true })
    .webp({ quality: 82, alphaQuality: 90, effort: 6, smartSubsample: true }).toFile(out);
  console.log(`${out.padEnd(48)} ${kb(out)}`);
}

async function main() {
  const want = (f: string) => !ONLY || f.includes(ONLY);
  for (const [f, name] of Object.entries(COURSES)) if (want(f)) await save(sharp(path.join(SRC, f)), "cursos", name, { width: 960, height: 537 });
  for (const [f, name] of Object.entries(BADGES)) if (want(f)) {
    // Mismo recorte que las JPG anteriores: la insignia llena el cuadro.
    const trimmed = await sharp(path.join(SRC, f)).trim({ threshold: 25 }).toBuffer();
    await save(sharp(trimmed), "insignias", name, { width: 256, height: 256 });
  }
  for (const f of fs.readdirSync(SRC).filter((x) => /^ilustracion-\d\d-.+\.png$/.test(x)).sort()) if (want(f)) {
    const name = f.replace(/\.png$/, "").replace(/^ilustracion-\d\d-/, "");
    await save(await removeBackground(path.join(SRC, f)), "ilustraciones", name, { width: 512, alpha: true });
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
