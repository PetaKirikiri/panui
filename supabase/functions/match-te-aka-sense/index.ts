import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

// Match Supabase CORS + Pūrākau `suggest-subcategory-labels` so browser invoke() works.
const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

type SenseRow = { index: number; pos: string; gloss: string }

function clip(s: string, max: number): string {
  const t = typeof s === 'string' ? s : ''
  return t.length <= max ? t : `${t.slice(0, max)}…`
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

  const apiKey = Deno.env.get('OPENAI_API_KEY')?.trim()
  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error:
          'Server missing OPENAI_API_KEY. Set it: npm run secrets:openai:from-smartersubs (or supabase secrets set OPENAI_API_KEY=sk-... --project-ref <ref>)',
      }),
      { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  let body: {
    miChunk?: string
    enChunk?: string
    lemma?: string
    surfaceRaw?: string
    senses?: SenseRow[]
  }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const senses = Array.isArray(body.senses) ? body.senses : []
  const normalized: SenseRow[] = []
  const seenIdx = new Set<number>()
  for (const r of senses) {
    if (!r || typeof r !== 'object') continue
    const index = Number((r as SenseRow).index)
    if (!Number.isInteger(index) || index < 0 || seenIdx.has(index)) continue
    seenIdx.add(index)
    normalized.push({
      index,
      pos: clip(String((r as SenseRow).pos ?? ''), 80),
      gloss: clip(String((r as SenseRow).gloss ?? ''), 600),
    })
  }
  normalized.sort((a, b) => a.index - b.index)

  if (normalized.length === 0) {
    return new Response(JSON.stringify({ senseIndex: null }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const miChunk = clip(String(body.miChunk ?? ''), 6000)
  const enChunk = clip(String(body.enChunk ?? ''), 6000)
  const lemma = clip(String(body.lemma ?? '').toLowerCase(), 120)
  const surfaceRaw = clip(String(body.surfaceRaw ?? ''), 120)

  const model =
    Deno.env.get('OPENAI_MATCH_MODEL')?.trim() ||
    Deno.env.get('OPENAI_SUGGEST_MODEL')?.trim() ||
    'gpt-4o-mini'

  const userPayload = {
    instruction:
      'Pick which dictionary sense index matches how the target word is used in this bilingual chunk. Use BOTH te reo Māori and English. Return JSON only.',
    targetWord: { lemma, surfaceForm: surfaceRaw },
    miChunk,
    enChunk,
    senses: normalized,
    rules: [
      `senseIndex MUST be one of these integers: ${normalized.map((s) => s.index).join(', ')}`,
      'If none fit reasonably well, return senseIndex: null.',
      'Never invent a sense; never use an index not listed.',
    ],
  }

  let openaiRes: Response
  try {
    openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.15,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are a Māori–English lexicography assistant. Reply with compact JSON: {"senseIndex":number|null}',
          },
          { role: 'user', content: JSON.stringify(userPayload) },
        ],
      }),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: `OpenAI request failed: ${message}`, senseIndex: null }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!openaiRes.ok) {
    const errText = await openaiRes.text()
    console.error('[match-te-aka-sense] OpenAI error', openaiRes.status, errText.slice(0, 500))
    return new Response(
      JSON.stringify({
        error: `OpenAI returned ${openaiRes.status}`,
        detail: errText.slice(0, 500),
        senseIndex: null,
      }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const completion = (await openaiRes.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const raw = completion.choices?.[0]?.message?.content?.trim() ?? '{}'
  let parsed: { senseIndex?: unknown }
  try {
    parsed = JSON.parse(raw) as { senseIndex?: unknown }
  } catch {
    return new Response(JSON.stringify({ senseIndex: null }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const idx = parsed.senseIndex
  if (idx === null || idx === undefined) {
    return new Response(JSON.stringify({ senseIndex: null }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const n = Number(idx)
  if (!Number.isInteger(n) || !seenIdx.has(n)) {
    return new Response(JSON.stringify({ senseIndex: null }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ senseIndex: n }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
