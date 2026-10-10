/** Plan identity-preserving edits using only hazards loaded from the scoped assessment. */
export function planRiskHazardEdit(
  existing: ReadonlyArray<{ id: string; sortOrder: number }>,
  submitted: ReadonlyArray<{ id?: string }>,
) {
  if (submitted.length === 0) throw new Error('At least one hazard is required')
  const known = new Set(existing.map((hazard) => hazard.id))
  const retained = new Set<string>()
  for (const hazard of submitted) {
    if (hazard.id === undefined) continue
    if (!known.has(hazard.id)) throw new Error('Risk hazard does not belong to this assessment')
    if (retained.has(hazard.id)) throw new Error('Risk hazard was submitted more than once')
    retained.add(hazard.id)
  }
  // Action visibility is narrower than source visibility in some contexts. An empty
  // RLS-filtered action query cannot prove a saved hazard has no historical links.
  // Keep saved sources until an authoritative removal policy is approved.
  if (existing.some((hazard) => !retained.has(hazard.id))) {
    throw new Error('Saved hazards must be retained to preserve corrective-action history')
  }
  // The assessment/order index is immediately unique. Park existing rows above
  // both order ranges before assigning the final positions, including swaps.
  const temporaryStart = Math.max(submitted.length, ...existing.map((h) => h.sortOrder)) + 1
  if (!Number.isSafeInteger(temporaryStart) || temporaryStart + existing.length > 2_147_483_647) {
    throw new Error('Hazard ordering is outside the supported range')
  }
  return existing.map((hazard, index) => ({
    id: hazard.id,
    sortOrder: temporaryStart + index,
  }))
}
