-- VyaparNet PostgreSQL initialization
-- This runs BEFORE Prisma migrations
-- Only configure database-level settings here

-- Set timezone to UTC (matches runtime guarantee)
ALTER DATABASE vyaparnet SET timezone TO 'UTC';

-- Note: pg_trgm and unaccent extensions are enabled
-- in the Prisma migration file (0001_init/migration.sql)
-- NOT here, to keep extension management in version control.
