// Parses a browser User-Agent string into a friendly, human-readable device
// label. Intentionally rough — we only need "Chrome on Mac", "Safari on iPad"
// etc. for the login history card. Avoids pulling in a heavy UA parser.

export function friendlyDevice(ua: string | undefined | null): string {
  if (!ua) return 'Unknown device'
  const s = ua.toLowerCase()

  let browser = 'browser'
  if (s.includes('edg/'))      browser = 'Edge'
  else if (s.includes('opr/')) browser = 'Opera'
  else if (s.includes('chrome') && !s.includes('chromium')) browser = 'Chrome'
  else if (s.includes('firefox')) browser = 'Firefox'
  else if (s.includes('safari')) browser = 'Safari'
  else if (s.includes('chromium')) browser = 'Chromium'

  let os = 'device'
  if (s.includes('iphone')) os = 'iPhone'
  else if (s.includes('ipad')) os = 'iPad'
  else if (s.includes('android')) os = 'Android'
  else if (s.includes('mac os') || s.includes('macintosh')) os = 'Mac'
  else if (s.includes('windows')) os = 'Windows'
  else if (s.includes('linux')) os = 'Linux'

  return `${browser} on ${os}`
}
