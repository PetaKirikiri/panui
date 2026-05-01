/** Read-only stacked paragraphs for import preview (matches reader border accents). */
export function ParagraphBlock({
  paragraphs,
  lang,
}: {
  paragraphs: string[]
  lang: string
}) {
  const borderClass = lang === 'mi' ? 'border-l-emerald-600' : 'border-l-red-600'
  return (
    <div className="space-y-4">
      {paragraphs.map((p, i) => (
        <p
          key={i}
          className={`block whitespace-pre-wrap border-l-4 bg-transparent py-1 pl-3 font-serif text-base leading-relaxed text-gray-900 ${borderClass}`}
          lang={lang}
        >
          {p}
        </p>
      ))}
    </div>
  )
}
