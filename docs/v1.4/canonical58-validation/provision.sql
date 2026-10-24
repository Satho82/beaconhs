CREATE ROLE beaconhs_owner NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE beaconhs_migrator LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS PASSWORD 'beaconhs_migrator';
CREATE ROLE beaconhs_app LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS PASSWORD 'beaconhs_app';
CREATE ROLE beaconhs_super LOGIN NOINHERIT NOSUPERUSER BYPASSRLS PASSWORD 'beaconhs_super';
CREATE ROLE beaconhs_backup LOGIN NOINHERIT NOSUPERUSER BYPASSRLS PASSWORD 'beaconhs_backup';
ALTER ROLE beaconhs_backup SET default_transaction_read_only = 'on';
GRANT beaconhs_owner TO beaconhs_migrator;
ALTER DATABASE beaconhs OWNER TO beaconhs_owner;
REVOKE ALL ON DATABASE beaconhs FROM PUBLIC;
GRANT CONNECT ON DATABASE beaconhs TO beaconhs_migrator, beaconhs_app, beaconhs_super, beaconhs_backup;
\connect beaconhs
ALTER SCHEMA public OWNER TO beaconhs_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
