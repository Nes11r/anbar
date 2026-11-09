import { describe, expect, it } from "vitest";
import { can, isLeadership, NO_PROJECT, PERMISSIONS, rolesWith, scopeProjectId, type Permission } from "@/lib/rbac";

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
  it("Worker can only look", () => {
    for (const r of ["EMPLOYEE"] as const) {
      for (const p of ["po.approve", "stockdoc.post", "grn.post", "mr.create", "inventory.approve", "settings.manage", "catalog.manage"] as Permission[]) expect(can(r, p), `${r} ${p}`).toBe(false);
    }
  });
  it("clients no longer use the system: a legacy client account has no permission at all and sees no project", () => {
    for (const p of Object.keys(PERMISSIONS) as Permission[]) expect(can("CLIENT", p), p).toBe(false);
    expect(scopeProjectId({ role: "CLIENT", projectId: "p1" })).toBe(NO_PROJECT);
    expect(scopeProjectId({ role: "WAREHOUSE_MANAGER", projectId: null })).toBe(null);
  });
  it("projects are created / edited and analytics are seen only by Super Admin and Director", () => {
    for (const p of ["project.manage", "report.view"] as Permission[]) {
      expect(rolesWith(p).sort(), p).toEqual(["DIRECTOR", "SUPER_ADMIN"]);
    }
  });
});
