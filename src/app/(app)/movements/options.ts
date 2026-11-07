import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import type { UserRole } from "@prisma/client";
import type { StockDocOptions } from "./stockdoc-form";

export async function stockDocOptions(role: UserRole): Promise<StockDocOptions> {
  const [warehouses, projects, employees, suppliers] = await Promise.all([
    db.warehouse.findMany({ where: { isActive: true }, orderBy: [{ type: "asc" }, { code: "asc" }] }),
    db.project.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
    db.employee.findMany({ where: { isActive: true }, orderBy: { fullName: "asc" }, take: 3000 }),
    db.supplier.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, take: 1000 }),
  ]);
  return {
    warehouses: warehouses.map((w) => ({ id: w.id, name: w.name, type: w.type })),
    projects: projects.map((p) => ({ id: p.id, label: `${p.code} — ${p.name}` })),
    employees: employees.map((e) => ({ id: e.id, label: `${e.fullName} (${e.code})`, group: e.group, projectId: e.projectId })),
    suppliers: suppliers.map((s) => ({ id: s.id, label: s.name })),
    canOverride: can(role, "issue.override"),
  };
}
