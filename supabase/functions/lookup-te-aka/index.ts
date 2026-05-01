import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

import { scrapeTeAkaMaoridictionaryLemma } from '../../../src/lib/teAkaMaoridictionaryScrape.ts'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Use POST' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: { word?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const raw = String(body.word ?? '').trim()
  const word = raw.normalize('NFC').toLowerCase()
  if (!word) {
    return new Response(JSON.stringify({ error: 'missing_word' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const scraped = await scrapeTeAkaMaoridictionaryLemma(word)
    /** 200 so `functions.invoke` returns body; client treats empty `entries` as miss. */
    if (!scraped?.entries?.length) {
      return new Response(
        JSON.stringify({
          word,
          entries: [],
          sourceUrl: `https://maoridictionary.co.nz/word/${encodeURIComponent(word)}`,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
        },
      )
    }
    return new Response(JSON.stringify(scraped), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
    })
  } catch (e) {
    console.error('[lookup-te-aka]', e)
    return new Response(
      JSON.stringify({ error: 'scrape_failed', message: e instanceof Error ? e.message : String(e) }),
      {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
