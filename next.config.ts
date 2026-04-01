import type { NextConfig } from "next";

const securityHeaders = [
  // Evita que la app se cargue dentro de un iframe (clickjacking)
  { key: "X-Frame-Options", value: "DENY" },
  // Evita que el navegador interprete ficheros con un MIME type distinto al declarado
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Controla qué información de referencia se envía
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Fuerza HTTPS durante 1 año (solo activo en producción vía Vercel)
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  // Restringe acceso a APIs de dispositivo no necesarias
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
  },
  turbopack: {
    root: ".",
  },
  webpack: (config) => {
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ["**/.claude/**", "**/node_modules/**"],
    };
    return config;
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
