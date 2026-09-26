import { readFileSync } from 'node:fs'
import { reportArtifactPropertyPredicate } from './action-property-policy'

// Emit SQL only. The caller must explicitly choose its disposable database.
// Substitution uses compiler-owned SQL, never user input.
const fixture = readFileSync(
  new URL('./action-property-rls.integration.sql', import.meta.url),
  'utf8',
)
process.stdout.write(
  fixture.replaceAll('/* REPORT_ARTIFACT_SCOPE */ true', reportArtifactPropertyPredicate()),
)
