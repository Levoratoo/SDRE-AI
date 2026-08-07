import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/insta/agente.php",
        destination: "/api/agente",
      },
      // Compatibilidade com a extensão Evolua (paths *.php)
      {
        source: "/api/insta/:path.php",
        destination: "/api/insta/:path",
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/levorato-prospect.crx",
        headers: [
          {
            key: "Content-Type",
            value: "application/x-chrome-extension",
          },
          {
            key: "Content-Disposition",
            value: 'attachment; filename="levorato-prospect.crx"',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
