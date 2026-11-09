-- Company head role, separate from the technical Super Admin
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'DIRECTOR' AFTER 'SUPER_ADMIN';
