/** No DDL/DML: admission and, for web, read-only post-migration state verification. */
import { devMigrationFolder, loadDevMigrationGate } from './dev-migration-gate'
if (process.env.FEATURE_CANDIDATE_VERIFIED !== 'true')
  throw new Error('DEV candidate context required')
const phase = process.env.DEV_ADMISSION_PHASE
if (phase !== 'migration' && phase !== 'web') throw new Error('DEV admission phase required')
const gate = await loadDevMigrationGate(devMigrationFolder, phase)
if (phase === 'web') await gate.verifyWeb()
console.log(
  JSON.stringify({
    devAdmission: 'PASS',
    phase,
    sourceSha: process.env.DEPLOY_SOURCE_SHA,
    evidenceSha256: process.env.DEV_RELEASE_EVIDENCE_SHA256,
    temporaryApprovalSha256: process.env.DEV_TEMPORARY_APPROVAL_SHA256 || null,
  }),
)
