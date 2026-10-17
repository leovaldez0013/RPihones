import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { httpProvider } from "@/features/imei/providers";

let server: Server;
let base = "";
const seen: { url: string; auth?: string }[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    seen.push({ url: req.url ?? "", auth: req.headers.authorization });
    if (req.headers.authorization !== "Bearer chave-ok") {
      res.writeHead(401).end();
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ result: { blacklistStatus: "Clean", fmiOn: false, carrier: "Claro" } }));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("provedor HTTP de IMEI", () => {
  it("monta a URL, envia a chave e normaliza a resposta", async () => {
    const r = await httpProvider(`${base}/check/{imei}`, "chave-ok").check("353429527777803");
    expect(seen.at(-1)?.url).toBe("/check/353429527777803");
    expect(r).toMatchObject({ blacklisted: false, findMyOn: false, carrier: "Claro" });
    await httpProvider(`${base}/v1`, "chave-ok").check("353429527777803");
    expect(seen.at(-1)?.url).toBe("/v1?imei=353429527777803");
  });

  it("chave recusada vira mensagem clara", async () => {
    await expect(httpProvider(`${base}/x`, "errada").check("353429527777803")).rejects.toThrow(/chave/);
  });
});
