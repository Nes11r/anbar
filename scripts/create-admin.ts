/**
 * Creates the first Super Admin from ADMIN_EMAIL / ADMIN_PASSWORD (env or .env).
 * Usage (PowerShell):  $env:ADMIN_EMAIL="admin@hecotec.az"; $env:ADMIN_PASSWORD="..."; npm run admin:create
 * Remove the password from the environment afterwards. Refuses weak passwords and existing emails.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  const name = process.env.ADMIN_NAME?.trim() || "Sistem Admin";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error("ADMIN_EMAIL düzgün deyil və ya boşdur.");
  if (password.length < 10 || !/\d/.test(password) || !/[A-Za-z]/.test(password)) throw new Error("ADMIN_PASSWORD ən azı 10 simvol, hərf və rəqəm olmalıdır.");
  const exists = await db.user.findUnique({ where: { email } });
  if (exists) {
    console.log(`İstifadəçi artıq var: ${email} — dəyişiklik edilmədi.`);
    return;
  }
  const u = await db.user.create({ data: { email, name, role: "SUPER_ADMIN", passwordHash: await bcrypt.hash(password, 12) } });
  await db.auditLog.create({ data: { action: "CREATE", entityType: "User", entityId: u.id, summary: `İlk Super Admin yaradıldı: ${email}` } });
  console.log(`Super Admin yaradıldı: ${email}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
