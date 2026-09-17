import type { KnipConfig } from 'knip'

const config: KnipConfig = {
  $schema: 'https://unpkg.com/knip@5/schema.json',
  workspaces: {
    '.': {
      entry: ['deploy/collabora-branding.js', 'scripts/check-sanitizer-boundary.mjs'],
      // The sanitizer audit resolves these through apps/web's createRequire.
      ignoreDependencies: ['next', 'jsdom'],
    },
    'apps/web': {
      // Next externalizes the shared sanitizer through this runtime dependency.
      ignoreDependencies: ['isomorphic-dompurify'],
      entry: [
        'public/sw.js',
        'src/**/*.test.{ts,tsx}',
        'scripts/**/*.test.ts',
        'scripts/i18n-runtime-audit.ts',
        'scripts/backfill-credential-outputs.ts',
        'scripts/cleanup-rassaun-credential-designs.ts',
        'scripts/backfill-private-attachment-urls.ts',
        'scripts/backfill-signatures-to-storage.ts',
        'scripts/backfill-tenant-storage-keys.ts',
        'scripts/generate-brand-icons.mjs',
        'scripts/materialize-compliance.ts',
        'scripts/normalize-ppe-inspection-notes.ts',
        'scripts/restore-equipment-preuse-links.ts',
        'scripts/restore-ppe-custody-from-legacy.ts',
        'scripts/restore-ppe-serial-numbers.ts',
      ],
    },
    'apps/worker': {
      entry: ['src/health.ts', 'src/storage-init.ts'],
      // Bundled @beaconhs/forms-pdf keeps `qrcode` external; the worker image
      // must still resolve it at runtime.
      ignoreDependencies: ['qrcode'],
    },
    'packages/db': {
      entry: ['src/scripts/reseed-lift-plan.ts'],
    },
    'packages/sync': {
      ignoreDependencies: ['mssql'],
    },
  },
}

export default config
