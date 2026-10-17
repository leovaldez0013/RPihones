// Teste de IMEI: validação local (Luhn + TAC) + consulta no provedor configurado.
// O resultado fica no histórico (ImeiCheck) e na linha do tempo do aparelho.
import type { PrismaClient } from "@prisma/client";
import { BusinessError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { validateImei } from "@/domain/imei";
import { addDeviceEvent } from "@/features/devices/service";
import { notify } from "@/features/notifications/service";
import { resolveProvider, type ImeiProvider, type ImeiReport } from "./providers";

export type ImeiVerdict = "BLOQUEADO" | "ATENCAO" | "LIVRE" | "LOCAL";

/** Resumo para o lojista: bloqueado (vermelho), atenção (Buscar iPhone), livre ou só validação local. */
export function verdict(r: Pick<ImeiReport, "blacklisted" | "findMyOn">): ImeiVerdict {
  if (r.blacklisted) return "BLOQUEADO";
  if (r.findMyOn) return "ATENCAO";
  if (r.blacklisted === false) return "LIVRE";
  return "LOCAL";
}

export async function getImeiProvider(db: PrismaClient): Promise<ImeiProvider> {
  const s = await db.storeSettings.findUnique({ where: { id: "default" } });
  return resolveProvider({ provider: s?.imeiProvider ?? "none", apiUrl: s?.imeiApiUrl, apiKey: s?.imeiApiKey });
}

export async function checkImei(db: PrismaClient, input: { imei: string; deviceId?: string | null }, userId: string, provider?: ImeiProvider) {
  const v = validateImei(input.imei);
  if (!v.formatOk) throw new BusinessError(v.message);
  if (!v.luhnOk) throw new BusinessError(`${v.message} Não consultamos IMEIs com dígito verificador inválido.`);

  const p = provider ?? (await getImeiProvider(db));
  const [tac, device] = await Promise.all([
    db.tacEntry.findUnique({ where: { tac: v.imei.slice(0, 8) }, include: { model: true } }),
    input.deviceId
      ? db.device.findUnique({ where: { id: input.deviceId }, include: { model: true } })
      : db.device.findFirst({ where: { OR: [{ imei: v.imei }, { imei2: v.imei }], deletedAt: null }, include: { model: true } }),
  ]);
  // consulta externa fora da transação (pode demorar)
  const report = await p.check(v.imei);
  const result = verdict(report);

  const check = await db.$transaction(async (tx) => {
    const c = await tx.imeiCheck.create({
      data: {
        imei: v.imei,
        deviceId: device?.id ?? null,
        userId,
        provider: p.id,
        luhnValid: v.luhnOk,
        tacModel: tac?.model.name ?? report.model,
        blacklisted: report.blacklisted,
        findMyOn: report.findMyOn,
        carrier: report.carrier,
        warranty: report.warranty,
        raw: JSON.stringify({ simLock: report.simLock, model: report.model, response: report.raw }),
      },
    });
    if (device) {
      const text =
        result === "BLOQUEADO" ? "IMEI BLOQUEADO (perda/roubo)" : result === "ATENCAO" ? "Buscar iPhone ATIVO" : result === "LIVRE" ? "IMEI sem restrição" : "IMEI validado localmente";
      await addDeviceEvent(tx, { deviceId: device.id, type: "IMEI_CHECK", description: `Teste de IMEI: ${text}${p.id === "mock" ? " (demonstração)" : ""}`, userId, refType: "IMEI", refId: c.id });
    }
    if (result === "BLOQUEADO") {
      await notify(tx, {
        type: "IMEI_BLOCKED",
        title: `IMEI bloqueado: ${v.imei}`,
        body: device ? `${device.model.name} (${device.status === "VENDIDO" ? "vendido" : "no estoque"}) consta como bloqueado. Não venda nem receba este aparelho.` : "Consta como bloqueado. Não receba este aparelho.",
        href: `/imei?imei=${v.imei}`,
      });
      await audit(tx, { userId, action: "imei.blocked", entity: "Device", entityId: device?.id ?? null, summary: `IMEI ${v.imei} consultado: BLOQUEADO` });
    }
    return c;
  });

  return {
    id: check.id,
    imei: v.imei,
    provider: p.id,
    verdict: result,
    tacModel: tac?.model.name ?? null,
    device: device ? { id: device.id, name: `${device.model.name} ${device.capacity} ${device.color}`, status: device.status } : null,
    report: { blacklisted: report.blacklisted, findMyOn: report.findMyOn, carrier: report.carrier, simLock: report.simLock, warranty: report.warranty, model: report.model },
    createdAt: check.createdAt.toISOString(),
  };
}

export type ImeiCheckResult = Awaited<ReturnType<typeof checkImei>>;
