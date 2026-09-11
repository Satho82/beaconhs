import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export async function GET(): Promise<Response> {
  const icon = await readFile(join(process.cwd(), 'src/app/icon.png'))

  return new Response(icon, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
