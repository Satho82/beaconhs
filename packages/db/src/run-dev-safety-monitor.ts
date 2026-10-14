import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { prepareMonitorDirectory, runMonitor } from './dev-safety-monitor'

try {
  const args = process.argv.slice(2)
  if (args.length !== 4 || args.some((v) => !v)) throw new Error('INPUT_REQUIRED')
  if (args[0] === '--prepare') {
    prepareMonitorDirectory(
      args[1]!,
      {
        policy: readFileSync(join(args[2]!, 'monitor-policy.json')),
        manifest: readFileSync(join(args[2]!, 'manifest.json')),
        approval: readFileSync(join(args[2]!, 'owner-approval.json')),
        restore: readFileSync(join(args[2]!, 'private-restore.json')),
      },
      args[3]!,
    )
    console.log('DEV_MONITOR_BUNDLE_PREPARED_NOT_ADMITTED')
  } else await runMonitor(args[0]!, args[1]!, args[2]!, args[3]!)
} catch {
  // Never forward subprocess, receipt, path, credential or parser diagnostics.
  console.error('DEV_MONITOR_STOPPED')
  process.exitCode = 1
}
