\set ON_ERROR_STOP on

-- Run only through the guarded production workflow after a restore rehearsal.
-- This phase creates NOLOGIN roles and grants. Credential activation and the
-- Railway DATABASE_URL switch are separate, explicitly approved operations.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'credx_schema_owner') THEN
    CREATE ROLE credx_schema_owner NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'credx_app') THEN
    CREATE ROLE credx_app NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'credx_backup') THEN
    CREATE ROLE credx_backup NOLOGIN;
  END IF;
END
$$;

ALTER ROLE credx_schema_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
ALTER ROLE credx_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
ALTER ROLE credx_backup NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO credx_schema_owner;

DO $$
DECLARE
  object_record record;
BEGIN
  FOR object_record IN
    SELECT format('%I.%I', schemaname, tablename) AS object_name
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE %s OWNER TO credx_schema_owner', object_record.object_name);
  END LOOP;

  FOR object_record IN
    SELECT format('%I.%I', sequence_schema, sequence_name) AS object_name
    FROM information_schema.sequences
    WHERE sequence_schema = 'public'
  LOOP
    EXECUTE format('ALTER SEQUENCE %s OWNER TO credx_schema_owner', object_record.object_name);
  END LOOP;

  FOR object_record IN
    SELECT format('%I.%I', n.nspname, t.typname) AS object_name
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typtype IN ('e', 'd')
  LOOP
    EXECUTE format('ALTER TYPE %s OWNER TO credx_schema_owner', object_record.object_name);
  END LOOP;
END
$$;

DO $$
BEGIN
  EXECUTE format(
    'GRANT CONNECT ON DATABASE %I TO credx_app, credx_backup',
    current_database()
  );
END
$$;
GRANT USAGE ON SCHEMA public TO credx_app, credx_backup;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO credx_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO credx_app;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO credx_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO credx_backup;

ALTER DEFAULT PRIVILEGES FOR ROLE credx_schema_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO credx_app;
ALTER DEFAULT PRIVILEGES FOR ROLE credx_schema_owner IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO credx_app;
ALTER DEFAULT PRIVILEGES FOR ROLE credx_schema_owner IN SCHEMA public
  GRANT SELECT ON TABLES TO credx_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE credx_schema_owner IN SCHEMA public
  GRANT SELECT ON SEQUENCES TO credx_backup;

-- The application and backup identities remain NOLOGIN until a protected
-- production change creates their credentials and switches Railway atomically.
