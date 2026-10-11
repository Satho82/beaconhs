import { createServer, type Socket } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendVia } from './transport'

// Exercise the installed Nodemailer implementation; only DNS is substituted
// so database-mode SMTP can be tested against an isolated loopback fixture.
vi.mock('@beaconhs/sync/egress', () => ({
  resolvePublicHost: vi.fn(async () => ({
    address: '127.0.0.1',
    family: 4,
    hostname: 'smtp.example.test',
    ipLiteral: false,
  })),
}))

afterEach(() => vi.unstubAllEnvs())

async function smtpFixture() {
  const commands: string[] = []
  const messages: string[] = []
  const sockets = new Set<Socket>()
  const server = createServer((socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.setEncoding('utf8')
    socket.write('220 localhost ESMTP test\r\n')
    let pending = ''
    let message: string[] | undefined
    socket.on('data', (chunk) => {
      pending += chunk
      let end: number
      while ((end = pending.indexOf('\r\n')) !== -1) {
        const line = pending.slice(0, end)
        pending = pending.slice(end + 2)
        if (message) {
          if (line === '.') {
            messages.push(message.join('\r\n'))
            message = undefined
            socket.write('250 Accepted\r\n')
          } else message.push(line.replace(/^\.\./, '.'))
          continue
        }
        commands.push(line)
        if (/^(EHLO|HELO) /i.test(line)) socket.write('250 localhost\r\n')
        else if (line === 'STARTTLS') socket.write('454 TLS unavailable\r\n')
        else if (line === 'DATA') {
          message = []
          socket.write('354 End with a dot\r\n')
        } else if (line === 'QUIT') socket.end('221 Bye\r\n')
        else socket.write('250 OK\r\n')
      }
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected local TCP address')
  return {
    port: address.port,
    commands,
    messages,
    async close() {
      for (const socket of sockets) socket.destroy()
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    },
  }
}

describe('installed Nodemailer SMTP compatibility', () => {
  it('sends the application envelope, reply-to and attachment through local SMTP', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const fixture = await smtpFixture()
    try {
      const result = await sendVia(
        {
          provider: 'smtp',
          mode: 'local-dev',
          host: 'localhost',
          port: fixture.port,
          secure: false,
          from: 'UVANOO <sender@example.test>',
          replyTo: 'support@example.test',
        },
        {
          to: ['recipient@example.test'],
          subject: 'SMTP compatibility',
          text: 'Test message',
          html: '<p>Test message</p>',
          attachments: [{ filename: 'report.txt', content: 'cmVwb3J0', contentType: 'text/plain' }],
        },
      )
      expect(result.id).toMatch(/^<.+@example\.test>$/)
      expect(fixture.commands).toContain('MAIL FROM:<sender@example.test>')
      expect(fixture.commands).toContain('RCPT TO:<recipient@example.test>')
      expect(fixture.messages).toHaveLength(1)
      expect(fixture.messages[0]).toContain('Reply-To: support@example.test')
      expect(fixture.messages[0]).toContain('filename=report.txt')
      expect(fixture.messages[0]).toContain('cmVwb3J0')
    } finally {
      await fixture.close()
    }
  })

  it('refuses database SMTP delivery when the server cannot establish required TLS', async () => {
    const fixture = await smtpFixture()
    try {
      await expect(
        sendVia(
          {
            provider: 'smtp',
            mode: 'database',
            host: 'smtp.example.test',
            port: fixture.port,
            secure: false,
            from: 'sender@example.test',
          },
          {
            to: 'recipient@example.test',
            subject: 'TLS required',
            text: 'Must not be sent',
            html: '<p>Must not be sent</p>',
          },
        ),
      ).rejects.toThrow(/SMTP:.*TLS/)
      expect(fixture.commands).toContain('STARTTLS')
      expect(fixture.commands.some((command) => command.startsWith('MAIL FROM:'))).toBe(false)
      expect(fixture.messages).toHaveLength(0)
    } finally {
      await fixture.close()
    }
  })
})
