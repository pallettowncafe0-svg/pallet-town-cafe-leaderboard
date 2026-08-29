import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
function secret() {
  if (process.env.NODE_ENV === "production" && (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32)) throw new Error("AUTH_SECRET must be set to at least 32 characters in production");
  return new TextEncoder().encode(process.env.AUTH_SECRET || "development-only-secret-change-me-32chars");
}
const cookieName = "ptc_admin";
export async function verifyPassword(password: string) { return !!process.env.ADMIN_PASSWORD_HASH && bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH); }
export async function grantAdmin() { const token = await new SignJWT({ role: "admin" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("8h").sign(secret()); (await cookies()).set(cookieName, token, { httpOnly:true, sameSite:"lax", secure:process.env.NODE_ENV === "production", path:"/", maxAge:28800 }); }
export async function isAdmin() { const token = (await cookies()).get(cookieName)?.value; if (!token) return false; try { return (await jwtVerify(token, secret())).payload.role === "admin"; } catch { return false; } }
export async function requireAdmin() { if (!(await isAdmin())) throw new Error("Admin authorization required"); }

