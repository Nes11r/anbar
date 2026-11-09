import { withTx, type Tx } from "@/lib/db";
import { AppError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { can, isLeadership, type Permission } from "@/lib/rbac";
import { audit, type Actor } from "../audit";

/**
 * Hard delete — only for records WITHOUT history. Anything that has ever moved stock, appears on a
 * posted document or is referenced elsewhere is refused with an explanation (deactivate instead).
 * The stock ledger and the audit log are never deletable (DB triggers enforce it too).
 * Every delete is written to the audit log with a snapshot of the deleted record.
 */
export type DeletableType =
  | "user" | "warehouse" | "supplier" | "category" | "project" | "employee" | "material" | "variant"
  | "inventoryCount" | "stockDocument" | "goodsReceipt" | "purchaseOrder" | "materialRequest" | "importBatch";

const PERM: Record<DeletableType, Permission> = {
  user: "settings.manage",
  warehouse: "masterdata.manage",
  supplier: "masterdata.manage",
  category: "masterdata.manage",
  project: "project.manage",
  employee: "employee.manage",
  material: "catalog.manage",
  variant: "catalog.manage",
  inventoryCount: "inventory.edit",
  stockDocument: "stockdoc.edit",
  goodsReceipt: "grn.edit",
  purchaseOrder: "po.manage",
  materialRequest: "mr.create",
  importBatch: "import.run",
};

const LABEL: Record<DeletableType, string> = {
  user: "İstifadəçi", warehouse: "Anbar", supplier: "Tədarükçü", category: "Kateqoriya", project: "Layihə", employee: "İşçi",
  material: "Material", variant: "Variant", inventoryCount: "Sayım sənədi", stockDocument: "Sənəd", goodsReceipt: "GRN",
  purchaseOrder: "PO", materialRequest: "MR", importBatch: "Import paketi",
};

function blocked(reasons: string[], hint: string): never {
  throw new AppError(`Silmək olmaz: ${reasons.join("; ")}. ${hint}`, "HAS_HISTORY");
}

function draftOnly(status: string, what: string): void {
  if (status !== "DRAFT" && status !== "CANCELLED") {
    throw new AppError(`Yalnız qaralama və ya ləğv edilmiş ${what} silinə bilər. Təsdiqlənmiş sənəd silinmir — ləğv (reversal) sənədi yaradın.`, "NOT_DRAFT");
  }
}

async function variantUsage(tx: Tx, variantIds: string[]) {
  if (!variantIds.length) return [];
  const w = { variantId: { in: variantIds } };
  const [ledger, docLines, poLines, mrLines, countLines, grnLines, reservations, onHand] = await Promise.all([
    tx.stockLedgerEntry.count({ where: w }),
    tx.stockDocLine.count({ where: w }),
    tx.pOLine.count({ where: w }),
    tx.mRLine.count({ where: w }),
    tx.inventoryCountLine.count({ where: w }),
    tx.gRNLine.count({ where: w }),
    tx.reservation.count({ where: w }),
    tx.stockBalance.count({ where: { ...w, OR: [{ onHand: { gt: 0 } }, { reserved: { gt: 0 } }] } }),
  ]);
  const r: string[] = [];
  if (ledger) r.push(`${ledger} jurnal hərəkəti var`);
  if (onHand) r.push("qalığı var");
  if (docLines) r.push(`${docLines} mədaxil/məxaric sənədində istifadə olunub`);
  if (poLines) r.push(`${poLines} PO sətrində var`);
  if (mrLines) r.push(`${mrLines} MR sətrində var`);
  if (countLines) r.push(`${countLines} sayım sətrində var`);
  if (grnLines) r.push(`${grnLines} GRN sətrində var`);
  if (reservations) r.push(`${reservations} rezervdə var`);
  return r;
}

export async function deleteRecord(actor: Actor, type: DeletableType, id: string): Promise<{ redirect: string; label: string }> {
  if (!PERM[type] || !can(actor.role, PERM[type])) throw new ForbiddenError();
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new NotFoundError(LABEL[type] ?? "Qeyd");

  return withTx(async (tx) => {
    let snapshot: unknown;
    let name = "";
    let redirect = "/";

    switch (type) {
      case "user": {
        const u = await tx.user.findUnique({ where: { id } });
        if (!u) throw new NotFoundError("İstifadəçi");
        if (u.id === actor.id) throw new AppError("Öz hesabınızı silə bilməzsiniz.");
        if (u.role === "SUPER_ADMIN" && u.isActive) {
          const others = await tx.user.count({ where: { role: "SUPER_ADMIN", isActive: true, id: { not: id } } });
          if (!others) throw new AppError("Sistemdə ən azı bir aktiv Super Admin qalmalıdır.");
        }
        const [ledger, docs, mrs, pos, grns, counts, actions] = await Promise.all([
          tx.stockLedgerEntry.count({ where: { userId: id } }),
          tx.stockDocument.count({ where: { OR: [{ createdById: id }, { postedById: id }] } }),
          tx.materialRequest.count({ where: { requesterId: id } }),
          tx.purchaseOrder.count({ where: { OR: [{ createdById: id }, { approvedById: id }] } }),
          tx.goodsReceipt.count({ where: { OR: [{ createdById: id }, { postedById: id }] } }),
          tx.inventoryCount.count({ where: { OR: [{ createdById: id }, { approvedById: id }] } }),
          tx.auditLog.count({ where: { userId: id, action: { notIn: ["LOGIN", "LOGIN_FAILED", "PASSWORD_CHANGE", "REGISTER"] } } }),
        ]);
        const r: string[] = [];
        if (ledger) r.push(`${ledger} jurnal qeydinin müəllifidir`);
        if (docs + mrs + pos + grns + counts) r.push(`${docs + mrs + pos + grns + counts} sənəd yaradıb/təsdiqləyib`);
        else if (actions) r.push(`${actions} audit qeydi var`);
        if (r.length) blocked(r, "Audit izi qorunmalıdır — istifadəçini deaktiv edin (Aktiv işarəsini götürün).");
        snapshot = { email: u.email, name: u.name, role: u.role };
        name = u.email;
        await tx.session.deleteMany({ where: { userId: id } });
        await tx.user.delete({ where: { id } });
        redirect = "/settings/users";
        break;
      }
      case "warehouse": {
        const w = await tx.warehouse.findUnique({ where: { id } });
        if (!w) throw new NotFoundError("Anbar");
        const [ledger, bal, docs, grns, counts, res] = await Promise.all([
          tx.stockLedgerEntry.count({ where: { warehouseId: id } }),
          tx.stockBalance.count({ where: { warehouseId: id, OR: [{ onHand: { gt: 0 } }, { reserved: { gt: 0 } }] } }),
          tx.stockDocument.count({ where: { OR: [{ warehouseId: id }, { toWarehouseId: id }] } }),
          tx.goodsReceipt.count({ where: { warehouseId: id } }),
          tx.inventoryCount.count({ where: { warehouseId: id } }),
          tx.reservation.count({ where: { warehouseId: id } }),
        ]);
        const r: string[] = [];
        if (ledger) r.push(`${ledger} jurnal hərəkəti var`);
        if (bal) r.push("qalığı var");
        if (docs + grns + counts) r.push(`${docs + grns + counts} sənəddə istifadə olunub`);
        if (res) r.push("rezervlər var");
        if (r.length) blocked(r, "Anbarı deaktiv edin.");
        snapshot = w;
        name = w.name;
        await tx.stockBalance.deleteMany({ where: { warehouseId: id } });
        await tx.warehouse.delete({ where: { id } });
        redirect = "/settings/warehouses";
        break;
      }
      case "supplier": {
        const s = await tx.supplier.findUnique({ where: { id }, include: { _count: { select: { materials: true, orders: true } } } });
        if (!s) throw new NotFoundError("Tədarükçü");
        const docs = await tx.stockDocument.count({ where: { supplierId: id } });
        const r: string[] = [];
        if (s._count.orders) r.push(`${s._count.orders} PO var`);
        if (s._count.materials) r.push(`${s._count.materials} material kartında göstərilib`);
        if (docs) r.push(`${docs} qaytarma sənədində var`);
        if (r.length) blocked(r, "Tədarükçünü deaktiv edin.");
        snapshot = s;
        name = s.name;
        await tx.supplier.delete({ where: { id } });
        redirect = "/settings/suppliers";
        break;
      }
      case "category": {
        const c = await tx.category.findUnique({ where: { id }, include: { _count: { select: { materials: true, children: true } } } });
        if (!c) throw new NotFoundError("Kateqoriya");
        const r: string[] = [];
        if (c._count.materials) r.push(`${c._count.materials} material bu kateqoriyadadır`);
        if (c._count.children) r.push("alt kateqoriyaları var");
        if (r.length) blocked(r, "Materialları başqa kateqoriyaya keçirin və ya kateqoriyanı deaktiv edin.");
        snapshot = c;
        name = c.nameAz;
        await tx.category.delete({ where: { id } });
        redirect = "/settings/categories";
        break;
      }
      case "project": {
        const p = await tx.project.findUnique({ where: { id }, include: { _count: { select: { employees: true } } } });
        if (!p) throw new NotFoundError("Layihə");
        const [ledger, mrs, docs, res] = await Promise.all([
          tx.stockLedgerEntry.count({ where: { projectId: id } }),
          tx.materialRequest.count({ where: { projectId: id } }),
          tx.stockDocument.count({ where: { projectId: id } }),
          tx.reservation.count({ where: { projectId: id } }),
        ]);
        const r: string[] = [];
        if (ledger) r.push(`${ledger} material hərəkəti var`);
        if (mrs) r.push(`${mrs} MR var`);
        if (docs) r.push(`${docs} mədaxil/məxaric sənədi var`);
        if (res) r.push("rezervləri var");
        if (p._count.employees) r.push(`${p._count.employees} işçi bu layihəyə bağlıdır`);
        if (r.length) blocked(r, "Layihəni bağlayın (Aktivdir işarəsini götürün).");
        const site = await tx.warehouse.findUnique({ where: { projectId: id } });
        if (site) {
          const [sl, sb, sd, sg, sc, sr] = await Promise.all([
            tx.stockLedgerEntry.count({ where: { warehouseId: site.id } }),
            tx.stockBalance.count({ where: { warehouseId: site.id, OR: [{ onHand: { gt: 0 } }, { reserved: { gt: 0 } }] } }),
            tx.stockDocument.count({ where: { OR: [{ warehouseId: site.id }, { toWarehouseId: site.id }] } }),
            tx.goodsReceipt.count({ where: { warehouseId: site.id } }),
            tx.inventoryCount.count({ where: { warehouseId: site.id } }),
            tx.siteReport.count({ where: { projectId: id } }),
          ]);
          if (sl + sb + sd + sg + sc + sr) blocked(["sahə anbarında hərəkət, sənəd və ya hesabat var"], "Layihəni bağlayın (Aktivdir işarəsini götürün).");
          await tx.stockBalance.deleteMany({ where: { warehouseId: site.id } });
          await tx.warehouse.delete({ where: { id: site.id } });
        }
        await tx.user.updateMany({ where: { projectId: id }, data: { projectId: null } });
        snapshot = p;
        name = `${p.code} — ${p.name}`;
        await tx.project.delete({ where: { id } });
        redirect = "/projects";
        break;
      }
      case "employee": {
        const e = await tx.employee.findUnique({ where: { id } });
        if (!e) throw new NotFoundError("İşçi");
        const [ledger, docs] = await Promise.all([tx.stockLedgerEntry.count({ where: { employeeId: id } }), tx.stockDocument.count({ where: { employeeId: id } })]);
        const r: string[] = [];
        if (ledger) r.push(`${ledger} PPE təhvil/qaytarma hərəkəti var`);
        if (docs) r.push(`${docs} sənəddə göstərilib`);
        if (r.length) blocked(r, "İşçini deaktiv edin.");
        snapshot = e;
        name = `${e.code} — ${e.fullName}`;
        await tx.historicalIssue.updateMany({ where: { employeeId: id }, data: { employeeId: null } });
        await tx.employee.delete({ where: { id } });
        redirect = "/employees";
        break;
      }
      case "material": {
        const m = await tx.material.findUnique({ where: { id }, include: { variants: { select: { id: true, sku: true } } } });
        if (!m) throw new NotFoundError("Material");
        const r = await variantUsage(tx, m.variants.map((v) => v.id));
        if (r.length) blocked(r, "Tarixçəsi olan material silinmir — arxivləyin.");
        snapshot = m;
        name = `${m.code} — ${m.nameAz}`;
        await tx.historicalIssue.updateMany({ where: { variantId: { in: m.variants.map((v) => v.id) } }, data: { variantId: null } });
        await tx.stockBalance.deleteMany({ where: { variantId: { in: m.variants.map((v) => v.id) } } });
        await tx.materialVariant.deleteMany({ where: { materialId: id } });
        await tx.material.delete({ where: { id } });
        redirect = "/catalog";
        break;
      }
      case "variant": {
        const v = await tx.materialVariant.findUnique({ where: { id }, include: { material: { include: { _count: { select: { variants: true } } } } } });
        if (!v) throw new NotFoundError("Variant");
        if (v.material._count.variants <= 1) throw new AppError("Materialın yeganə variantı silinə bilməz — materialı silin və ya arxivləyin.");
        const r = await variantUsage(tx, [id]);
        if (r.length) blocked(r, "Variantı deaktiv edin.");
        snapshot = v;
        name = v.sku;
        await tx.historicalIssue.updateMany({ where: { variantId: id }, data: { variantId: null } });
        await tx.stockBalance.deleteMany({ where: { variantId: id } });
        await tx.materialVariant.delete({ where: { id } });
        redirect = `/catalog/${v.materialId}`;
        break;
      }
      case "inventoryCount": {
        const c = await tx.inventoryCount.findUnique({ where: { id }, include: { _count: { select: { lines: true } } } });
        if (!c) throw new NotFoundError("Sayım sənədi");
        if (c.status !== "DRAFT" && c.status !== "CANCELLED") throw new AppError("Yalnız qaralama və ya ləğv edilmiş sayım silinə bilər. Təsdiqlənmiş sayımın fərqini yeni dövri sayımla düzəldin.", "NOT_DRAFT");
        snapshot = c;
        name = c.number;
        if (c.status === "CANCELLED") await tx.inventoryCount.update({ where: { id }, data: { status: "DRAFT" } });
        await tx.inventoryCountLine.deleteMany({ where: { countId: id } });
        await tx.inventoryCount.delete({ where: { id } });
        redirect = "/inventory";
        break;
      }
      case "stockDocument": {
        const d = await tx.stockDocument.findUnique({ where: { id } });
        if (!d) throw new NotFoundError("Sənəd");
        draftOnly(d.status, "sənəd");
        const posted = await tx.stockLedgerEntry.count({ where: { docId: id } });
        if (posted) throw new AppError("Bu sənədin jurnal qeydləri var — silinə bilməz.", "HAS_HISTORY");
        snapshot = d;
        name = d.number;
        // Lines of a cancelled doc are frozen by a DB trigger; re-open to DRAFT inside this transaction, then remove.
        if (d.status === "CANCELLED") await tx.stockDocument.update({ where: { id }, data: { status: "DRAFT" } });
        await tx.stockDocLine.deleteMany({ where: { docId: id } });
        await tx.stockDocument.delete({ where: { id } });
        redirect = "/movements";
        break;
      }
      case "goodsReceipt": {
        const g = await tx.goodsReceipt.findUnique({ where: { id } });
        if (!g) throw new NotFoundError("GRN");
        draftOnly(g.status, "GRN");
        snapshot = g;
        name = g.grnNumber;
        if (g.status === "CANCELLED") await tx.goodsReceipt.update({ where: { id }, data: { status: "DRAFT" } });
        await tx.gRNLine.deleteMany({ where: { grnId: id } });
        await tx.goodsReceipt.delete({ where: { id } });
        redirect = `/po/${g.poId}`;
        break;
      }
      case "purchaseOrder": {
        const po = await tx.purchaseOrder.findUnique({ where: { id }, include: { _count: { select: { receipts: true } } } });
        if (!po) throw new NotFoundError("PO");
        draftOnly(po.status, "PO");
        if (po._count.receipts) {
          const posted = await tx.goodsReceipt.count({ where: { poId: id, status: { in: ["POSTED", "REVERSED"] } } });
          if (posted) throw new AppError("Bu PO üzrə mal qəbulu tarixçəsi var — silinə bilməz.", "HAS_HISTORY");
          for (const g of await tx.goodsReceipt.findMany({ where: { poId: id } })) {
            if (g.status === "CANCELLED") await tx.goodsReceipt.update({ where: { id: g.id }, data: { status: "DRAFT" } });
            await tx.gRNLine.deleteMany({ where: { grnId: g.id } });
            await tx.goodsReceipt.delete({ where: { id: g.id } });
          }
        }
        snapshot = po;
        name = po.poNumber;
        await tx.purchaseOrder.delete({ where: { id } }); // lines cascade
        redirect = "/po";
        break;
      }
      case "materialRequest": {
        const mr = await tx.materialRequest.findUnique({ where: { id }, include: { _count: { select: { orders: true } } } });
        if (!mr) throw new NotFoundError("MR");
        if (mr.requesterId !== actor.id && !isLeadership(actor.role)) throw new ForbiddenError("MR-i yalnız onu yaradan və ya rəhbərlik silə bilər.");
        if (mr.status !== "DRAFT" && mr.status !== "CANCELLED") throw new AppError("Yalnız qaralama və ya ləğv edilmiş MR silinə bilər. Təsdiq prosesinə düşmüş MR-i ləğv edin.", "NOT_DRAFT");
        if (mr._count.orders) throw new AppError("Bu MR-ə bağlı PO var — silinə bilməz.", "HAS_HISTORY");
        snapshot = mr;
        name = `${mr.mrNumber} Rev.${mr.revision}`;
        await tx.materialRequest.delete({ where: { id } }); // lines + approvals cascade
        redirect = "/mr";
        break;
      }
      case "importBatch": {
        const b = await tx.importBatch.findUnique({ where: { id } });
        if (!b) throw new NotFoundError("Import paketi");
        if (b.status === "COMMITTED") throw new AppError("Təsdiqlənmiş import silinmir — əvvəlcə “Geri qaytar” edin.", "NOT_DRAFT");
        snapshot = { fileName: b.fileName, sheetName: b.sheetName, dataType: b.dataType, status: b.status };
        name = b.fileName;
        await tx.importBatch.delete({ where: { id } }); // rows cascade
        redirect = "/import";
        break;
      }
      default:
        throw new AppError("Naməlum qeyd növü.");
    }

    await audit(tx, actor, "DELETE", type, id, `${LABEL[type]} silindi: ${name}`, snapshot);
    return { redirect, label: `${LABEL[type]} silindi: ${name}` };
  });
}
