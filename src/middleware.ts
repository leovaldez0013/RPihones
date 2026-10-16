import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

export default NextAuth(authConfig).auth;

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|uploads|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
