import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O indicador do Next em dev cobre o menu inferior no celular
  devIndicators: false,
  // permite rodar um build de verificação sem derrubar o servidor de desenvolvimento
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["@react-pdf/renderer", "exceljs", "bwip-js"],
  experimental: {
    serverActions: { bodySizeLimit: "10mb" }, // fotos e anexos
  },
};

export default nextConfig;
