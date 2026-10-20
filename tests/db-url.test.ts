import { describe, expect, it } from "vitest";
import { directDatabaseUrl, isPostgresUrl, normalizeDatabaseUrl } from "@/lib/db-url.mjs";

const NEON_POOLED = "postgresql://user:segredo@ep-abc-123-pooler.c-2.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

describe("URL do banco (Neon → Prisma)", () => {
  it("pooler do Neon: remove channel_binding e liga pgbouncer + connection_limit", () => {
    const u = new URL(normalizeDatabaseUrl(NEON_POOLED));
    expect(u.hostname).toBe("ep-abc-123-pooler.c-2.sa-east-1.aws.neon.tech");
    expect(u.searchParams.get("channel_binding")).toBeNull();
    expect(u.searchParams.get("sslmode")).toBe("require");
    expect(u.searchParams.get("pgbouncer")).toBe("true");
    expect(u.searchParams.get("connection_limit")).toBe("1");
    expect(u.password).toBe("segredo");
  });

  it("conexão direta: mesmo endereço sem -pooler e sem pgbouncer", () => {
    const u = new URL(directDatabaseUrl(NEON_POOLED));
    expect(u.hostname).toBe("ep-abc-123.c-2.sa-east-1.aws.neon.tech");
    expect(u.searchParams.get("pgbouncer")).toBeNull();
    expect(u.searchParams.get("sslmode")).toBe("require");
  });

  it("SQLite e Postgres local ficam como estão", () => {
    expect(normalizeDatabaseUrl("file:./dev.db")).toBe("file:./dev.db");
    expect(isPostgresUrl("file:./dev.db")).toBe(false);
    const local = normalizeDatabaseUrl("postgresql://postgres:postgres@localhost:54329/rp_test");
    expect(new URL(local).searchParams.get("sslmode")).toBeNull();
    expect(new URL(local).searchParams.get("pgbouncer")).toBeNull();
  });
});
