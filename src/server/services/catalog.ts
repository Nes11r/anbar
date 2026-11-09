import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db, withTx, type Tx } from "@/lib/db";
import { AppError, ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { can } from "@/lib/rbac";
import { audit, type Actor } from "../audit";
import { D, validateWorkerGroup } from "../stock/rules";
import { normalizeSize } from "../import/normalize";

const optStr = (max = 500) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));

export const variantInputSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  size: z.string().trim().max(30).default(""),
  color: z.string().trim().max(50).default(""),
  sku: z.string().trim().max(60).optional().nullable(),
  barcode: optStr(64),
  minStock: z.coerce.number().min(0).optional().nullable(),
  isActive: z.boolean().default(true),
});

export const materialSchema = z.object({
  code: z.string().trim().max(40).optional().nullable(),
  isConsumable: z.boolean().default(false),
  originalCode: optStr(100),
  nameAz: z.string().trim().min(2, "Material adı (AZ) məcburidir.").max(300),
  nameEn: optStr(300),
  categoryId: z.string().uuid("Kateqoriya seçilməyib."),
  subcategory: optStr(100),
  workerGroup: z.enum(["ENGINEER", "WORKER", "BOTH", "NOT_APPLICABLE"]),
  brand: optStr(100),
  model: optStr(200),
  description: optStr(2000),
  sizeType: z.enum(["NONE", "CLOTHING_NUMERIC", "CLOTHING_LETTER", "SHOE_EU", "OTHER"]),
  color: optStr(50),
  unitCode: z.string().min(1, "Ölçü vahidi seçilməyib."),
  supplierId: z.string().uuid().optional().nullable().or(z.literal("").transform(() => null)),
  minStock: z.coerce.number().min(0, "Minimum ehtiyat mənfi ola bilməz.").default(0),
  notes: optStr(2000),
  variants: z.array(variantInputSchema).min(1, "Ən azı bir variant (ölçü) olmalıdır."),
});
export type MaterialInput = z.infer<typeof materialSchema>;

const slug = (s: string) =>
  s
    .toUpperCase()
    .replace(/Ə/g, "E").replace(/Ü/g, "U").replace(/Ö/g, "O").replace(/Ğ/g, "G").replace(/İ/g, "I").replace(/I/g, "I").replace(/Ş/g, "S").replace(/Ç/g, "C")
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 20);

export async function generateMaterialCode(tx: Tx, categoryCode: string) {
  const key = `MAT-${categoryCode}`;
  const r = await tx.$queryRaw<{ n: number }[]>`
    INSERT INTO doc_sequences (key, next) VALUES (${key}, 2)
    ON CONFLICT (key) DO UPDATE SET next = doc_sequences.next + 1 RETURNING next - 1 AS n`;
  return `${slug(categoryCode)}-${String(r[0].n).padStart(4, "0")}`;
}

export function variantSku(materialCode: string, size: string, color: string) {
  return [materialCode, size ? slug(size) : "", color ? slug(color).slice(0, 6) : ""].filter(Boolean).join("-");
}

async function validateMaterial(tx: Tx, d: MaterialInput) {
  const cat = await tx.category.findUnique({ where: { id: d.categoryId } });
  if (!cat || !cat.isActive) throw new AppError("Kateqoriya tapılmadı.", "VALIDATION");
  const g = validateWorkerGroup(cat.isUniform, d.workerGroup);
  if (g) throw new AppError(g, "VALIDATION", { workerGroup: g });
  const unit = await tx.unit.findUnique({ where: { code: d.unitCode } });
  if (!unit) throw new AppError("Ölçü vahidi tanınmır.", "VALIDATION");
  if (d.sizeType === "NONE" && d.variants.some((v) => v.size)) throw new AppError("Ölçüsüz materialın variantlarında ölçü göstərilə bilməz. Ölçü növünü seçin.", "VALIDATION");
  if (d.sizeType !== "NONE" && d.variants.some((v) => !v.size)) throw new AppError("Ölçülü materialın hər variantında ölçü göstərilməlidir.", "VALIDATION");
  const keys = d.variants.map((v) => `${normalizeSize(v.size)}|${v.color.toLowerCase()}`);
  if (new Set(keys).size !== keys.length) throw new AppError("Eyni ölçü/rəng variantı iki dəfə göstərilib.", "VALIDATION");
  return cat;
}

export async function createMaterial(actor: Actor, input: MaterialInput, provenance?: { importBatchId: string; importRowId: string; confidence: "HIGH" | "MEDIUM" | "LOW" }, txIn?: Tx) {
  if (!can(actor.role, "catalog.manage")) throw new ForbiddenError();
  const d = materialSchema.parse(input);
  const run = async (tx: Tx) => {
    const cat = await validateMaterial(tx, d);
    const code = d.code?.trim() ? d.code.trim().toUpperCase() : await generateMaterialCode(tx, cat.code);
    if (d.code?.trim() && (await tx.material.findUnique({ where: { code }, select: { id: true } }))) {
      throw new AppError(`“${code}” kodu artıq başqa materialda var.`, "VALIDATION", { code: "Bu kod artıq istifadə olunur" });
    }
    const m = await tx.material.create({
      data: {
        code,
        originalCode: d.originalCode,
        nameAz: d.nameAz,
        nameEn: d.nameEn,
        categoryId: d.categoryId,
        subcategory: d.subcategory,
        workerGroup: d.workerGroup,
        brand: d.brand,
        model: d.model,
        description: d.description,
        sizeType: d.sizeType,
        color: d.color,
        unitCode: d.unitCode,
        supplierId: d.supplierId || null,
        minStock: D(d.minStock),
        isConsumable: d.isConsumable,
        notes: d.notes,
        createdById: actor.id,
        sourceConfidence: provenance?.confidence ?? "MANUAL",
        importBatchId: provenance?.importBatchId,
        importRowId: provenance?.importRowId,
        variants: {
          create: d.variants.map((v) => {
            const size = normalizeSize(v.size);
            return {
              size,
              color: v.color,
              sku: v.sku?.trim() ? v.sku.trim().toUpperCase() : variantSku(code, size, v.color),
              barcode: v.barcode,
              minStock: v.minStock == null ? null : D(v.minStock),
              isActive: v.isActive,
              importBatchId: provenance?.importBatchId,
              importRowId: provenance?.importRowId,
            };
          }),
        },
      },
      include: { variants: true },
    });
    await audit(tx, actor, "CREATE", "Material", m.id, `${m.code} – ${m.nameAz} (${m.variants.length} variant)`);
    return m;
  };
  return txIn ? run(txIn) : withTx(run);
}

export async function updateMaterial(actor: Actor, id: string, version: number, input: MaterialInput) {
  if (!can(actor.role, "catalog.manage")) throw new ForbiddenError();
  const d = materialSchema.parse(input);
  return withTx(async (tx) => {
    const cur = await tx.material.findUnique({ where: { id }, include: { variants: true } });
    if (!cur) throw new NotFoundError("Material");
    await validateMaterial(tx, d);
    if (cur.unitCode !== d.unitCode) {
      const used = await tx.stockLedgerEntry.count({ where: { variantId: { in: cur.variants.map((v) => v.id) } } });
      if (used) throw new AppError("Hərəkəti olan materialın ölçü vahidi dəyişdirilə bilməz.");
    }
    const r = await tx.material.updateMany({
      where: { id, version },
      data: {
        originalCode: d.originalCode,
        nameAz: d.nameAz,
        nameEn: d.nameEn,
        categoryId: d.categoryId,
        subcategory: d.subcategory,
        workerGroup: d.workerGroup,
        brand: d.brand,
        model: d.model,
        description: d.description,
        sizeType: d.sizeType,
        color: d.color,
        unitCode: d.unitCode,
        supplierId: d.supplierId || null,
        minStock: D(d.minStock),
        isConsumable: d.isConsumable,
        notes: d.notes,
        version: { increment: 1 },
      },
    });
    if (r.count === 0) throw new ConflictError();
    // Variants: update existing (size of a used variant is immutable), add new ones. Never delete — deactivate.
    for (const v of d.variants) {
      const size = normalizeSize(v.size);
      if (v.id) {
        const ex = cur.variants.find((x) => x.id === v.id);
        if (!ex) throw new AppError("Variant bu materiala aid deyil.");
        if (ex.size !== size || ex.color !== v.color) {
          const used = await tx.stockLedgerEntry.count({ where: { variantId: ex.id } });
          if (used) throw new AppError(`${ex.sku}: hərəkəti olan variantın ölçüsü/rəngi dəyişdirilə bilməz. Yeni variant əlavə edin.`);
        }
        await tx.materialVariant.update({
          where: { id: v.id },
          data: { size, color: v.color, barcode: v.barcode, minStock: v.minStock == null ? null : D(v.minStock), isActive: v.isActive },
        });
      } else {
        await tx.materialVariant.create({
          data: { materialId: id, size, color: v.color, sku: v.sku?.trim() ? v.sku.trim().toUpperCase() : variantSku(cur.code, size, v.color), barcode: v.barcode, minStock: v.minStock == null ? null : D(v.minStock) },
        });
      }
    }
    await audit(tx, actor, "UPDATE", "Material", id, `${cur.code} yeniləndi`, { nameAz: cur.nameAz, workerGroup: cur.workerGroup, categoryId: cur.categoryId }, { nameAz: d.nameAz, workerGroup: d.workerGroup, categoryId: d.categoryId });
  });
}

/** Materials with history are never deleted — they are archived (deactivated). Draft-free materials can be deleted. */
export async function setMaterialActive(actor: Actor, id: string, active: boolean) {
  if (!can(actor.role, "catalog.manage")) throw new ForbiddenError();
  return withTx(async (tx) => {
    const m = await tx.material.findUnique({ where: { id }, include: { variants: { select: { id: true } } } });
    if (!m) throw new NotFoundError("Material");
    if (!active) {
      const bal = await tx.stockBalance.aggregate({ where: { variantId: { in: m.variants.map((v) => v.id) } }, _sum: { onHand: true } });
      if (D(bal._sum.onHand ?? 0).gt(0)) throw new AppError("Qalığı olan material arxivlənə bilməz. Əvvəlcə qalığı sıfırlayın (məxaric və ya düzəliş).");
    }
    await tx.material.update({ where: { id }, data: { isActive: active, version: { increment: 1 } } });
    await audit(tx, actor, active ? "ACTIVATE" : "ARCHIVE", "Material", id, `${m.code} ${active ? "aktivləşdirildi" : "arxivləndi"}`);
  });
}

export async function bulkSetActive(actor: Actor, ids: string[], active: boolean) {
  const errors: string[] = [];
  for (const id of ids.slice(0, 500)) {
    try {
      await setMaterialActive(actor, id, active);
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  return { done: ids.length - errors.length, errors };
}

export interface CatalogFilter {
  q?: string;
  categoryId?: string;
  group?: "ENGINEER" | "WORKER" | "BOTH" | "NOT_APPLICABLE";
  active?: "1" | "0" | "all";
  sort?: "code" | "name" | "updated";
  page?: number;
  pageSize?: number;
}

export async function listMaterials(f: CatalogFilter) {
  const pageSize = Math.min(Math.max(f.pageSize ?? 50, 10), 200);
  const page = Math.max(f.page ?? 1, 1);
  const where: Prisma.MaterialWhereInput = {};
  if (f.active !== "all") where.isActive = f.active !== "0";
  if (f.categoryId) where.categoryId = f.categoryId;
  if (f.group === "ENGINEER" || f.group === "WORKER") where.workerGroup = { in: [f.group, "BOTH"] };
  else if (f.group) where.workerGroup = f.group;
  if (f.q?.trim()) {
    const q = f.q.trim().slice(0, 100);
    where.OR = [
      { nameAz: { contains: q, mode: "insensitive" } },
      { nameEn: { contains: q, mode: "insensitive" } },
      { code: { contains: q, mode: "insensitive" } },
      { originalCode: { contains: q, mode: "insensitive" } },
      { model: { contains: q, mode: "insensitive" } },
      { brand: { contains: q, mode: "insensitive" } },
      { variants: { some: { OR: [{ sku: { contains: q, mode: "insensitive" } }, { barcode: q }] } } },
    ];
  }
  const orderBy: Prisma.MaterialOrderByWithRelationInput = f.sort === "name" ? { nameAz: "asc" } : f.sort === "updated" ? { updatedAt: "desc" } : { code: "asc" };
  const [total, rows] = await Promise.all([
    db.material.count({ where }),
    db.material.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { category: true, unit: true, variants: { orderBy: { size: "asc" }, include: { balances: true } } },
    }),
  ]);
  return { total, page, pageSize, rows };
}

/** VariantOption objects for prefilled editors (edit draft documents). */
export async function variantOptionsByIds(ids: string[], warehouseId?: string) {
  const rows = await db.materialVariant.findMany({
    where: { id: { in: ids } },
    include: {
      material: { select: { code: true, nameAz: true, nameEn: true, workerGroup: true, unitCode: true, model: true, unit: { select: { allowsDecimal: true } } } },
      balances: warehouseId ? { where: { warehouseId } } : true,
    },
  });
  return new Map(
    rows.map((v) => {
      const onHand = v.balances.reduce((a, b) => a.plus(b.onHand), D(0));
      const reserved = v.balances.reduce((a, b) => a.plus(b.reserved), D(0));
      return [v.id, { id: v.id, sku: v.sku, size: v.size, color: v.color, name: v.material.nameAz, nameEn: v.material.nameEn, model: v.material.model, materialCode: v.material.code, workerGroup: v.material.workerGroup, unit: v.material.unitCode, allowsDecimal: v.material.unit.allowsDecimal, onHand: onHand.toString(), available: onHand.minus(reserved).toString() }];
    }),
  );
}

/** Fast variant lookup for pickers (trigram-indexed). */
export async function searchVariants(q: string, opts: { warehouseId?: string; onlyInStock?: boolean; group?: string; limit?: number } = {}) {
  const term = q.trim().slice(0, 80);
  const limit = Math.min(opts.limit ?? 20, 50);
  const where: Prisma.MaterialVariantWhereInput = { isActive: true, material: { isActive: true } };
  if (term) {
    where.OR = [
      { sku: { contains: term, mode: "insensitive" } },
      { barcode: term },
      { size: { equals: term, mode: "insensitive" } },
      { material: { OR: [{ nameAz: { contains: term, mode: "insensitive" } }, { nameEn: { contains: term, mode: "insensitive" } }, { code: { contains: term, mode: "insensitive" } }, { model: { contains: term, mode: "insensitive" } }, { originalCode: { contains: term, mode: "insensitive" } }] } },
    ];
  }
  if (opts.group === "ENGINEER" || opts.group === "WORKER") {
    where.material = { isActive: true, workerGroup: { in: [opts.group, "BOTH", "NOT_APPLICABLE"] } };
  }
  if (opts.onlyInStock && opts.warehouseId) where.balances = { some: { warehouseId: opts.warehouseId, onHand: { gt: 0 } } };
  const rows = await db.materialVariant.findMany({
    where,
    take: limit,
    orderBy: [{ material: { nameAz: "asc" } }, { size: "asc" }],
    include: {
      material: { select: { code: true, nameAz: true, nameEn: true, workerGroup: true, unitCode: true, model: true, unit: { select: { allowsDecimal: true } } } },
      balances: opts.warehouseId ? { where: { warehouseId: opts.warehouseId } } : true,
    },
  });
  return rows.map((v) => {
    const onHand = v.balances.reduce((a, b) => a.plus(b.onHand), D(0));
    const reserved = v.balances.reduce((a, b) => a.plus(b.reserved), D(0));
    return {
      id: v.id,
      sku: v.sku,
      size: v.size,
      color: v.color,
      name: v.material.nameAz,
      nameEn: v.material.nameEn,
      model: v.material.model,
      materialCode: v.material.code,
      workerGroup: v.material.workerGroup,
      unit: v.material.unitCode,
      allowsDecimal: v.material.unit.allowsDecimal,
      onHand: onHand.toString(),
      available: onHand.minus(reserved).toString(),
    };
  });
}
