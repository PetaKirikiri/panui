import { ecosystemSameOriginLinks, isLikelyInAppWebView } from '../lib/ecosystemShell'

type Props = { currentWordmark: string }

/** Top-right pill: jump between Akomanga shell satellites on the same origin. */
export function EcosystemAppSwitcher({ currentWordmark }: Props) {
  if (typeof navigator !== 'undefined' && isLikelyInAppWebView()) {
    return null
  }

  const links = ecosystemSameOriginLinks()

  return (
    <details className="relative shrink-0">
      <summary
        className="inline-flex cursor-pointer list-none items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-900 shadow-sm hover:bg-gray-50 [&::-webkit-details-marker]:hidden"
        aria-label="Switch ecosystem app"
      >
        <span>{currentWordmark}</span>
        <span className="text-gray-500" aria-hidden>
          ▾
        </span>
      </summary>
      <ul className="absolute right-0 top-full z-[100] mt-1 min-w-[11rem] rounded-lg border border-gray-200 bg-white py-1 shadow-md">
        {links.map((item) => (
          <li key={item.key}>
            <a href={item.href} className="block px-3 py-2 text-sm text-gray-900 hover:bg-gray-50">
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </details>
  )
}
