export type EcosystemProductKey = 'akomanga' | 'maumahara' | 'panui' | 'mata'

export type EcosystemLink = { key: EcosystemProductKey; label: string; href: string }

/** Production: set to Akomanga origin when Pānui is on its own Vercel URL. */
export function ecosystemShellOrigin(): string {
  const raw = import.meta.env.VITE_ECOSYSTEM_SHELL_ORIGIN?.trim()
  if (raw) {
    try {
      return new URL(raw).origin
    } catch {
      return raw.replace(/\/+$/, '')
    }
  }
  return typeof window !== 'undefined' ? window.location.origin : ''
}

export function ecosystemCurrentProductKey(pathname: string): EcosystemProductKey {
  if (pathname.startsWith('/mata')) return 'mata'
  if (pathname.startsWith('/maumahara')) return 'maumahara'
  if (pathname.startsWith('/panui')) return 'panui'
  return 'panui'
}

export function ecosystemSameOriginLinks(): EcosystemLink[] {
  const o = ecosystemShellOrigin()
  return [
    { key: 'akomanga', label: 'Akomanga', href: `${o}/` },
    { key: 'maumahara', label: 'Maumahara', href: `${o}/maumahara` },
    { key: 'panui', label: 'Pānui', href: `${o}/panui/` },
    { key: 'mata', label: 'Mata', href: `${o}/mata` },
  ]
}

export function isLikelyInAppWebView(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/\bwv\b/i.test(ua)) return true
  if (/Electron\//i.test(ua)) return true
  return false
}
