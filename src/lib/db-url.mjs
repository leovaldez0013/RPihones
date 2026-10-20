// Ajusta a URL do PostgreSQL copiada do Neon para o Prisma (usado pelo app e pelo build).
// O lojista cola a "connection string" do Neon como ela vem; aqui:
//  - removemos channel_binding (o Prisma não precisa e pode recusar o parâmetro);
//  - no pooler do Neon (host com "-pooler"), ligamos pgbouncer=true e connection_limit=1 (serverless);
//  - a conexão direta (para criar tabelas) é o mesmo endereço sem "-pooler".

/** @param {string | undefined} raw */
export function isPostgresUrl(raw) {
  return /^postgres(ql)?:\/\//.test(raw ?? "");
}

/** @param {string} raw */
export function normalizeDatabaseUrl(raw) {
  if (!isPostgresUrl(raw)) return raw;
  const u = new URL(raw);
  u.searchParams.delete("channel_binding");
  if (!u.searchParams.has("sslmode") && !/^(localhost|127\.0\.0\.1)$/.test(u.hostname)) u.searchParams.set("sslmode", "require");
  if (u.hostname.includes("-pooler")) {
    if (!u.searchParams.has("pgbouncer")) u.searchParams.set("pgbouncer", "true");
    if (!u.searchParams.has("connection_limit")) u.searchParams.set("connection_limit", "1");
  }
  return u.toString();
}

/** Conexão direta (sem pooler) derivada da URL, para o prisma db push. @param {string} raw */
export function directDatabaseUrl(raw) {
  if (!isPostgresUrl(raw)) return raw;
  const u = new URL(normalizeDatabaseUrl(raw));
  u.hostname = u.hostname.replace("-pooler", "");
  u.searchParams.delete("pgbouncer");
  u.searchParams.delete("connection_limit");
  return u.toString();
}
