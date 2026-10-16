import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O indicador do Next em dev cobre o menu inferior no celular
  devIndicators: false,
  serverExternalPackages: ["@react-pdf/renderer", "exceljs"],
  experimental: {
    serverActions: { bodySizeLimit: "10mb" }, // fotos e anexos
  },
};

export default nextConfig;
