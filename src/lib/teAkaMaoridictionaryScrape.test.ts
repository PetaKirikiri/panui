import { describe, expect, it } from 'vitest'
import { parseMaoridictionaryWordPageHtml } from './teAkaMaoridictionaryScrape'

/** Snippet from live `GET /word/horomi` — nested divs under `.flex-1.detail` (balanced). */
const HOROMI_PAGE_SNIPPET = `<!DOCTYPE html><html><body>
<div class="content-def">
<h2 class="title  ">horomi
<a class="word-audio-play" x-data="{ audioRef: 'word-audio-1441' }"></a>
<audio src="https://storage.googleapis.com/maori-dictionary-prod2-web-assets/public/1441.mp3"></audio>
</h2>
<div id="d1707" class="flex mt-5 sm:mt-8">
<div class="flex-1 detail">
<p class="mb-0"><strong>1.</strong>
<strong>(verb)</strong> (-a)
to swallow, devour, gulp, gobble.</p>
<div class="mt-4 ">
<div x-data="{ showExample: false }">
<p class="mb-0 mt-2 text-slate"><em>Kia roa hoki e ngaungau ana ka <b>horomi</b> ai (TTT 1/5/1922:4).</em> / And it should be chewed for a long time before swallowing.</p>
</div>
</div>
</div>
<div class="flex-none ml-4"></div>
</div>
</div>
</body></html>`

describe('parseMaoridictionaryWordPageHtml', () => {
  it('parses verb sense, subentry marker, gloss, and MI/EN example from current Te Aka HTML', () => {
    const r = parseMaoridictionaryWordPageHtml(HOROMI_PAGE_SNIPPET, 'horomi')
    expect(r).not.toBeNull()
    expect(r!.word).toBe('horomi')
    expect(r!.wordId).toBe('1441')
    expect(r!.entries).toHaveLength(1)
    expect(r!.entries[0]!.pos).toBe('verb')
    expect(r!.entries[0]!.definition).toContain('to swallow')
    expect(r!.entries[0]!.definition).toContain('(-a)')
    expect(r!.entries[0]!.exampleMi).toContain('horomi')
    expect(r!.entries[0]!.exampleEn).toContain('swallowing')
    expect(r!.audioUrl).toContain('1441.mp3')
  })

  it('returns null for zero-hit search-style HTML', () => {
    const html = `<html><body><h2>We couldn't find that</h2></body></html>`
    expect(parseMaoridictionaryWordPageHtml(html, 'x')).toBeNull()
  })
})
