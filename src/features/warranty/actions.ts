"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { action } from "@/lib/safe-action";
import { optionalString } from "@/lib/validators";
import { approveClaim, claimWarranty, denyClaim } from "./service";

const refresh = () => {
  revalidatePath("/garantias");
  revalidatePath("/os");
};

export const claimWarrantyAction = action(
  { schema: z.object({ warrantyId: z.string(), problem: z.string().trim().min(3, "Descreva o problema") }), permission: "serviceOrders.edit" },
  async (input, { user }) => {
    const c = await db.$transaction((tx) => claimWarranty(tx, input, user.id));
    refresh();
    return { id: c.id, number: c.number };
  },
);

export const approveClaimAction = action({ schema: z.object({ claimId: z.string(), note: optionalString }), permission: "warranty.decide" }, async (input, { user }) => {
  const so = await db.$transaction((tx) => approveClaim(tx, input, user.id));
  refresh();
  return { serviceOrderId: so.id, number: so.number };
});

export const denyClaimAction = action(
  { schema: z.object({ claimId: z.string(), reason: z.string().trim().min(3, "Informe o motivo da negativa") }), permission: "warranty.decide" },
  async (input, { user }) => {
    await db.$transaction((tx) => denyClaim(tx, input, user.id));
    refresh();
    return true;
  },
);
