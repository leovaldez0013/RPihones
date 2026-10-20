import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src"), "server-only": path.resolve(__dirname, "tests/server-only-stub.ts") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    // npm run test:postgres define TEST_DATABASE_URL (PostgreSQL); o padrão é um SQLite descartável
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL ?? "file:./test.db", TZ: "America/Sao_Paulo" },
    fileParallelism: false,
    testTimeout: 20000,
  },
});
