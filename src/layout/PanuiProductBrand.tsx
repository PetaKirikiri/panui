import { Link } from 'react-router-dom'
import { ecosystemSameOriginLinks, isLikelyInAppWebView } from '../lib/ecosystemShell'

export function PanuiProductBrand() {
  if (isLikelyInAppWebView()) {
    return (
      <Link to="/" className="text-lg font-semibold tracking-tight text-gray-900">
        pānui
      </Link>
    )
  }

  const links = ecosystemSameOriginLinks()

  return (
    <details className="relative min-w-0">
      <summary className="flex cursor-pointer list-none items-center gap-0.5 text-gray-900 [&::-webkit-details-marker]:hidden">
        <span className="text-lg font-semibold tracking-tight">pānui</span>
        <span className="text-sm text-gray-500" aria-hidden>
          ▾
        </span>
      </summary>
      <ul className="absolute left-0 top-full z-50 mt-1 min-w-[11rem] rounded-lg border border-gray-200 bg-white py-1 shadow-md">
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
