"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { action } from "@/lib/safe-action";
import { audit } from "@/lib/audit";
import { realDb } from "@/lib/db";
import { deleteSimulation, generateSimulation, pauseSimulation, resumeSimulation } from "./service";

const all = () => revalidatePath("/", "layout");

export const generateSimulationAction = action({ schema: z.object({}), permission: "simulation.manage" }, async (_i, { user }) => {
  const meta = await generateSimulation(user);
  // registro no banco REAL de que uma simulação foi gerada
  await audit(realDb, { userId: user.id, action: "simulation.generate", entity: "Simulation", summary: `Simulação gerada: ${meta.devices} aparelhos, ${meta.sales} vendas` });
  all();
  return meta;
});

export const pauseSimulationAction = action({ schema: z.object({}), permission: "simulation.manage" }, async () => {
  await pauseSimulation();
  all();
  return true;
});

export const resumeSimulationAction = action({ schema: z.object({}), permission: "simulation.manage" }, async () => {
  await resumeSimulation();
  all();
  return true;
});

export const deleteSimulationAction = action({ schema: z.object({}), permission: "simulation.manage" }, async (_i, { user }) => {
  await deleteSimulation();
  await audit(realDb, { userId: user.id, action: "simulation.delete", entity: "Simulation", summary: "Simulação apagada" });
  all();
  return true;
});

export const runAppTestAction = action({ schema: z.object({}), permission: "simulation.manage" }, async (_i, { user }) => {
  const { runAppTest } = await import("./selftest");
  const report = await runAppTest(user);
  await audit(realDb, { userId: user.id, action: "simulation.selftest", entity: "Simulation", summary: `Teste do app: ${report.ok} OK, ${report.failed} com erro` });
  all();
  return { ok: report.ok, failed: report.failed };
});
