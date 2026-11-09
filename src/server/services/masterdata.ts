import { Prisma, type UserRole } from "@prisma/client";
import { z } from "zod";
import { db, withTx } from "@/lib/db";
import { AppError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { can } from "@/lib/rbac";
import { audit, type Actor } from "../audit";
import { applyMovements, nextNumber } from "../stock/ledger";
import { D, validateQty } from "../stock/rules";
import { assertVariantsUsable, assertWarehouse, unitRulesFor } from "./common";
import { ensureSiteWarehouse } from "./sites";

const optStr = (max = 500) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const optDate = z.union([z.coerce.date(), z.literal("").transform(() => null), z.null()]).optional();

// ── Projects ──
export const projectSchema = z.object({
  code: z.string().trim().min(2, "Layihə kodu məcburidir.").max(30).regex(/^[A-Za-z0-9._/-]+$/, "Kodda yalnız hərf, rəqəm və . _ / - ola bilər."),
  name: z.string().trim().min(2, "Layihə adı məcburidir.").max(200),
  client: optStr(200),
  location: optStr(200),
  startDate: optDate,
  endDate: optDate,
  managerName: optStr(200),
  isActive: z.boolean().default(true),
  notes: optStr(2000),
}).refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, { path: ["endDate"], message: "Bitmə tarixi başlanğıcdan əvvəl ola bilməz." });

export async function saveProject(actor: Actor, id: string | null, input: z.input<typeof projectSchema>) {
  if (!can(actor.role, "project.manage")) throw new ForbiddenError();
  const d = projectSchema.parse(input);
  return withTx(async (tx) => {
    const data = { ...d, code: d.code.toUpperCase(), startDate: d.startDate ?? null, endDate: d.endDate ?? null };
    if (id) {
      const before = await tx.project.findUnique({ where: { id } });
      if (!before) throw new NotFoundError("Layihə");
      if (before.code !== data.code) {
        const used = await tx.materialRequest.count({ where: { projectId: id } });
        if (used) throw new AppError("MR-i olan layihənin kodu dəyişdirilə bilməz (MR nömrələri koda bağlıdır).");
      }
      const p = await tx.project.update({ where: { id }, data });
      const wh = await ensureSiteWarehouse(tx, p);
      if (before.code !== p.code) await tx.warehouse.update({ where: { id: wh.id }, data: { name: `Sahə anbarı — ${p.code}` } });
      await audit(tx, actor, "UPDATE", "Project", id, `${p.code} yeniləndi`, before, p);
      return p;
    }
    const p = await tx.project.create({ data });
    const wh = await ensureSiteWarehouse(tx, p);
    await audit(tx, actor, "CREATE", "Project", p.id, `${p.code} – ${p.name} yaradıldı (sahə anbarı: ${wh.code})`);
    return p;
  });
}

// ── Employees ──
export const employeeSchema = z.object({
  code: z.string().trim().min(1, "İşçi ID məcburidir.").max(30),
  fullName: z.string().trim().min(3, "Ad-soyad məcburidir.").max(200),
  group: z.enum(["ENGINEER", "WORKER"], { errorMap: () => ({ message: "Kateqoriya (Mühəndis / Fəhlə) seçilməlidir." }) }),
  position: optStr(200),
  department: optStr(200),
  projectId: z.string().uuid().optional().nullable().or(z.literal("").transform(() => null)),
  isActive: z.boolean().default(true),
  notes: optStr(1000),
});

export async function saveEmployee(actor: Actor, id: string | null, input: z.input<typeof employeeSchema>) {
  if (!can(actor.role, "employee.manage")) throw new ForbiddenError();
  const d = employeeSchema.parse(input);
  return withTx(async (tx) => {
    const data = { ...d, projectId: d.projectId || null };
    if (id) {
      const e = await tx.employee.update({ where: { id }, data });
      await audit(tx, actor, "UPDATE", "Employee", id, `${e.code} yeniləndi`);
      return e;
    }
    const e = await tx.employee.create({ data });
    await audit(tx, actor, "CREATE", "Employee", e.id, `${e.code} – ${e.fullName}`);
    return e;
  });
}

// ── Warehouses / suppliers / categories / units ──
export const warehouseSchema = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(2, "Anbar adı məcburidir.").max(100),
  type: z.enum(["NORMAL", "QUARANTINE"]),
  location: optStr(200),
  isActive: z.boolean().default(true),
});
export const supplierSchema = z.object({
  code: optStr(30),
  name: z.string().trim().min(2, "Tədarükçü adı məcburidir.").max(200),
  contact: optStr(200),
  phone: optStr(50),
  email: z.string().trim().email("E-poçt düzgün deyil.").optional().nullable().or(z.literal("").transform(() => null)),
  notes: optStr(1000),
  isActive: z.boolean().default(true),
});
export const categorySchema = z.object({
  code: z.string().trim().min(2).max(30).regex(/^[A-Z0-9_-]+$/i),
  nameAz: z.string().trim().min(2).max(100),
  nameEn: optStr(100),
  isUniform: z.boolean().default(false),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
});

type Entity = "warehouse" | "supplier" | "category";
const SCHEMAS = { warehouse: warehouseSchema, supplier: supplierSchema, category: categorySchema };

export async function saveMasterRecord(actor: Actor, entity: Entity, id: string | null, input: unknown) {
  if (!can(actor.role, "masterdata.manage")) throw new ForbiddenError();
  const d = SCHEMAS[entity].parse(input) as Record<string, unknown>;
  if (entity === "category") d.code = String(d.code).toUpperCase();
  if (entity === "warehouse") d.code = String(d.code).toUpperCase();
  return withTx(async (tx) => {
    const model = (tx as unknown as Record<Entity, { create: (a: unknown) => Promise<{ id: string }>; update: (a: unknown) => Promise<{ id: string }> }>)[entity];
    if (entity === "warehouse" && id && d.isActive === false) {
      const bal = await tx.stockBalance.aggregate({ where: { warehouseId: id }, _sum: { onHand: true } });
      if (D(bal._sum.onHand ?? 0).gt(0)) throw new AppError("Qalığı olan anbar deaktiv edilə bilməz.");
    }
    const rec = id ? await model.update({ where: { id }, data: d }) : await model.create({ data: d });
    await audit(tx, actor, id ? "UPDATE" : "CREATE", entity, rec.id, `${entity}: ${String(d.name ?? d.nameAz)}`);
    return rec;
  });
}

// ── Users ──
export const userSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-poçt düzgün deyil."),
  name: z.string().trim().min(2).max(100),
  role: z.enum(["SUPER_ADMIN", "DIRECTOR", "WAREHOUSE_MANAGER", "STOREKEEPER", "PROCUREMENT", "PROJECT_MANAGER", "AUDITOR", "EMPLOYEE", "CLIENT"]),
  isActive: z.boolean().default(true),
  password: z.string().optional().nullable(),
  projectId: z.string().uuid().optional().nullable().or(z.literal("").transform(() => null)),
  employeeId: z.string().uuid().optional().nullable().or(z.literal("").transform(() => null)),
});

export async function saveUser(actor: Actor, id: string | null, input: z.input<typeof userSchema>, hash: (pw: string) => Promise<string>, strength: (pw: string) => string | null) {
  if (!can(actor.role, "settings.manage")) throw new ForbiddenError();
  const d = userSchema.parse(input);
  if (d.password) {
    const e = strength(d.password);
    if (e) throw new AppError(e, "VALIDATION", { password: e });
  }
  if (!id && !d.password) throw new AppError("Yeni istifadəçi üçün ilkin parol məcburidir.", "VALIDATION", { password: "Parol daxil edin" });
  return withTx(async (tx) => {
    if (id === actor.id && (d.role !== "SUPER_ADMIN" || !d.isActive)) throw new AppError("Öz admin rolunuzu və ya hesabınızı deaktiv edə bilməzsiniz.");
    if (id && (d.role !== "SUPER_ADMIN" || !d.isActive)) {
      const admins = await tx.user.count({ where: { role: "SUPER_ADMIN", isActive: true, id: { not: id } } });
      if (admins === 0) throw new AppError("Sistemdə ən azı bir aktiv Super Admin qalmalıdır.");
    }
    if (d.role === "EMPLOYEE" && !d.employeeId) throw new AppError("İşçi hesabı işçi kartına bağlanmalıdır (İşçi kartı seçin).", "VALIDATION", { employeeId: "İşçi kartı seçin" });
    if (d.employeeId) {
      const taken = await tx.user.findFirst({ where: { employeeId: d.employeeId, id: id ? { not: id } : undefined } });
      if (taken) throw new AppError(`Bu işçi kartı artıq başqa hesaba bağlıdır (${taken.email}).`, "VALIDATION");
    }
    const data: Prisma.UserUpdateInput = { email: d.email, name: d.name, role: d.role as UserRole, isActive: d.isActive, projectId: d.projectId ?? null, employeeId: d.role === "EMPLOYEE" ? d.employeeId ?? null : null, pendingApproval: false };
    if (d.password) {
      data.passwordHash = await hash(d.password);
      data.mustChangePwd = id !== actor.id;
    }
    if (id) {
      const u = await tx.user.update({ where: { id }, data });
      if (!d.isActive || d.password) await tx.session.deleteMany({ where: { userId: id } });
      await audit(tx, actor, "UPDATE", "User", id, `${u.email}: rol ${u.role}, aktiv ${u.isActive}${d.password ? ", parol dəyişdirildi" : ""}`);
      return u;
    }
    const u = await tx.user.create({ data: { email: d.email, name: d.name, role: d.role as UserRole, isActive: d.isActive, passwordHash: data.passwordHash as string, mustChangePwd: true, projectId: d.projectId ?? null, employeeId: d.role === "EMPLOYEE" ? d.employeeId ?? null : null } });
    await audit(tx, actor, "CREATE", "User", u.id, `${u.email} (${u.role}) yaradıldı`);
    return u;
  });
}

// ── Reservations ──
export async function createReservation(actor: Actor, input: { warehouseId: string; variantId: string; qty: number; projectId?: string | null; reason?: string | null }) {
  if (!can(actor.role, "reservation.manage")) throw new ForbiddenError();
  await assertWarehouse(db, input.warehouseId);
  await assertVariantsUsable(db, [input.variantId]);
  const units = await unitRulesFor(db, [input.variantId]);
  const e = validateQty(input.qty, units.get(input.variantId) ?? false);
  if (e) throw new AppError(e, "VALIDATION");
  return withTx(async (tx) => {
    const number = await nextNumber(tx, "RSV");
    const r = await tx.reservation.create({
      data: { number, warehouseId: input.warehouseId, variantId: input.variantId, qty: D(input.qty), projectId: input.projectId || null, reason: input.reason || null, createdById: actor.id },
    });
    await applyMovements(tx, { docType: "RESERVATION", docId: r.id, docNumber: number, movementDate: new Date(), userId: actor.id, reason: input.reason }, [
      { entryType: "RESERVATION", warehouseId: input.warehouseId, variantId: input.variantId, qty: D(input.qty), projectId: input.projectId || null, idempotencyKey: `RSV:${r.id}` },
    ]);
    await audit(tx, actor, "CREATE", "Reservation", r.id, `${number}: ${input.qty} rezerv edildi`);
    return r;
  });
}

export async function releaseReservation(actor: Actor, id: string) {
  if (!can(actor.role, "reservation.manage")) throw new ForbiddenError();
  return withTx(async (tx) => {
    const lock = await tx.$queryRaw<{ status: string }[]>`SELECT status FROM reservations WHERE id = ${id}::uuid FOR UPDATE`;
    if (!lock[0]) throw new NotFoundError("Rezerv");
    if (lock[0].status !== "ACTIVE") return { alreadyReleased: true };
    const r = await tx.reservation.findUniqueOrThrow({ where: { id } });
    await applyMovements(tx, { docType: "RESERVATION", docId: r.id, docNumber: r.number, movementDate: new Date(), userId: actor.id, reason: "Rezerv azad edildi" }, [
      { entryType: "RESERVATION_RELEASE", warehouseId: r.warehouseId, variantId: r.variantId, qty: D(r.qty), projectId: r.projectId, idempotencyKey: `RSV:${r.id}:REL` },
    ]);
    await tx.reservation.update({ where: { id }, data: { status: "RELEASED", releasedAt: new Date() } });
    await audit(tx, actor, "RELEASE", "Reservation", id, `${r.number} azad edildi`);
    return { alreadyReleased: false };
  });
}

// ── Settings / approval route ──
export async function saveSettings(actor: Actor, values: { pmApprovalThreshold: number; gdApprovalThreshold: number; overReceiptTolerancePct: number }) {
  if (!can(actor.role, "settings.manage")) throw new ForbiddenError();
  const s = z.object({ pmApprovalThreshold: z.coerce.number().min(0), gdApprovalThreshold: z.coerce.number().min(0), overReceiptTolerancePct: z.coerce.number().min(0).max(20) }).parse(values);
  return withTx(async (tx) => {
    for (const [key, value] of Object.entries(s)) {
      await tx.appSetting.upsert({ where: { key }, update: { value, updatedBy: actor.id }, create: { key, value, updatedBy: actor.id } });
    }
    await audit(tx, actor, "UPDATE", "Settings", null, "Parametrlər yeniləndi", undefined, s);
  });
}

export async function saveApprovalStep(actor: Actor, step: number, input: { isActive: boolean; condition: "ALWAYS" | "URGENT_OR_PM_THRESHOLD" | "GD_THRESHOLD"; allowedRoles: UserRole[] }) {
  if (!can(actor.role, "settings.manage")) throw new ForbiddenError();
  return withTx(async (tx) => {
    const cur = await tx.approvalStepConfig.findUnique({ where: { step } });
    if (!cur) throw new NotFoundError("Mərhələ");
    if (cur.roleCode === "REQUESTER" && !input.isActive) throw new AppError("Tələb edən mərhələsi söndürülə bilməz.");
    if (input.isActive && input.allowedRoles.length === 0) throw new AppError("Aktiv mərhələ üçün ən azı bir rol seçin.");
    await tx.approvalStepConfig.update({ where: { step }, data: input });
    await audit(tx, actor, "UPDATE", "ApprovalStepConfig", String(step), `${cur.labelAz}: aktiv=${input.isActive}, şərt=${input.condition}, rollar=${input.allowedRoles.join(",")}`);
  });
}
