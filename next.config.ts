import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // App autenticada y por usuario: todo se renderiza por petición.
  images: { formats: ["image/avif", "image/webp"] },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
      {
        // Páginas con un token en la URL (preferencias de correo por token, confirmación de una conexión): el token nunca
        // sale en el Referer hacia otra página. Va después de la regla general: la última gana.
        source: "/correo/preferencias",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }, { key: "X-Frame-Options", value: "DENY" }],
      },
      {
        source: "/api/crm/confirmar",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }, { key: "X-Frame-Options", value: "DENY" }],
      },
    ];
  },
};

export default nextConfig;
