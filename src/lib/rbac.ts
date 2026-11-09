import type { UserRole } from "@prisma/client";

/**
 * Permission matrix. Checked on the server for every action and every page;
 * the menu only hides what the user cannot use anyway.
 */
export const PERMISSIONS = {
  "dashboard.view": ["SUPER_ADMIN", "DIRECTOR", "WAREHOUSE_MANAGER", "STOREKEEPER", "PROCUREMENT", "PROJECT_MANAGER", "AUDITOR", "EMPLOYEE", "CLIENT"],
  "catalog.view": ["SUPER_ADMIN", "DIRECTOR", "WAREHOUSE_MANAGER", "STOREKEEPER", "PROCUREMENT", "PROJECT_MANAGER", "AUDITOR", "EMPLOYEE", "CLIENT"],
  "catalog.manage": ["SUPER_ADMIN", "DIRECTOR", "WAREHOUSE_MANAGER"],
  "stock.view": ["SUPER_ADMIN", "DIRECTOR", "WAREHOUSE_MANAGER", "STOREKEEPER", "PROCUREMENT", "PROJECT_MANAGER", "AUDITOR", "EMPLOYEE", "CLIENT"],
  "reservation.manage": ["SUPER_ADMIN", "DIRECTOR", "WAREHOUSE_MANAGER", "STOREKEEPER"],
  "inventory.edit": ["SUPER_ADMIN", "DIRECTOR", "WAREHOUSE_MANAGER", "STOREKEEPER"],
  "inventory.approve": ["SUPER_ADMIN", "DIRECTOR", "WAREHOUSE_MANAGER"],
  "mr.view": ["SUPER_ADMIN", "DIRECTOR", "WAREHOUSE_MANAGER", "STOREKEEPER", "PROCUREMENT", "PROJECT_MANAGER", "AUDITOR", "CLIENT"],
  "mr.create": ["SUPER_ADMIN", "DIRECTOR", "WAREHOUSE_MANAGER", "STOREKEEPER", "PROCUREMENT", "PROJECT_MANAGER"],
  "po.view": ["SUPER_ADMIN", "DIRECTOR", "WAREHOUSE_MANAGER", "STOREKEEPER", "PROCUREMENT", "PROJECT_MANAGER", "AUDITOR", "CLIENT"],
  "po.manage": ["SUPER_ADMIN", "DIRECTOR", "PROCUREMENT"],
  "po.approve": ["SUPER_ADMIN", "DIRECTOR", "PROCUREMENT"],
  /** Create a PO from a not-yet-approved MR / without MR. Always audited with a reason. */
  "po.override": ["SUPER_ADMIN", "DIRECTOR"],
  "grn.view": ["SUPER_ADMIN", "DIRECTOR", "WAREHOUSE_MANAGER", "STOREKEEPER", "PROCUREMENT", "AUDITOR"],
  "grn.edit": ["SUPER_ADMIN", "DIRECTOR", "WAREHOUSE_MANAGER", "STOREKEEPER"],
  "grn.post": ["SUPER_ADMIN", "DIRECTOR", "WAREHOUSE_MANAGER", "STOREKEEPER"],
  "stockdoc.view": ["SUPER_ADMIN", "DIRECTOR", "WAREHOUSE_MANAGER", "STOREKEEPER", "PROJECT_MANAGER", "AUDITOR"],
  "stockdoc.edit": ["SUPER_ADMIN", "DIRECTOR", "WAREHOUSE_MANAGER", "STOREKEEPER"],
  "stockdoc.post": ["SUPER_ADMIN", "DIRECTOR", "WAREHOUSE_MANAGER", "STOREKEEPER"],
  "adjustment.post": ["SUPER_ADMIN", "DIRECTOR", "WAREHOUSE_MANAGER"],
  "document.reverse": ["SUPER_ADMIN", "DIRECTOR", "WAREHOUSE_MANAGER"],
  /** Issue PPE to an employee whose group does not match the material (reason required) */
  "issue.override": ["SUPER_ADMIN", "DIRECTOR", "WAREHOUSE_MANAGER"],
  "project.view": ["SUPER_ADMIN", "DIRECTOR", "WAREHOUSE_MANAGER", "STOREKEEPER", "PROCUREMENT", "PROJECT_MANAGER", "AUDITOR", "CLIENT"],
  "project.manage": ["SUPER_ADMIN", "DIRECTOR", "WAREHOUSE_MANAGER", "PROJECT_MANAGER"],
  "employee.view": ["SUPER_ADMIN", "DIRECTOR", "WAREHOUSE_MANAGER", "STOREKEEPER", "PROJECT_MANAGER", "AUDITOR"],
  "employee.manage": ["SUPER_ADMIN", "DIRECTOR", "WAREHOUSE_MANAGER"],
  "report.view": ["SUPER_ADMIN", "DIRECTOR", "WAREHOUSE_MANAGER", "STOREKEEPER", "PROCUREMENT", "PROJECT_MANAGER", "AUDITOR"],
  "import.run": ["SUPER_ADMIN", "DIRECTOR", "WAREHOUSE_MANAGER"],
  "audit.view": ["SUPER_ADMIN", "DIRECTOR", "WAREHOUSE_MANAGER", "AUDITOR"],
  "settings.manage": ["SUPER_ADMIN"],
  "masterdata.manage": ["SUPER_ADMIN", "DIRECTOR", "WAREHOUSE_MANAGER"],
  /** Site (project) warehouses: overview of site stock vs. items with workers */
  "site.view": ["SUPER_ADMIN", "DIRECTOR", "WAREHOUSE_MANAGER", "STOREKEEPER", "PROCUREMENT", "PROJECT_MANAGER", "AUDITOR", "CLIENT"],
  /** Enter the daily site report (stock / with workers) */
  "site.report": ["SUPER_ADMIN", "DIRECTOR", "WAREHOUSE_MANAGER", "STOREKEEPER", "PROJECT_MANAGER"],
  /** Record payment / shipment progress of purchase orders */
  "po.payment": ["SUPER_ADMIN", "DIRECTOR", "PROCUREMENT"],
  /** Employee self-service: own items */
  "my.items": ["EMPLOYEE"],
} as const satisfies Record<string, readonly UserRole[]>;

export type Permission = keyof typeof PERMISSIONS;

/** Roles that can be limited to a single project (User.projectId). */
export const SCOPABLE_ROLES: readonly UserRole[] = ["STOREKEEPER", "PROJECT_MANAGER", "EMPLOYEE", "CLIENT"];

/** Company leadership: may sign any approval step and act on any requester's MR. */
export function isLeadership(role: UserRole | null | undefined): boolean {
  return role === "SUPER_ADMIN" || role === "DIRECTOR";
}

/** Project the user is limited to, or null = all projects. */
export function scopeProjectId(u: { role: UserRole; projectId?: string | null }): string | null {
  return u.projectId && SCOPABLE_ROLES.includes(u.role) ? u.projectId : null;
}

export function can(role: UserRole | null | undefined, perm: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[perm] as readonly UserRole[]).includes(role);
}
