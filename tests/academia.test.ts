// Cálculos propios de la Academia: enlaces de video, estado de las clases y avance del curso.
import { describe, expect, it } from "vitest";
import {
  courseProgress, durationLabel, lessonStates, neighbors, nextLessonId, orderLessons, safeCta, splitOn, videoEmbed, isUpcoming, countdown, cleanComment, localParts, type LessonLite,
} from "@/app/(app)/academia/lib";

describe("videoEmbed", () => {
  const yt = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1";
  it("YouTube: watch, youtu.be, shorts, embed, live y parámetros extra", () => {
    expect(videoEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({ kind: "iframe", provider: "youtube", src: yt });
    expect(videoEmbed("https://youtu.be/dQw4w9WgXcQ?si=abc")).toEqual({ kind: "iframe", provider: "youtube", src: yt });
    expect(videoEmbed("https://youtube.com/shorts/dQw4w9WgXcQ")?.src).toBe(yt);
    expect(videoEmbed("https://www.youtube.com/embed/dQw4w9WgXcQ")?.src).toBe(yt);
    expect(videoEmbed("https://www.youtube.com/live/dQw4w9WgXcQ?feature=share")?.src).toBe(yt);
    expect(videoEmbed("https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1&t=90s")?.src).toBe(`${yt}&start=90`);
  });
  it("Vimeo: público y no listado (conserva el código h)", () => {
    expect(videoEmbed("https://vimeo.com/123456789")).toEqual({ kind: "iframe", provider: "vimeo", src: "https://player.vimeo.com/video/123456789?dnt=1" });
    expect(videoEmbed("https://vimeo.com/123456789/abcdef1234")?.src).toBe("https://player.vimeo.com/video/123456789?dnt=1&h=abcdef1234");
    expect(videoEmbed("https://player.vimeo.com/video/123456789?h=abcdef1234")?.src).toBe("https://player.vimeo.com/video/123456789?dnt=1&h=abcdef1234");
  });
  it("Mux: enlace de stream o de player", () => {
    expect(videoEmbed("https://stream.mux.com/a1B2c3D4e5F6g7H8.m3u8")).toEqual({ kind: "iframe", provider: "mux", src: "https://player.mux.com/a1B2c3D4e5F6g7H8" });
    expect(videoEmbed("https://player.mux.com/a1B2c3D4e5F6g7H8")?.src).toBe("https://player.mux.com/a1B2c3D4e5F6g7H8");
  });
  it("archivo .mp4 directo con https", () => {
    expect(videoEmbed("https://cdn.example.com/clases/1.mp4")).toEqual({ kind: "video", src: "https://cdn.example.com/clases/1.mp4" });
    expect(videoEmbed("http://cdn.example.com/clases/1.mp4")).toBeNull();
  });
  it("vacío, mal escrito o de otro sitio → null", () => {
    expect(videoEmbed("")).toBeNull();
    expect(videoEmbed(null)).toBeNull();
    expect(videoEmbed("no es un enlace")).toBeNull();
    expect(videoEmbed("javascript:alert(1)")).toBeNull();
    expect(videoEmbed("https://example.com/video")).toBeNull();
    expect(videoEmbed("https://www.youtube.com/watch")).toBeNull();
    expect(videoEmbed("https://vimeo.com/canal")).toBeNull();
  });
});

describe("estado de las clases", () => {
  const L = (id: string, required = false, moduleId: string | null = "m1", sort = 0): LessonLite => ({ id, moduleId, required, sort });
  const course = [L("a", true, "m1", 1), L("b", true, "m1", 2), L("c", false, "m1", 3), L("d", false, "m1", 4)];

  it("sin nada visto: la primera es la siguiente y lo que va tras una obligatoria queda bloqueado", () => {
    const st = lessonStates(course, new Set());
    expect([...st.values()]).toEqual(["next", "locked", "locked", "locked"]);
  });
  it("tras las obligatorias, las opcionales quedan disponibles", () => {
    const st = lessonStates(course, new Set(["a", "b"]));
    expect([...st.values()]).toEqual(["done", "done", "next", "open"]);
  });
  it("una clase vista nunca se bloquea, aunque falte una obligatoria antes", () => {
    const st = lessonStates(course, new Set(["c"]));
    expect(st.get("c")).toBe("done");
    expect(st.get("a")).toBe("next");
    expect(st.get("b")).toBe("locked");
  });
  it("sin obligatorias todo está disponible", () => {
    const st = lessonStates([L("x"), L("y"), L("z")], new Set(["y"]));
    expect([...st.values()]).toEqual(["next", "done", "open"]);
  });
  it("siguiente clase y curso completo", () => {
    expect(nextLessonId(course, new Set(["a"]))).toBe("b");
    expect(nextLessonId(course, new Set(["a", "b", "c", "d"]))).toBeNull();
    expect(nextLessonId([], new Set())).toBeNull();
  });
  it("orden: por módulo, luego por sort; las clases sin módulo van al final", () => {
    const mods = [{ id: "m2", sort: 2 }, { id: "m1", sort: 1 }];
    const ordered = orderLessons([L("z", false, null, 0), L("m2a", false, "m2", 1), L("m1b", false, "m1", 2), L("m1a", false, "m1", 1)], mods);
    expect(ordered.map((l) => l.id)).toEqual(["m1a", "m1b", "m2a", "z"]);
  });
  it("anterior y siguiente", () => {
    expect(neighbors(course, "a")).toEqual({ prev: null, next: course[1] });
    expect(neighbors(course, "d")).toEqual({ prev: course[2], next: null });
    expect(neighbors(course, "nope")).toEqual({ prev: null, next: null });
  });
});

describe("avance del curso", () => {
  it("cuenta solo las clases que existen hoy", () => {
    expect(courseProgress(["a", "b", "c"], new Set(["a", "otra"]))).toEqual({ done: 1, total: 3, pct: 33, complete: false });
    expect(courseProgress(["a", "b"], new Set(["a", "b"]))).toEqual({ done: 2, total: 2, pct: 100, complete: true });
  });
  it("un curso sin clases no está completo ni divide por cero", () => {
    expect(courseProgress([], new Set(["a"]))).toEqual({ done: 0, total: 0, pct: 0, complete: false });
  });
});

describe("formato y acceso", () => {
  const u = { h: "h", min: "min", s: "s" };
  it("duración", () => {
    expect(durationLabel(0, u)).toBeNull();
    expect(durationLabel(45, u)).toBe("45 s");
    expect(durationLabel(470, u)).toBe("8 min");
    expect(durationLabel(3900, u)).toBe("1 h 05 min");
  });
  it("pantalla de 'Hazlo ahora' solo si es una ruta interna", () => {
    expect(safeCta("/cierre")).toBe("/cierre");
    expect(safeCta("/movimientos?ver=revisar")).toBe("/movimientos?ver=revisar");
    expect(safeCta("https://otro.com")).toBeNull();
    expect(safeCta("//otro.com")).toBeNull();
    expect(safeCta(null)).toBeNull();
  });
  it("partir un texto para resaltar un valor", () => {
    expect(splitOn("Tienes {n} puntos · Nivel {level}", "n", { level: 2 })).toEqual(["Tienes ", " puntos · Nivel 2"]);
    expect(splitOn("Sin valor", "n")).toEqual(["Sin valor", ""]);
  });
});

describe("cursos programados y comentarios", () => {
  const now = Date.parse("2026-11-24T10:00:00Z");
  it("programado a futuro se ve pero no se abre; vencido o publicado sí", () => {
    expect(isUpcoming("scheduled", "2026-12-04T00:00:00Z", now)).toBe(true);
    expect(isUpcoming("scheduled", "2026-11-01T00:00:00Z", now)).toBe(false);
    expect(isUpcoming("published", "2026-12-04T00:00:00Z", now)).toBe(false);
    expect(isUpcoming("scheduled", null, now)).toBe(false);
  });
  it("cuenta regresiva", () => {
    expect(countdown(now + ((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1000, now)).toEqual({ d: 2, h: 3, m: 4, s: 5 });
    expect(countdown(now - 1000, now)).toEqual({ d: 0, h: 0, m: 0, s: 0 });
  });
  it("comentario de 1 a 2,000 caracteres", () => {
    expect(cleanComment("  Hola  ")).toBe("Hola");
    expect(cleanComment("   ")).toBeNull();
    expect(cleanComment("a".repeat(2001))).toBeNull();
    expect(cleanComment("a".repeat(2000))).toHaveLength(2000);
  });
  it("fecha y hora de liberación en la zona del usuario", () => {
    expect(localParts("2026-12-04T00:00:00Z", "Australia/Sydney")).toEqual({ date: "2026-12-04", time: "11:00" });
    expect(localParts("2026-12-04T00:00:00Z", "America/Bogota")).toEqual({ date: "2026-12-03", time: "19:00" });
  });
});
