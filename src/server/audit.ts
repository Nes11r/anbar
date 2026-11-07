import type { Prisma, UserRole } from "@prisma/client";
import type { Tx } from "@/lib/db";

/** Who performs an action. Built from the session in server actions, or explicitly in tests/scripts. */
export interface Actor {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  ip?: string;
}

function toJson(v: unknown): Prisma.InputJsonValue | undefined {
  if (v === undefined || v === null) return undefined;
  return JSON.parse(
    JSON.stringify(v, (_k, val) => (typeof val === "bigint" ? val.toString() : val)),
  ) as Prisma.InputJsonValue;
}

export async function audit(
  tx: Tx,
  actor: Actor,
  action: string,
  entityType: string,
  entityId: string | null,
  summary?: string,
  before?: unknown,
  after?: unknown,
) {
  await tx.auditLog.create({
    data: {
      userId: actor.id,
      userEmail: actor.email,
      action,
      entityType,
      entityId,
      summary: summary?.slice(0, 1000),
      before: toJson(before),
      after: toJson(after),
      ip: actor.ip,
    },
  });
}

export async function statusChange(
  tx: Tx,
  actor: Actor,
  entityType: string,
  entityId: string,
  fromStatus: string | null,
  toStatus: string,
  note?: string,
) {
  await tx.statusHistory.create({ data: { entityType, entityId, fromStatus, toStatus, userId: actor.id, note } });
}
