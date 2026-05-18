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
  // Tree-shaking agresivo de barrel exports en libs grandes que el cliente
  // hidrata. recharts entra incluso con dynamic() porque sus subcomponentes
  // se re-exportan vía index.ts. Reduce el chunk del gráfico mensual de ~328K
  // a aprox. la mitad cuando se carga.
  experimental: {
    optimizePackageImports: ["recharts"],
    // Las server actions reciben archivos en base64 (subida de documentación,
    // importación de propuestas). El límite por defecto es 1 MB; lo subimos
    // para cubrir el máximo de 25 MB por archivo + el ~33% extra de base64.
    serverActions: {
      bodySizeLimit: "40mb",
    },
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "leanfinance.es",
        pathname: "/wp-content/uploads/**",
      },
    ],
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
