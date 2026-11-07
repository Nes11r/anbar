import { db } from "@/lib/db";

export async function mrFormOptions() {
  const [projects, warehouses, units] = await Promise.all([
    db.project.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
    db.warehouse.findMany({ where: { isActive: true, type: "NORMAL" }, orderBy: [{ type: "asc" }, { code: "asc" }] }),
    db.unit.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  return {
    projects: projects.map((p) => ({ id: p.id, label: `${p.code} — ${p.name}` })),
    warehouses: warehouses.map((w) => ({ id: w.id, name: w.name })),
    units: units.map((u) => ({ code: u.code, label: `${u.labelEn} (${u.code})` })),
  };
}
