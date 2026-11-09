-- The director may sign the "General Director" and "Project Manager" MR approval steps
UPDATE "approval_step_config" SET "allowedRoles" = array_append("allowedRoles", 'DIRECTOR'::"UserRole")
WHERE "roleCode" IN ('GENERAL_DIRECTOR', 'PROJECT_MANAGER') AND NOT ('DIRECTOR'::"UserRole" = ANY("allowedRoles"));
