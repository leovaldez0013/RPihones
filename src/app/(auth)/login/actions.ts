"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";

export async function loginAction(_: string | null, formData: FormData): Promise<string | null> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: (formData.get("callbackUrl") as string) || "/dashboard",
    });
    return null;
  } catch (error) {
    if (error instanceof AuthError) return "E-mail ou senha incorretos.";
    throw error; // redirect do Next
  }
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
