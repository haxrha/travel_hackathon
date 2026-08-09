import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return new PrismaClient({ accelerateUrl: "prisma+postgres://localhost:51213/accelerate" });
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma =
  globalForPrisma.prisma ??
  (globalForPrisma.prisma = new Proxy({} as PrismaClient, {
    get(_, prop) {
      if (typeof prop === "symbol") return undefined;
      const real = createClient();
      globalForPrisma.prisma = real;
      return (real as any)[prop];
    },
  }));
