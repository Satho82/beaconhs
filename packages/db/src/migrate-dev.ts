/** DEV-only entrypoint. Approval evidence is mandatory before any database mutation. */
if (process.env.FEATURE_CANDIDATE_VERIFIED !== 'true') {
  throw new Error('DEV migration entrypoint requires verified candidate context')
}
await import('./migrate')
export {}
