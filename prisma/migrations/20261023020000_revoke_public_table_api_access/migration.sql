-- Application tables are accessed through Prisma as postgres, not the Supabase Data API.
-- Keep API roles away from existing public tables, including _prisma_migrations.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public
FROM anon, authenticated, service_role;

-- Prisma migrations create future public tables as postgres.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
REVOKE ALL ON TABLES FROM anon, authenticated, service_role;
