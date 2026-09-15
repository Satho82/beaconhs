-- Fresh isolated staging PostgreSQL 16 ONLY. See README.md.
-- Adapted from scripts/cluster/provision.sql; passwords are environment parameters.
-- No production role names, hard-coded passwords, or automatic container init mount.
\set ON_ERROR_STOP on
\getenv confirmation STAGING_PROVISION_CONFIRM
\getenv app_password STAGING_APP_PASSWORD
\getenv super_password STAGING_SUPER_PASSWORD
\getenv migrator_password STAGING_MIGRATOR_PASSWORD
\getenv backup_password STAGING_BACKUP_PASSWORD
SELECT current_database() = 'postgres'
  AND session_user = 'uvanoo_staging_bootstrap'
  AND current_setting('server_version_num')::int BETWEEN 160000 AND 169999
  AND :'confirmation' = 'PROVISION_FRESH_UVANOO_STAGING_ONLY'
  AND NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'uvanoo_staging')
  AND NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN
    ('uvanoo_staging_owner', 'uvanoo_staging_migrator', 'uvanoo_staging_app',
     'uvanoo_staging_super', 'uvanoo_staging_backup'))
  AND length(:'app_password') >= 32 AND :'app_password' NOT LIKE 'FAKE%'
  AND length(:'super_password') >= 32 AND :'super_password' NOT LIKE 'FAKE%'
  AND length(:'migrator_password') >= 32 AND :'migrator_password' NOT LIKE 'FAKE%'
  AND length(:'backup_password') >= 32 AND :'backup_password' NOT LIKE 'FAKE%'
  AND (SELECT count(DISTINCT value) = 4 FROM
    (VALUES (:'app_password'), (:'super_password'), (:'migrator_password'),
            (:'backup_password')) AS passwords(value)) AS safe_to_provision
\gset
\if :safe_to_provision
\else
  \echo 'Refusing: wrong target, existing roles/database, or invalid staging inputs.'
  \quit 3
\endif

SELECT 'CREATE ROLE uvanoo_staging_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'uvanoo_staging_owner')
\gexec
ALTER ROLE uvanoo_staging_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

SELECT format(
  'CREATE ROLE uvanoo_staging_migrator LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
  :'migrator_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'uvanoo_staging_migrator')
\gexec
ALTER ROLE uvanoo_staging_migrator LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
SELECT format('ALTER ROLE uvanoo_staging_migrator PASSWORD %L', :'migrator_password') \gexec

SELECT format(
  'CREATE ROLE uvanoo_staging_app LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
  :'app_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'uvanoo_staging_app')
\gexec
ALTER ROLE uvanoo_staging_app LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
SELECT format('ALTER ROLE uvanoo_staging_app PASSWORD %L', :'app_password') \gexec

SELECT format(
  'CREATE ROLE uvanoo_staging_super LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS PASSWORD %L',
  :'super_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'uvanoo_staging_super')
\gexec
ALTER ROLE uvanoo_staging_super LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS;
SELECT format('ALTER ROLE uvanoo_staging_super PASSWORD %L', :'super_password') \gexec

SELECT format(
  'CREATE ROLE uvanoo_staging_backup LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS PASSWORD %L',
  :'backup_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'uvanoo_staging_backup')
\gexec
ALTER ROLE uvanoo_staging_backup LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS;
SELECT format('ALTER ROLE uvanoo_staging_backup PASSWORD %L', :'backup_password') \gexec

-- The migrator must opt into ownership explicitly. Runtime roles must never be
-- owner members; remove the old super -> app membership during upgrades.
SELECT 'GRANT uvanoo_staging_owner TO uvanoo_staging_migrator'
WHERE NOT pg_has_role('uvanoo_staging_migrator', 'uvanoo_staging_owner', 'MEMBER')
\gexec
SELECT format('REVOKE %I FROM %I', parent.rolname, member.rolname)
FROM pg_auth_members membership
JOIN pg_roles parent ON parent.oid = membership.roleid
JOIN pg_roles member ON member.oid = membership.member
WHERE (
    parent.rolname = 'uvanoo_staging_owner'
    AND member.rolname IN ('uvanoo_staging_app', 'uvanoo_staging_super', 'uvanoo_staging_backup')
  )
   OR (
     parent.rolname = 'uvanoo_staging_app'
     AND member.rolname IN ('uvanoo_staging_super', 'uvanoo_staging_backup')
   )
\gexec

SELECT 'CREATE DATABASE uvanoo_staging OWNER uvanoo_staging_owner'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'uvanoo_staging')
\gexec
ALTER DATABASE uvanoo_staging OWNER TO uvanoo_staging_owner;
ALTER DATABASE uvanoo_staging SET timezone TO 'UTC';

REVOKE ALL PRIVILEGES ON DATABASE uvanoo_staging FROM PUBLIC;
GRANT CONNECT ON DATABASE uvanoo_staging TO uvanoo_staging_migrator, uvanoo_staging_app, uvanoo_staging_super, uvanoo_staging_backup;

\connect uvanoo_staging

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Existing installations used uvanoo_staging_app as owner. Transfer every object in
-- this database before reducing the app login to DML-only privileges.
REASSIGN OWNED BY uvanoo_staging_app TO uvanoo_staging_owner;
ALTER SCHEMA public OWNER TO uvanoo_staging_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC, uvanoo_staging_app, uvanoo_staging_super;
GRANT USAGE ON SCHEMA public TO uvanoo_staging_app, uvanoo_staging_super, uvanoo_staging_backup;

-- Private ETL bookkeeping is intentionally isolated from runtime traffic. The
-- BYPASSRLS maintenance login may create and maintain only this schema.
CREATE SCHEMA IF NOT EXISTS etl AUTHORIZATION uvanoo_staging_owner;
ALTER SCHEMA etl OWNER TO uvanoo_staging_owner;
REVOKE ALL ON SCHEMA etl FROM PUBLIC, uvanoo_staging_app;
GRANT USAGE, CREATE ON SCHEMA etl TO uvanoo_staging_super;
GRANT USAGE ON SCHEMA etl TO uvanoo_staging_backup;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM uvanoo_staging_app, uvanoo_staging_super;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO uvanoo_staging_app, uvanoo_staging_super;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM uvanoo_staging_app, uvanoo_staging_super;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO uvanoo_staging_app, uvanoo_staging_super;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO uvanoo_staging_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO uvanoo_staging_backup;

-- The migration tracker schema exists only after the first migration run.
SELECT 'GRANT USAGE ON SCHEMA drizzle TO uvanoo_staging_backup'
WHERE to_regnamespace('drizzle') IS NOT NULL
\gexec
SELECT 'GRANT SELECT ON ALL TABLES IN SCHEMA drizzle TO uvanoo_staging_backup'
WHERE to_regnamespace('drizzle') IS NOT NULL
\gexec
SELECT 'GRANT SELECT ON ALL SEQUENCES IN SCHEMA drizzle TO uvanoo_staging_backup'
WHERE to_regnamespace('drizzle') IS NOT NULL
\gexec

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA etl TO uvanoo_staging_super;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA etl TO uvanoo_staging_super;
GRANT SELECT ON ALL TABLES IN SCHEMA etl TO uvanoo_staging_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA etl TO uvanoo_staging_backup;

ALTER DEFAULT PRIVILEGES FOR ROLE uvanoo_staging_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO uvanoo_staging_app, uvanoo_staging_super;
ALTER DEFAULT PRIVILEGES FOR ROLE uvanoo_staging_owner IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO uvanoo_staging_app, uvanoo_staging_super;
ALTER DEFAULT PRIVILEGES FOR ROLE uvanoo_staging_owner IN SCHEMA public
  GRANT SELECT ON TABLES TO uvanoo_staging_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE uvanoo_staging_owner IN SCHEMA public
  GRANT SELECT ON SEQUENCES TO uvanoo_staging_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE uvanoo_staging_owner IN SCHEMA etl
  GRANT ALL PRIVILEGES ON TABLES TO uvanoo_staging_super;
ALTER DEFAULT PRIVILEGES FOR ROLE uvanoo_staging_owner IN SCHEMA etl
  GRANT ALL PRIVILEGES ON SEQUENCES TO uvanoo_staging_super;
ALTER DEFAULT PRIVILEGES FOR ROLE uvanoo_staging_super IN SCHEMA etl
  GRANT ALL PRIVILEGES ON TABLES TO uvanoo_staging_super;
ALTER DEFAULT PRIVILEGES FOR ROLE uvanoo_staging_super IN SCHEMA etl
  GRANT ALL PRIVILEGES ON SEQUENCES TO uvanoo_staging_super;
ALTER DEFAULT PRIVILEGES FOR ROLE uvanoo_staging_owner IN SCHEMA etl
  GRANT SELECT ON TABLES TO uvanoo_staging_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE uvanoo_staging_owner IN SCHEMA etl
  GRANT SELECT ON SEQUENCES TO uvanoo_staging_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE uvanoo_staging_super IN SCHEMA etl
  GRANT SELECT ON TABLES TO uvanoo_staging_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE uvanoo_staging_super IN SCHEMA etl
  GRANT SELECT ON SEQUENCES TO uvanoo_staging_backup;

-- Connection hygiene applies equally to the three login roles.
ALTER ROLE uvanoo_staging_migrator SET idle_in_transaction_session_timeout = '5min';
ALTER ROLE uvanoo_staging_app SET idle_in_transaction_session_timeout = '5min';
ALTER ROLE uvanoo_staging_super SET idle_in_transaction_session_timeout = '5min';
ALTER ROLE uvanoo_staging_backup SET default_transaction_read_only = 'on';
ALTER ROLE uvanoo_staging_backup SET idle_in_transaction_session_timeout = '5min';
ALTER ROLE uvanoo_staging_migrator SET tcp_keepalives_idle = '60';
ALTER ROLE uvanoo_staging_app SET tcp_keepalives_idle = '60';
ALTER ROLE uvanoo_staging_super SET tcp_keepalives_idle = '60';
ALTER ROLE uvanoo_staging_backup SET tcp_keepalives_idle = '60';
ALTER ROLE uvanoo_staging_migrator SET tcp_keepalives_interval = '10';
ALTER ROLE uvanoo_staging_app SET tcp_keepalives_interval = '10';
ALTER ROLE uvanoo_staging_super SET tcp_keepalives_interval = '10';
ALTER ROLE uvanoo_staging_backup SET tcp_keepalives_interval = '10';
ALTER ROLE uvanoo_staging_migrator SET tcp_keepalives_count = '6';
ALTER ROLE uvanoo_staging_app SET tcp_keepalives_count = '6';
ALTER ROLE uvanoo_staging_super SET tcp_keepalives_count = '6';
ALTER ROLE uvanoo_staging_backup SET tcp_keepalives_count = '6';
