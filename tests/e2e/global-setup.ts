import { execSync } from "node:child_process";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

/** Test-only users with throwaway passwords, in the *_test database. Never used against real data. */
export const E2E_USERS = {
  admin: { email: "e2e.admin@test.local", password: "E2eAdminPass1", role: "SUPER_ADMIN" as const },
  keeper: { email: "e2e.keeper@test.local", password: "E2eKeeperPass1", role: "STOREKEEPER" as const },
  auditor: { email: "e2e.auditor@test.local", password: "E2eAuditPass1", role: "AUDITOR" as const },
};

export default async function globalSetup() {
  const url = process.env.DATABASE_URL!;
  if (!/_test/.test(url)) throw new Error("refusing: not a test database");
  const db = new PrismaClient({ datasources: { db: { url } } });
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$transaction([
    db.$executeRawUnsafe(`SET LOCAL session_replication_role = replica`),
    ...tables.map((t) => db.$executeRawUnsafe(`DELETE FROM "${t.tablename}"`)),
  ]);
  execSync("npx tsx prisma/seed.ts", { env: { ...process.env, DATABASE_URL: url }, stdio: "inherit" });
  for (const u of Object.values(E2E_USERS)) {
    await db.user.create({ data: { email: u.email, name: u.role, role: u.role, passwordHash: await bcrypt.hash(u.password, 10) } });
  }
  await db.$disconnect();
}
