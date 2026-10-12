-- REVIEWED READ-ONLY EVIDENCE QUERY; NOT EXECUTED ON DEV.
-- Run only through a separately authorized read-only connection to beaconhs.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT current_database() AS database_name,
       (SELECT oid FROM pg_database WHERE datname=current_database()) AS database_oid,
       current_setting('server_version_num') AS postgres_version,
       current_user AS inspection_role;
SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id;
SELECT rolname, rolcanlogin, rolsuper, rolbypassrls, rolinherit, rolcreatedb, rolcreaterole, rolconfig
FROM pg_roles WHERE rolname LIKE 'beaconhs_%' OR rolname='uvanoo_dev' ORDER BY rolname;
SELECT parent.rolname AS granted_role, member.rolname AS member, m.admin_option
FROM pg_auth_members m
JOIN pg_roles parent ON parent.oid=m.roleid
JOIN pg_roles member ON member.oid=m.member
WHERE parent.rolname LIKE 'beaconhs_%' OR member.rolname LIKE 'beaconhs_%'
ORDER BY parent.rolname, member.rolname;
SELECT datname, pg_get_userbyid(datdba) AS owner, datacl FROM pg_database WHERE datname=current_database();
SELECT nspname, pg_get_userbyid(nspowner) AS owner, nspacl
FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname<>'information_schema' ORDER BY nspname;
SELECT n.nspname, c.relname, c.relkind, pg_get_userbyid(c.relowner) AS owner,
       c.relrowsecurity, c.relforcerowsecurity, c.relacl
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'
ORDER BY n.nspname,c.relname;
SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
FROM pg_policies ORDER BY schemaname,tablename,policyname;
SELECT table_schema,table_name,column_name,grantee,privilege_type,is_grantable
FROM information_schema.column_privileges
WHERE table_schema NOT IN ('pg_catalog','information_schema')
ORDER BY table_schema,table_name,column_name,grantee,privilege_type;
SELECT pg_get_userbyid(defaclrole) AS role, n.nspname, defaclobjtype, defaclacl
FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
ORDER BY role,n.nspname,defaclobjtype;
SELECT n.nspname,c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE NOT t.tgisinternal AND n.nspname NOT LIKE 'pg_%' ORDER BY n.nspname,c.relname,t.tgname;
SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,
       pg_get_userbyid(p.proowner) AS owner,p.prosecdef,p.proacl,p.proconfig,
       md5(pg_get_functiondef(p.oid)) AS definition_digest
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' AND p.prokind IN ('f','p')
ORDER BY n.nspname,p.proname,arguments;
SELECT extname,extversion FROM pg_extension ORDER BY extname;
COMMIT;
