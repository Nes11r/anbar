import { describe, expect, it } from "vitest";
import { can, isLeadership, NO_PROJECT, PERMISSIONS, scopeProjectId, type Permission } from "@/lib/rbac";

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
    }
  });
  it("client sees only their own project — never company-wide data, even before being linked to a project", () => {
    for (const p of ["dashboard.view", "stock.view", "catalog.view", "journal.view", "report.view", "grn.view", "stockdoc.view"] as Permission[]) expect(can("CLIENT", p), p).toBe(false);
    expect(scopeProjectId({ role: "CLIENT", projectId: "p1" })).toBe("p1");
    expect(scopeProjectId({ role: "CLIENT", projectId: null })).toBe(NO_PROJECT);
    expect(scopeProjectId({ role: "WAREHOUSE_MANAGER", projectId: null })).toBe(null);
  });
});
