import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { searchVariants } from "@/server/services/catalog";
import { logServerError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!can(u.role, "catalog.view")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const p = new URL(req.url).searchParams;
  const wh = p.get("warehouseId") ?? undefined;
  try {
    const rows = await searchVariants(p.get("q") ?? "", {
      warehouseId: wh && /^[0-9a-f-]{36}$/i.test(wh) ? wh : undefined,
      onlyInStock: p.get("inStock") === "1",
      group: p.get("group") ?? undefined,
    });
    return NextResponse.json(rows, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    logServerError("api/variants", e);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
