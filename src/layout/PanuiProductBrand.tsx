import { Link } from 'react-router-dom'

/** Product wordmark beside the header title; app switching uses `EcosystemAppSwitcher` (top right). */
export function PanuiProductBrand() {
  return (
    <Link to="/" className="text-lg font-semibold tracking-tight text-gray-900">
      pānui
    </Link>
  )
}
