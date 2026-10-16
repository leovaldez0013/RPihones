"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { action } from "@/lib/safe-action";

export const markNotificationsRead = action(
  { schema: z.object({ ids: z.array(z.string()).optional() }) },
  async ({ ids }, { user }) => {
    await db.notification.updateMany({
      where: {
        readAt: null,
        OR: [{ userId: user.id }, { userId: null }],
        ...(ids?.length ? { id: { in: ids } } : {}),
      },
      data: { readAt: new Date() },
    });
    return true;
  },
);
