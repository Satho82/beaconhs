export async function riskPdfAttachmentResponse(
  response: Response,
  filename: string,
): Promise<Response> {
  if (!response.ok) return response
  const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/pdf') {
    return Response.json({ error: 'PDF service returned an invalid content type' }, { status: 502 })
  }
  const bytes = await response.arrayBuffer()
  const signature = new TextDecoder().decode(bytes.slice(0, 5))
  if (bytes.byteLength < 5 || signature !== '%PDF-') {
    return Response.json({ error: 'PDF service returned an invalid document' }, { status: 502 })
  }
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.pdf$/i, '') + '.pdf'
  return new Response(bytes, {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename="${safeFilename}"`,
      'Content-Length': String(bytes.byteLength),
      'Content-Type': 'application/pdf',
    },
  })
}
