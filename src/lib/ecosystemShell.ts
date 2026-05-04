export type EcosystemLink = { key: string; label: string; href: string }

/** Same-host links when Akomanga proxies `/mata`, `/maumahara`, `/panui`. */
export function ecosystemSameOriginLinks(): EcosystemLink[] {
  const o = typeof window !== 'undefined' ? window.location.origin : ''
  return [
    { key: 'akomanga', label: 'Akomanga', href: `${o}/` },
    { key: 'maumahara', label: 'Maumahara', href: `${o}/maumahara` },
    { key: 'panui', label: 'Pānui', href: `${o}/panui/` },
    { key: 'mata', label: 'Mata', href: `${o}/mata` },
  ]
}

/** Hide ecosystem switchers in embedded browsers (best-effort). */
export function isLikelyInAppWebView(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/\bwv\b/i.test(ua)) return true
  if (/Electron\//i.test(ua)) return true
  return false
}
