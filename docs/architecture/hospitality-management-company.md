# Hospitality management-company and property model

## Decision

A tenant is the customer/workspace and the PostgreSQL RLS boundary. For hotel groups, the
tenant represents the hotel management company. No additional organisation table is needed.

```
Tenant / management company
  -> hospitality_properties
    -> hospitality_buildings
      -> hospitality_floors
        -> hospitality_rooms
```

For the V1.1 demo, the tenant is **Cycas Hospitality**. Its properties are **One Fifty
Fenchurch** and **The Lincoln Suites**. Cycas Hospitality must never be inserted into
`hospitality_properties`.

## Identity and access

A global `user` has one `tenant_users` membership in the Cycas tenant and at most one
linked `people` identity there. Multiple hotel assignments therefore do not duplicate
accounts or people.

A role assignment may be tenant-wide or property-scoped. A property scope contains a set
of hospitality property IDs in the same tenant. Tenant-wide scope means all current and
future properties. Property-scoped authorization is enforced in server queries and
mutations; filtering navigation alone is insufficient.

Construction `sites` scopes remain unchanged. Hospitality property scope is distinct
because hospitality properties are first-class records and are not construction org units.
Tenant RLS remains the outer boundary, and property checks only narrow access within it.

## Demo mapping

- Tenant: Cycas Hospitality
- Property: One Fifty Fenchurch
- Property: The Lincoln Suites
- Cluster General Manager: one identity, both property IDs
- Hotel managers and Front Office staff: only their assigned property ID
- Super Admin: tenant-wide access and permission to assign one, multiple, or all properties
