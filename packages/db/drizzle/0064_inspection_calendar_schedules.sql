-- Additive inspection-calendar linkage. Operational task schedules remain the
-- single source for recurrence, reminders, escalations and property scoping.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

ALTER TABLE operational_task_schedules
  ADD COLUMN inspection_type_id uuid;

ALTER TABLE operational_task_schedules
  ADD CONSTRAINT operational_task_schedules_tenant_inspection_type_fk
  FOREIGN KEY (tenant_id, inspection_type_id)
  REFERENCES inspection_types(tenant_id, id)
  ON DELETE RESTRICT;

CREATE INDEX operational_task_schedules_inspection_calendar_idx
  ON operational_task_schedules(tenant_id, inspection_type_id, property_id)
  WHERE inspection_type_id IS NOT NULL;
