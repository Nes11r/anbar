import type { UserRole } from "@prisma/client";

/**
 * Permission matrix. Checked on the server for every action and every page;
 * the menu only hides what the user cannot use anyway.
 */
export const PERMISSIONS = {
  "dashboard.view": ["SUPER_ADMIN", "WAREHOUSE_MANAGER", "STOREKEEPER", "PROCUREMENT", "PROJECT_MANAGER", "AUDITOR"],
  "catalog.view": ["SUPER_ADMIN", "WAREHOUSE_MANAGER", "STOREKEEPER", "PROCUREMENT", "PROJECT_MANAGER", "AUDITOR"],
  "catalog.manage": ["SUPER_ADMIN", "WAREHOUSE_MANAGER"],
  "stock.view": ["SUPER_ADMIN", "WAREHOUSE_MANAGER", "STOREKEEPER", "PROCUREMENT", "PROJECT_MANAGER", "AUDITOR"],
  "reservation.manage": ["SUPER_ADMIN", "WAREHOUSE_MANAGER", "STOREKEEPER"],
  "inventory.edit": ["SUPER_ADMIN", "WAREHOUSE_MANAGER", "STOREKEEPER"],
  "inventory.approve": ["SUPER_ADMIN", "WAREHOUSE_MANAGER"],
  "mr.view": ["SUPER_ADMIN", "WAREHOUSE_MANAGER", "STOREKEEPER", "PROCUREMENT", "PROJECT_MANAGER", "AUDITOR"],
  "mr.create": ["SUPER_ADMIN", "WAREHOUSE_MANAGER", "STOREKEEPER", "PROCUREMENT", "PROJECT_MANAGER"],
  "po.view": ["SUPER_ADMIN", "WAREHOUSE_MANAGER", "STOREKEEPER", "PROCUREMENT", "PROJECT_MANAGER", "AUDITOR"],
  "po.manage": ["SUPER_ADMIN", "PROCUREMENT"],
  "po.approve": ["SUPER_ADMIN", "PROCUREMENT"],
  /** Create a PO from a not-yet-approved MR / without MR. Always audited with a reason. */
  "po.override": ["SUPER_ADMIN"],
  "grn.view": ["SUPER_ADMIN", "WAREHOUSE_MANAGER", "STOREKEEPER", "PROCUREMENT", "AUDITOR"],
  "grn.edit": ["SUPER_ADMIN", "WAREHOUSE_MANAGER", "STOREKEEPER"],
  "grn.post": ["SUPER_ADMIN", "WAREHOUSE_MANAGER", "STOREKEEPER"],
  "stockdoc.view": ["SUPER_ADMIN", "WAREHOUSE_MANAGER", "STOREKEEPER", "PROJECT_MANAGER", "AUDITOR"],
  "stockdoc.edit": ["SUPER_ADMIN", "WAREHOUSE_MANAGER", "STOREKEEPER"],
  "stockdoc.post": ["SUPER_ADMIN", "WAREHOUSE_MANAGER", "STOREKEEPER"],
  "adjustment.post": ["SUPER_ADMIN", "WAREHOUSE_MANAGER"],
  "document.reverse": ["SUPER_ADMIN", "WAREHOUSE_MANAGER"],
  /** Issue PPE to an employee whose group does not match the material (reason required) */
  "issue.override": ["SUPER_ADMIN", "WAREHOUSE_MANAGER"],
  "project.view": ["SUPER_ADMIN", "WAREHOUSE_MANAGER", "STOREKEEPER", "PROCUREMENT", "PROJECT_MANAGER", "AUDITOR"],
  "project.manage": ["SUPER_ADMIN", "WAREHOUSE_MANAGER", "PROJECT_MANAGER"],
  "employee.view": ["SUPER_ADMIN", "WAREHOUSE_MANAGER", "STOREKEEPER", "PROJECT_MANAGER", "AUDITOR"],
  "employee.manage": ["SUPER_ADMIN", "WAREHOUSE_MANAGER"],
  "report.view": ["SUPER_ADMIN", "WAREHOUSE_MANAGER", "STOREKEEPER", "PROCUREMENT", "PROJECT_MANAGER", "AUDITOR"],
  "import.run": ["SUPER_ADMIN", "WAREHOUSE_MANAGER"],
  "audit.view": ["SUPER_ADMIN", "WAREHOUSE_MANAGER", "AUDITOR"],
  "settings.manage": ["SUPER_ADMIN"],
  "masterdata.manage": ["SUPER_ADMIN", "WAREHOUSE_MANAGER"],
} as const satisfies Record<string, readonly UserRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: UserRole | null | undefined, perm: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[perm] as readonly UserRole[]).includes(role);
}
