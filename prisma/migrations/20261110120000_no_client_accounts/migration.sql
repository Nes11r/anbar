-- Clients no longer log in: the client is only a name on the project. Disable any existing client accounts.
UPDATE "users" SET "isActive" = false WHERE "role" = 'CLIENT';
