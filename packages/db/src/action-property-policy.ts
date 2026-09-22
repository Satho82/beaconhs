/** Bulk-export audit summaries have no Action ID, but still reveal scoped counts. */
export function actionAuditPredicate(): string {
  const stamp = "audit_log.metadata->'actionAuthorization'"
  return `(
    ${mode} = 'tenant'
    OR CASE
      WHEN entity_type = 'corrective_action' THEN (
        EXISTS (SELECT 1 FROM corrective_actions a
          WHERE a.tenant_id=audit_log.tenant_id AND a.id=audit_log.entity_id)
        OR (audit_log.entity_id IS NULL
          AND ${stamp}->>'version' = '1'
          AND ${stamp}->>'mode' = ${mode}
          AND ${mode} IN ('property', 'legacy')
          AND jsonb_typeof(${stamp}->'propertyIds') = 'array'
          AND (${stamp}->'propertyIds') <@ (${ids}))
      )
      WHEN entity_type = 'report_run' THEN EXISTS (
        SELECT 1 FROM report_runs r
        WHERE r.tenant_id=audit_log.tenant_id AND r.id=audit_log.entity_id)
      ELSE true END
  )`
}

/** Stored exports need output-scope provenance; old blobs are not proof. */
export function reportArtifactPropertyPredicate(): string {
  const stamp = "report_runs.request_snapshot->'artifactAuthorization'"
  return `(
    ${mode} = 'tenant'
    OR (report_runs.pdf_attachment_id IS NULL AND report_runs.row_count IS NULL)
    OR (
      ${stamp}->>'version' = '1'
      AND ${stamp}->>'mode' = ${mode}
      AND ${mode} IN ('property', 'legacy')
      AND jsonb_typeof(${stamp}->'propertyIds') = 'array'
      AND (${stamp}->'propertyIds') <@ (${ids})
    )
  )`
}

/**
 * A second boundary inside tenant RLS. Action permissions never widen property
 * assignments. The request context, not a cookie or request payload, sets these
 * transaction-local values. Trusted background withTenant callers are explicit
 * tenant-scoped principals; request executors always replace that scope.
 */
const mode = "current_setting('app.action_scope_mode', true)"
const ids = "coalesce(nullif(current_setting('app.action_property_ids', true), ''), '[]')::jsonb"
/** Inspection metadata and its site must agree; neither can widen the other. */
export function inspectionPropertyPredicate(table: string): string {
  const hint = `${table}.metadata->>'propertyId'`
  const site = `(SELECT u.metadata->>'hospitalityPropertyId' FROM org_units u
    WHERE u.tenant_id=${table}.tenant_id AND u.id=${table}.site_org_unit_id)`
  const property = `coalesce(${hint}, ${site})`
  return `(${mode} = 'tenant' OR (
    ${mode} = 'property'
    AND (${ids}) ? (${property})
    AND (${hint} IS NULL OR ${site} IS NULL OR ${hint} = ${site})
    AND EXISTS (SELECT 1 FROM hospitality_properties p
      WHERE p.tenant_id=${table}.tenant_id AND p.id::text=${property}
        AND p.deleted_at IS NULL)
  ) OR (${mode} = 'legacy' AND ${property} IS NULL))`
}

export function inspectionChildPredicate(table: string, parent: string): string {
  return `EXISTS (SELECT 1 FROM ${parent} p
    WHERE p.tenant_id=${table}.tenant_id AND p.id=${table}.record_id)`
}

export function compliancePropertyPredicate(): string {
  const property = "compliance_obligations.target_ref->>'propertyId'"
  return `(${mode} = 'tenant' OR (
    ${mode} = 'property' AND (${ids}) ? (${property})
    AND EXISTS (SELECT 1 FROM hospitality_properties p
      WHERE p.tenant_id=compliance_obligations.tenant_id AND p.id::text=${property}
        AND p.deleted_at IS NULL)
  ) OR (${mode} = 'legacy' AND ${property} IS NULL))`
}

export function complianceChildPredicate(table: string): string {
  return `EXISTS (SELECT 1 FROM compliance_obligations p
    WHERE p.tenant_id=${table}.tenant_id AND p.id=${table}.obligation_id)`
}

export function incidentPropertyPredicate(): string {
  return `(${mode} = 'tenant' OR (
    ${mode} = 'property'
    AND EXISTS (
      SELECT 1 FROM org_units site
      WHERE site.tenant_id=incidents.tenant_id
        AND site.id=incidents.site_org_unit_id
        AND (${ids}) ? (site.metadata->>'hospitalityPropertyId')
    )
  ) OR (
    ${mode} = 'legacy'
    AND NOT EXISTS (
      SELECT 1 FROM org_units site
      WHERE site.tenant_id=incidents.tenant_id
        AND site.id=incidents.site_org_unit_id
        AND site.metadata->>'hospitalityPropertyId' IS NOT NULL
    )
  ))`
}

export function incidentChildPredicate(table: string): string {
  return `EXISTS (SELECT 1 FROM incidents parent
    WHERE parent.tenant_id=${table}.tenant_id
      AND parent.id=${table}.incident_id)`
}

export function incidentInjuryTypeAssignmentPredicate(): string {
  return `EXISTS (SELECT 1 FROM incident_injuries injury
    WHERE injury.tenant_id=incident_injury_type_assignments.tenant_id
      AND injury.id=incident_injury_type_assignments.injury_id)`
}

export function maintenanceIssuePropertyPredicate(): string {
  return `(${mode} = 'tenant' OR (
    ${mode} = 'property'
    AND EXISTS (
      SELECT 1 FROM hospitality_rooms r
      JOIN hospitality_floors f ON f.tenant_id=r.tenant_id AND f.id=r.floor_id
      JOIN hospitality_buildings b ON b.tenant_id=f.tenant_id AND b.id=f.building_id
      WHERE r.tenant_id=maintenance_issues.tenant_id
        AND r.id=maintenance_issues.room_id
        AND (${ids}) ? b.property_id::text
    )
  ))`
}

export function maintenanceIssueAttachmentPredicate(): string {
  return `EXISTS (SELECT 1 FROM maintenance_issues m
    WHERE m.tenant_id=maintenance_issue_attachments.tenant_id
      AND m.id=maintenance_issue_attachments.issue_id)`
}

export function hospitalityHandoverPropertyPredicate(): string {
  return `(${mode} = 'tenant' OR (
    ${mode} = 'property'
    AND (${ids}) ? hospitality_handovers.property_id::text
  ))`
}

export function hospitalityMeterPropertyPredicate(): string {
  return `(${mode} = 'tenant' OR (
    ${mode} = 'property'
    AND (${ids}) ? hospitality_meters.property_id::text
  ))`
}

export function hospitalityMeterChildPredicate(table: string): string {
  return `EXISTS (SELECT 1 FROM hospitality_meters m
    WHERE m.tenant_id=${table}.tenant_id
      AND m.id=${table}.meter_id)`
}

export function hospitalityHandoverChildPredicate(table: string): string {
  return `EXISTS (SELECT 1 FROM hospitality_handovers h
    WHERE h.tenant_id=${table}.tenant_id
      AND h.id=${table}.handover_id)`
}

// Source rows are read under the same tenant RLS. Do not trust a mutable metadata
// hint over an authoritative parent. Unknown linked sources deliberately fail
// closed. An empty result denotes a verified non-property source; NULL is unresolved.
function sourceProperty(table: string): string {
  const source = `${table}.source_entity_type`
  const sourceId = `${table}.source_entity_id`
  const tenant = `${table}.tenant_id`
  return `CASE
    WHEN ${source} = 'hospitality_handover' THEN (
      SELECT h.property_id::text FROM hospitality_handovers h
      WHERE h.tenant_id=${tenant} AND h.id=${sourceId})
    WHEN ${source} = 'risk_hazard' THEN (
      SELECT a.property_id::text FROM risk_hazards h
      JOIN risk_assessments a ON a.tenant_id=h.tenant_id AND a.id=h.assessment_id
      WHERE h.tenant_id=${tenant} AND h.id=${sourceId})
    WHEN ${source} = 'operational_task_occurrence' THEN (
      SELECT s.property_id::text FROM operational_task_occurrences o
      JOIN operational_task_schedules s ON s.tenant_id=o.tenant_id AND s.id=o.schedule_id
      WHERE o.tenant_id=${tenant} AND o.id=${sourceId})
    WHEN ${source} = 'inspection_record' THEN (
      SELECT CASE WHEN r.metadata->>'propertyId' IS NOT NULL
        AND u.metadata->>'hospitalityPropertyId' IS NOT NULL
        AND r.metadata->>'propertyId' IS DISTINCT FROM u.metadata->>'hospitalityPropertyId'
        THEN NULL ELSE coalesce(r.metadata->>'propertyId', u.metadata->>'hospitalityPropertyId', '') END
      FROM inspection_records r
      LEFT JOIN org_units u ON u.tenant_id=r.tenant_id AND u.id=r.site_org_unit_id
      WHERE r.tenant_id=${tenant} AND r.id=${sourceId})
    WHEN ${source} = 'equipment_inspection_record' THEN (
      SELECT CASE WHEN r.metadata->>'propertyId' IS NOT NULL
        AND u.metadata->>'hospitalityPropertyId' IS NOT NULL
        AND r.metadata->>'propertyId' IS DISTINCT FROM u.metadata->>'hospitalityPropertyId'
        THEN NULL ELSE coalesce(r.metadata->>'propertyId', u.metadata->>'hospitalityPropertyId', '') END
      FROM equipment_inspection_records r
      LEFT JOIN org_units u ON u.tenant_id=r.tenant_id AND u.id=r.site_org_unit_id
      WHERE r.tenant_id=${tenant} AND r.id=${sourceId})
    WHEN ${source} = 'incident' THEN (
      SELECT coalesce(u.metadata->>'hospitalityPropertyId', '') FROM incidents r
      LEFT JOIN org_units u ON u.tenant_id=r.tenant_id AND u.id=r.site_org_unit_id
      WHERE r.tenant_id=${tenant} AND r.id=${sourceId})
    WHEN ${source} = 'form_response' THEN (
      SELECT coalesce(u.metadata->>'hospitalityPropertyId', '') FROM form_responses r
      LEFT JOIN org_units u ON u.tenant_id=r.tenant_id AND u.id=r.site_org_unit_id
      WHERE r.tenant_id=${tenant} AND r.id=${sourceId})
    WHEN ${source} = 'hazid_assessment' THEN (
      SELECT coalesce(u.metadata->>'hospitalityPropertyId', '') FROM hazid_assessments r
      LEFT JOIN org_units u ON u.tenant_id=r.tenant_id AND u.id=r.site_org_unit_id
      WHERE r.tenant_id=${tenant} AND r.id=${sourceId})
    WHEN ${source} = 'journal_entry' THEN (
      SELECT coalesce(u.metadata->>'hospitalityPropertyId', '') FROM journal_entries r
      LEFT JOIN org_units u ON u.tenant_id=r.tenant_id AND u.id=r.site_org_unit_id
      WHERE r.tenant_id=${tenant} AND r.id=${sourceId})
    WHEN ${source} = 'ppe_inspection' THEN (
      SELECT coalesce(u.metadata->>'hospitalityPropertyId', '') FROM ppe_inspections r
      LEFT JOIN org_units u ON u.tenant_id=r.tenant_id AND u.id=r.site_org_unit_id
      WHERE r.tenant_id=${tenant} AND r.id=${sourceId})
    WHEN ${source} = 'maintenance_issue' THEN (
      SELECT b.property_id::text FROM maintenance_issues m
      JOIN hospitality_rooms r ON r.tenant_id=m.tenant_id AND r.id=m.room_id
      JOIN hospitality_floors f ON f.tenant_id=r.tenant_id AND f.id=r.floor_id
      JOIN hospitality_buildings b ON b.tenant_id=f.tenant_id AND b.id=f.building_id
      WHERE m.tenant_id=${tenant} AND m.id=${sourceId})
    WHEN ${source} = 'compliance_obligation' THEN (
      SELECT coalesce(r.target_ref->>'propertyId', '') FROM compliance_obligations r
      WHERE r.tenant_id=${tenant} AND r.id=${sourceId})
    WHEN ${source} IS NULL AND ${sourceId} IS NULL
      THEN coalesce(${table}.metadata->>'propertyId',
        (SELECT u.metadata->>'hospitalityPropertyId' FROM org_units u
         WHERE u.tenant_id=${tenant} AND u.id=${table}.site_org_unit_id), '')
    ELSE NULL END`
}

export function actionPropertyPredicate(table = 'corrective_actions'): string {
  const property = sourceProperty(table)
  const hint = `${table}.metadata->>'propertyId'`
  return `(
    ${mode} = 'tenant'
    OR (
      ${mode} = 'property'
      AND (${ids}) ? (${property})
      AND (${hint} IS NULL OR ${hint} = (${property}))
      AND NOT EXISTS (
        SELECT 1 FROM org_units site
        WHERE site.tenant_id=${table}.tenant_id AND site.id=${table}.site_org_unit_id
          AND site.metadata->>'hospitalityPropertyId' IS NOT NULL
          AND site.metadata->>'hospitalityPropertyId' IS DISTINCT FROM (${property})
      )
      AND (${table}.source_form_response_id IS NULL OR (
        ${table}.source_entity_type='form_response'
        AND ${table}.source_form_response_id=${table}.source_entity_id
      ))
      AND EXISTS (
        SELECT 1 FROM hospitality_properties p
        WHERE p.tenant_id=${table}.tenant_id AND p.id::text=(${property})
          AND p.deleted_at IS NULL
      )
    )
    OR (
      ${mode} = 'legacy'
      AND ${hint} IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM org_units site
        WHERE site.tenant_id=${table}.tenant_id AND site.id=${table}.site_org_unit_id
          AND site.metadata->>'hospitalityPropertyId' IS NOT NULL
      )
      AND ${table}.source_entity_type IS DISTINCT FROM 'risk_hazard'
      AND ${table}.source_entity_type IS DISTINCT FROM 'operational_task_occurrence'
      AND ${table}.source_entity_type IS DISTINCT FROM 'hospitality_handover'
      AND (${property}) = ''
      AND (${table}.source_form_response_id IS NULL OR (
        ${table}.source_entity_type='form_response' AND ${table}.source_form_response_id=${table}.source_entity_id
      ))
    )
  )`
}

export function actionChildPredicate(table: 'ca_photos' | 'ca_complete_steps'): string {
  return `EXISTS (SELECT 1 FROM corrective_actions a
    WHERE a.tenant_id=${table}.tenant_id AND a.id=${table}.ca_id)`
}

/** Assignees must be active tenant members authorised for the Action property. */
export function actionAssigneePredicate(): string {
  const property = sourceProperty('corrective_actions')
  return `(
    (${property}) IS NULL OR (${property}) = ''
    OR corrective_actions.owner_tenant_user_id IS NULL
    OR EXISTS (
      SELECT 1 FROM tenant_users member
      JOIN role_assignments assignment
        ON assignment.tenant_id=member.tenant_id AND assignment.tenant_user_id=member.id
      WHERE member.tenant_id=corrective_actions.tenant_id
        AND member.id=corrective_actions.owner_tenant_user_id AND member.status='active'
        AND (
          assignment.scope->>'type'='tenant'
          OR (assignment.scope->>'type'='properties'
            AND (assignment.scope->'propertyIds') ? (${property}))
        )
    )
  )`
}
