import { PrismaClient } from "@prisma/client";
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
function connectionURL() {
  const value = process.env.DATABASE_URL;
  if (!value || !process.env.VERCEL) return value;
  const url = new URL(value);
  // One application connection per warm serverless instance.
  url.searchParams.set("connection_limit", "1");
  if (url.hostname.endsWith(".pooler.supabase.com") && url.port === "6543") {
    url.searchParams.set("pgbouncer", "true");
  }
  return url.toString();
}
const datasourceUrl = connectionURL();
export const db = globalForPrisma.prisma ?? new PrismaClient(
  datasourceUrl ? { datasourceUrl } : undefined
);
globalForPrisma.prisma = db;
