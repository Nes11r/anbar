import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projectionMismatches } from "@/server/services/reports";

export const dynamic = "force-dynamic";

/** Liveness/readiness for docker/pm2/load balancer. ?deep=1 also verifies ledger ↔ balance consistency. */
export async function GET(req: Request) {
  const started = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    const deep = new URL(req.url).searchParams.get("deep") === "1";
    const mismatches = deep ? (await projectionMismatches()).length : undefined;
    return NextResponse.json(
      { status: mismatches ? "degraded" : "ok", db: "up", ms: Date.now() - started, ...(deep ? { ledgerMismatches: mismatches } : {}) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ status: "down", db: "unreachable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
