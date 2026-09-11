# ADR 0001: Uvanoo hospitality MVP domain boundaries

**Status:** Proposed — requires product approval before implementation.

## Context

BeaconHS has a construction `org_units` hierarchy and equipment-only work orders. Uvanoo needs property/room operations without weakening existing tenant/RLS integrity or redefining construction records.

## Decision

For the MVP, add dedicated hospitality hierarchy tables and a generic room-or-asset maintenance domain. Keep `org_units`, `equipment_items`, and `equipment_work_orders` intact. Use the existing RLS, audit, attachments, jobs, notifications, domain-events, compliance and API infrastructure.

Operational scheduling will materialize task occurrences; it will not calculate a diary dynamically or overload equipment reminders/report schedules. Module entitlement will be a server-enforced platform capability distinct from tenant navigation preferences.

## Consequences

- Existing construction workflows remain stable.
- New tables require additive migration, tenant-aware FKs, RLS registry entry, permissions, audit/event producers and tests.
- A shared maintenance cockpit can be a read model later; the MVP does not merge equipment and room work-order tables.
- Regulatory content remains configuration/template-led until jurisdictional requirements are confirmed.

## Alternatives rejected for MVP

- Extend `org_unit_level` to contain property/floor/room: couples a construction hierarchy to hotel room lifecycle and query needs.
- Create placeholder equipment for rooms: violates equipment identity and asset reporting.
- Use `tenant_nav_config` as licensing: it is intentionally UI-only.
