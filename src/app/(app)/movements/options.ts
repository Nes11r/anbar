import { db } from "@/lib/db";
import { can, isStockRequester, scopeProjectId } from "@/lib/rbac";
import type { UserRole } from "@prisma/client";
import type { StockDocOptions } from "./stockdoc-form";

export async function stockDocOptions(role: UserRole, user?: { role: UserRole; projectId?: string | null }, kind?: string): Promise<StockDocOptions> {
  const scope = user ? scopeProjectId(user) : null;
  const [warehouses, projects, employees, suppliers] = await Promise.all([
    // a site user also sees the office warehouse(s) — only as a place to send leftovers back to
    db.warehouse.findMany({ where: { isActive: true, ...(scope ? { OR: [{ projectId: scope }, { type: "QUARANTINE" }, { projectId: null, type: "NORMAL" }] } : {}) }, orderBy: [{ type: "asc" }, { projectId: { sort: "asc", nulls: "first" } }, { code: "asc" }] }),
    db.project.findMany({ where: { isActive: true, ...(scope ? { id: scope } : {}) }, orderBy: { code: "asc" } }),
    db.employee.findMany({ where: { isActive: true, ...(scope ? { projectId: scope } : {}) }, orderBy: { fullName: "asc" }, take: 3000 }),
    db.supplier.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, take: 1000 }),
  ]);
  return {
    warehouses: warehouses.map((w) => ({ id: w.id, name: w.name, type: w.type, projectId: w.projectId })),
    projects: projects.map((p) => ({ id: p.id, label: `${p.code} — ${p.name}` })),
    employees: employees.map((e) => ({ id: e.id, name: e.fullName, label: `${e.fullName} (${e.code})`, group: e.group, projectId: e.projectId })),
    suppliers: suppliers.map((s) => ({ id: s.id, label: s.name })),
    canOverride: can(role, "issue.override"),
    requestOnly: isStockRequester(role),
    // a site user works from their own site; a project manager may also REQUEST a transfer from the office to the site
    sourceWarehouseIds: scope
      ? warehouses.filter((w) => w.projectId === scope || w.type === "QUARANTINE" || (kind === "TRANSFER" && isStockRequester(role) && !w.projectId && w.type === "NORMAL")).map((w) => w.id)
      : undefined,
  };
}
