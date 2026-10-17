// Consulta externa de IMEI (bloqueio por perda/roubo, Buscar iPhone, operadora, garantia).
// Interface única com três implementações: nenhuma (só validação local), demonstração e HTTP genérico.
import { BusinessError } from "@/lib/errors";

export type ImeiReport = {
  /** true = IMEI em lista de bloqueio (perda/roubo/inadimplência). null = não informado. */
  blacklisted: boolean | null;
  /** true = "Buscar iPhone"/bloqueio de ativação ligado. */
  findMyOn: boolean | null;
  carrier: string | null;
  simLock: string | null;
  warranty: string | null;
  model: string | null;
  raw: unknown;
};

export interface ImeiProvider {
  id: "none" | "mock" | "http";
  name: string;
  check(imei: string): Promise<ImeiReport>;
}

export type ImeiProviderConfig = { provider: string; apiUrl?: string | null; apiKey?: string | null };

export const IMEI_PROVIDERS = [
  { value: "none", label: "Nenhum (só validação local)" },
  { value: "mock", label: "Demonstração (resultados simulados)" },
  { value: "http", label: "API HTTP (serviço contratado)" },
] as const;

const empty = (raw: unknown = null): ImeiReport => ({ blacklisted: null, findMyOn: null, carrier: null, simLock: null, warranty: null, model: null, raw });

export const noneProvider: ImeiProvider = {
  id: "none",
  name: "Validação local",
  check: async () => empty(),
};

/**
 * Demonstração, determinística pelo 14º dígito (penúltimo):
 * 9 → bloqueado (perda/roubo), 8 → Buscar iPhone ativo, demais → sem restrição.
 */
export function mockReport(imei: string): ImeiReport {
  const d = imei.charAt(13);
  const blacklisted = d === "9";
  const findMyOn = d === "8";
  const carriers = ["Desbloqueado (todas as operadoras)", "Desbloqueado (todas as operadoras)", "Vivo", "Claro", "TIM"];
  const r = {
    blacklisted,
    findMyOn,
    carrier: carriers[Number(imei.charAt(12)) % carriers.length],
    simLock: Number(imei.charAt(12)) % 5 >= 2 ? "Bloqueado para operadora" : "Livre",
    warranty: Number(imei.charAt(11)) % 3 === 0 ? "Garantia Apple ativa" : "Fora da garantia Apple",
    model: null,
  };
  return { ...r, raw: { demo: true, ...r } };
}

export const mockProvider: ImeiProvider = {
  id: "mock",
  name: "Demonstração",
  check: async (imei) => mockReport(imei),
};

const pick = (o: Record<string, unknown>, keys: string[]) => {
  for (const k of Object.keys(o)) if (keys.includes(k.toLowerCase())) return o[k];
  return undefined;
};

function toBool(v: unknown): boolean | null {
  if (v == null || v === "") return null;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const s = String(v).trim().toLowerCase();
  if (["true", "on", "yes", "sim", "1", "blacklisted", "blocked", "bloqueado", "lost", "stolen", "locked", "ativo", "active"].includes(s)) return true;
  if (["false", "off", "no", "nao", "não", "0", "clean", "limpo", "unlocked", "inativo", "inactive"].includes(s)) return false;
  return null;
}

/** Normaliza respostas de APIs diferentes (nomes de campo variam entre fornecedores). */
export function normalizeReport(json: unknown): ImeiReport {
  if (!json || typeof json !== "object") return empty(json);
  // muitos serviços embrulham em { result: {...} } ou { data: {...} }
  const root = json as Record<string, unknown>;
  const o = (pick(root, ["result", "data", "object", "response"]) as Record<string, unknown> | undefined) ?? root;
  const s = (keys: string[]) => {
    const v = pick(o, keys);
    return v == null || v === "" ? null : String(v);
  };
  return {
    blacklisted: toBool(pick(o, ["blacklisted", "blacklist", "blackliststatus", "blacklist_status", "gsmablacklisted", "lost", "stolen", "blocked"])),
    findMyOn: toBool(pick(o, ["fmi", "fmion", "findmy", "findmyiphone", "find_my_iphone", "icloudlock", "icloud_lock", "activationlock"])),
    carrier: s(["carrier", "network", "operator", "lockedcarrier", "locked_carrier", "operadora"]),
    simLock: s(["simlock", "sim_lock", "simlockstatus", "lockstatus"]),
    warranty: s(["warranty", "warrantystatus", "warranty_status", "coverage", "garantia"]),
    model: s(["model", "modelname", "model_name", "description", "modelo"]),
    raw: json,
  };
}

export function httpProvider(apiUrl: string, apiKey?: string | null): ImeiProvider {
  return {
    id: "http",
    name: "API externa",
    async check(imei) {
      // {imei} na URL é substituído; senão o IMEI vai como parâmetro ?imei=
      const url = apiUrl.includes("{imei}") ? apiUrl.replace("{imei}", imei) : `${apiUrl}${apiUrl.includes("?") ? "&" : "?"}imei=${imei}`;
      let res: Response;
      try {
        res = await fetch(url, {
          headers: { Accept: "application/json", ...(apiKey ? { Authorization: `Bearer ${apiKey}`, "X-API-Key": apiKey } : {}) },
          signal: AbortSignal.timeout(20000),
          cache: "no-store",
        });
      } catch {
        throw new BusinessError("Não foi possível falar com o serviço de consulta de IMEI (sem conexão ou tempo esgotado).");
      }
      if (res.status === 401 || res.status === 403) throw new BusinessError("O serviço de IMEI recusou a chave de acesso. Confira em Configurações.");
      if (!res.ok) throw new BusinessError(`O serviço de IMEI respondeu com erro (${res.status}).`);
      const json = await res.json().catch(() => null);
      if (json == null) throw new BusinessError("Resposta inválida do serviço de IMEI.");
      return normalizeReport(json);
    },
  };
}

export function resolveProvider(cfg: ImeiProviderConfig): ImeiProvider {
  if (cfg.provider === "mock") return mockProvider;
  if (cfg.provider === "http") {
    const url = cfg.apiUrl || process.env.IMEI_API_URL;
    if (!url) throw new BusinessError("Informe o endereço da API de IMEI (Configurações → Parâmetros gerais).");
    return httpProvider(url, cfg.apiKey || process.env.IMEI_API_KEY);
  }
  return noneProvider;
}
