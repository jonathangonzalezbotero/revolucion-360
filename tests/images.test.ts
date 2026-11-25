// Portadas e insignias: se pinta el .webp sin tocar lo que guarda la base.
import { describe, expect, it } from "vitest";
import { badgeSrc, coverSrc } from "@/lib/images";

describe("coverSrc", () => {
  it("cambia las portadas de fábrica a .webp", () => {
    expect(coverSrc("/cursos/curso-01.jpg")).toBe("/cursos/curso-01.webp");
    expect(coverSrc("/cursos/curso-09.jpg")).toBe("/cursos/curso-09.webp");
  });
  it("deja igual todo lo demás", () => {
    expect(coverSrc("")).toBe("");
    expect(coverSrc("/cursos/curso-01.webp")).toBe("/cursos/curso-01.webp");
    expect(coverSrc("/cursos/mi-portada.jpg")).toBe("/cursos/mi-portada.jpg");
    expect(coverSrc("/cursos/curso-1.jpg")).toBe("/cursos/curso-1.jpg");
    expect(coverSrc("https://ejemplo.com/cursos/curso-01.jpg")).toBe("https://ejemplo.com/cursos/curso-01.jpg");
    expect(coverSrc("/cursos/curso-01.jpg?v=2")).toBe("/cursos/curso-01.jpg?v=2");
  });
});

describe("badgeSrc", () => {
  it("apunta al .webp", () => expect(badgeSrc("flame")).toBe("/insignias/flame.webp"));
});
