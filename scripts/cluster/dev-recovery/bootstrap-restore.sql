-- Canonical DEV bootstrap role contract for a NEW isolated restore container only.
-- Source: scripts/cluster/provision.sql at d18f635a41f092e9e86aa6f53518f9c28992b0d2.
-- This is not live remediation. Existing roles or user tables cause rejection.
\set ON_ERROR_STOP on
SELECT 1 / ((current_user='uvanoo_dev'
  AND current_database()='beaconhs'
  AND current_setting('server_version_num')='160015'
  AND NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname LIKE 'beaconhs_%')
  AND NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema'))
)::integer) AS fresh_restore_guard \gset

CREATE ROLE beaconhs_owner NOLOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE beaconhs_migrator LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE beaconhs_app LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE beaconhs_super LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS;
CREATE ROLE beaconhs_backup LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS;
GRANT beaconhs_owner TO beaconhs_migrator;

ALTER DATABASE beaconhs OWNER TO beaconhs_owner;
ALTER DATABASE beaconhs SET timezone TO 'UTC';
REVOKE ALL PRIVILEGES ON DATABASE beaconhs FROM PUBLIC;
GRANT CONNECT ON DATABASE beaconhs TO beaconhs_migrator, beaconhs_app, beaconhs_super, beaconhs_backup;

ALTER ROLE beaconhs_backup SET default_transaction_read_only = 'on';
ALTER ROLE beaconhs_migrator SET idle_in_transaction_session_timeout = '5min';
ALTER ROLE beaconhs_app SET idle_in_transaction_session_timeout = '5min';
ALTER ROLE beaconhs_super SET idle_in_transaction_session_timeout = '5min';
ALTER ROLE beaconhs_backup SET idle_in_transaction_session_timeout = '5min';
ALTER ROLE beaconhs_migrator SET tcp_keepalives_idle = '60';
ALTER ROLE beaconhs_app SET tcp_keepalives_idle = '60';
ALTER ROLE beaconhs_super SET tcp_keepalives_idle = '60';
ALTER ROLE beaconhs_backup SET tcp_keepalives_idle = '60';
ALTER ROLE beaconhs_migrator SET tcp_keepalives_interval = '10';
ALTER ROLE beaconhs_app SET tcp_keepalives_interval = '10';
ALTER ROLE beaconhs_super SET tcp_keepalives_interval = '10';
ALTER ROLE beaconhs_backup SET tcp_keepalives_interval = '10';
ALTER ROLE beaconhs_migrator SET tcp_keepalives_count = '6';
ALTER ROLE beaconhs_app SET tcp_keepalives_count = '6';
ALTER ROLE beaconhs_super SET tcp_keepalives_count = '6';
ALTER ROLE beaconhs_backup SET tcp_keepalives_count = '6';
-- Passwords deliberately omitted: no live hashes, no network access, no published
-- ports. Docker-local Unix sockets are used for this isolated restore.
-- Objects, schemas, extensions, RLS and object/default ACLs come from the dump.
-- Never apply broad provision.sql after restoring.
