import { db } from "@/lib/db";

export async function materialFormOptions() {
  const [categories, units, suppliers] = await Promise.all([
    db.category.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { nameAz: "asc" }] }),
    db.unit.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.supplier.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, take: 500 }),
  ]);
  return {
    categories: categories.map((c) => ({ id: c.id, label: c.nameAz, isUniform: c.isUniform })),
    units: units.map((u) => ({ code: u.code, label: u.labelAz })),
    suppliers: suppliers.map((s) => ({ id: s.id, label: s.name })),
  };
}
