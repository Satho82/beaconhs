import { ensureBucket } from '@beaconhs/storage'

async function main(): Promise<void> {
  await ensureBucket()
  console.log('[storage-init] private bucket policy, lifecycle, and anonymous-read probe passed')
}

main().catch((error: unknown) => {
  console.error('[storage-init] failed:', error)
  process.exitCode = 1
})
