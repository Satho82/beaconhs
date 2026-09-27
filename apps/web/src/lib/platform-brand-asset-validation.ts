import type { PlatformBrandAssetKind } from './platform-brand-asset-url'

const MAX_BRAND_ASSET_BYTES = 2 * 1024 * 1024
const IMAGE_CONTENT_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const FAVICON_CONTENT_TYPES = new Set(['image/png', 'image/x-icon', 'image/vnd.microsoft.icon'])

function isPng(bytes: Uint8Array) {
  return (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).every((value, index) => value === [137, 80, 78, 71, 13, 10, 26, 10][index])
  )
}
function isJpeg(bytes: Uint8Array) {
  return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
}
function isWebp(bytes: Uint8Array) {
  return (
    bytes.length >= 12 &&
    Buffer.from(bytes.subarray(0, 4)).toString() === 'RIFF' &&
    Buffer.from(bytes.subarray(8, 12)).toString() === 'WEBP'
  )
}
function isIco(bytes: Uint8Array) {
  return bytes.length >= 4 && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0
}

export function validatePlatformBrandAsset(args: {
  kind: PlatformBrandAssetKind
  contentType: string
  bytes: Uint8Array
}): string | null {
  const contentType = args.contentType.split(';', 1)[0]!.trim().toLowerCase()
  const allowed = args.kind === 'logo' ? IMAGE_CONTENT_TYPES : FAVICON_CONTENT_TYPES
  if (!allowed.has(contentType)) return 'Unsupported branding image type'
  if (!args.bytes.length || args.bytes.byteLength > MAX_BRAND_ASSET_BYTES)
    return 'Branding images must be 2 MB or smaller'
  const valid =
    (contentType === 'image/png' && isPng(args.bytes)) ||
    (contentType === 'image/jpeg' && isJpeg(args.bytes)) ||
    (contentType === 'image/webp' && isWebp(args.bytes)) ||
    ((contentType === 'image/x-icon' || contentType === 'image/vnd.microsoft.icon') &&
      isIco(args.bytes))
  return valid ? null : 'Branding image bytes do not match the declared file type'
}
