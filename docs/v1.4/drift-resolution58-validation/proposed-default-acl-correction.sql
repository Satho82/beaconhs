-- PROPOSAL ONLY. No authorization for live execution.
-- Require approved DEV profile, exact before-fingerprint, encrypted backup/restore,
-- writer fence and canonical migration lock. Execute both in one transaction.
-- Matches historical prepareMigrationPrivileges; existing object ACLs untouched.
ALTER DEFAULT PRIVILEGES FOR ROLE beaconhs_owner IN SCHEMA public
  REVOKE ALL ON TABLES FROM beaconhs_app, beaconhs_super, beaconhs_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE beaconhs_owner IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM beaconhs_app, beaconhs_super, beaconhs_backup;
