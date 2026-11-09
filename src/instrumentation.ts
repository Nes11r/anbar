/**
 * Process-level safety net: an unexpected promise rejection in any library must never take the server down.
 * (Node's default is to crash the whole process.) Errors are logged; requests keep being served.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  process.on("unhandledRejection", (reason) => {
    console.error(`[${new Date().toISOString()}] [unhandledRejection]`, reason instanceof Error ? reason.stack : reason);
  });
  process.on("uncaughtExceptionMonitor", (err) => {
    console.error(`[${new Date().toISOString()}] [uncaughtException]`, err.stack ?? err.message);
  });
  // Graceful shutdown on self-hosting (Vercel manages function lifecycle itself).
  if (process.env.VERCEL) return;
  const { db } = await import("./lib/db");
  const close = async () => {
    try {
      await db.$disconnect();
    } finally {
      process.exit(0);
    }
  };
  process.once("SIGTERM", close);
}
