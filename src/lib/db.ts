import { Prisma, PrismaClient } from "@prisma/client";

/**
 * Single PrismaClient per process (survives Next.js dev hot-reload).
 * Pool size is controlled via DATABASE_URL (?connection_limit=20&pool_timeout=15).
 */
const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

function createClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    transactionOptions: { maxWait: 10_000, timeout: 30_000 },
  });
}

export const db: PrismaClient = globalForPrisma.__prisma ?? createClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.__prisma = db;

export type Tx = Prisma.TransactionClient;

const RETRYABLE_PG = new Set(["40001", "40P01", "55P03"]); // serialization, deadlock, lock_not_available

function isRetryable(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2034") return true; // write conflict / deadlock
    if (err.code === "P1001" || err.code === "P1002" || err.code === "P1017") return true; // connection blips
    if (err.code === "P2010" || err.code === "P2028") {
      const c = String((err.meta as { code?: string } | undefined)?.code ?? "");
      if (RETRYABLE_PG.has(c)) return true;
    }
  }
  if (err instanceof Prisma.PrismaClientUnknownRequestError || err instanceof Prisma.PrismaClientRustPanicError) {
    const m = String((err as Error).message);
    return m.includes("40001") || m.includes("40P01") || m.includes("deadlock");
  }
  const m = String((err as Error)?.message ?? "");
  return m.includes("could not serialize access") || m.includes("deadlock detected");
}

/**
 * Run a transaction and transparently retry on deadlock / serialization / transient
 * connection failures with jittered backoff. All stock-changing work goes through here.
 */
export async function withTx<T>(
  fn: (tx: Tx) => Promise<T>,
  opts: { isolationLevel?: Prisma.TransactionIsolationLevel; retries?: number } = {},
): Promise<T> {
  const retries = opts.retries ?? 5;
  let attempt = 0;
  for (;;) {
    try {
      return await db.$transaction(fn, {
        isolationLevel: opts.isolationLevel ?? Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 10_000,
        timeout: 30_000,
      });
    } catch (err) {
      attempt++;
      if (attempt > retries || !isRetryable(err)) throw err;
      const delay = Math.min(1000, 25 * 2 ** attempt) + Math.floor(Math.random() * 40);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
