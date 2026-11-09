import { describe, expect, it } from "vitest";
import { can, isLeadership, PERMISSIONS, type Permission } from "@/lib/rbac";

describe("roles", () => {
  it("Director has every business permission of Super Admin, but no system administration", () => {
    for (const perm of Object.keys(PERMISSIONS) as Permission[]) {
      if (perm === "settings.manage") continue;
      if (can("SUPER_ADMIN", perm)) expect(can("DIRECTOR", perm), perm).toBe(true);
    }
    expect(can("DIRECTOR", "settings.manage")).toBe(false);
    expect(can("SUPER_ADMIN", "settings.manage")).toBe(true);
    expect(can("DIRECTOR", "po.approve")).toBe(true);
    expect(can("DIRECTOR", "document.reverse")).toBe(true);
    expect(isLeadership("DIRECTOR")).toBe(true);
    expect(isLeadership("WAREHOUSE_MANAGER")).toBe(false);
  });
  it("Worker and client can only look", () => {
    for (const r of ["EMPLOYEE", "CLIENT"] as const) {
      for (const p of ["po.approve", "stockdoc.post", "grn.post", "mr.create", "inventory.approve", "settings.manage", "catalog.manage"] as Permission[]) expect(can(r, p), `${r} ${p}`).toBe(false);
      expect(can(r, "stock.view")).toBe(true);
    }
  });
});
