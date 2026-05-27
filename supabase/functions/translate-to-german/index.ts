const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const deeplApiKey = Deno.env.get('DEEPL_API_KEY')
    const deeplEndpoint = Deno.env.get('DEEPL_API_URL') ?? 'https://api-free.deepl.com/v2/translate'
    if (!deeplApiKey) throw new Error('Missing DEEPL_API_KEY')

    const { text } = await req.json()
    const cleanText = String(text ?? '').trim()
    if (!cleanText) {
      return new Response(JSON.stringify({ translated_text: '', source_language: 'unknown' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = new URLSearchParams()
    body.set('text', cleanText)
    body.set('target_lang', 'DE')
    body.set('preserve_formatting', '1')

    const response = await fetch(deeplEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${deeplApiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    })

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data?.message ?? data?.error?.message ?? 'DeepL translation failed')
    }

    const translation = data?.translations?.[0]
    const outputText = translation?.text ?? cleanText

    return new Response(JSON.stringify({
      translated_text: outputText.trim(),
      source_language: translation?.detected_source_language?.toLowerCase() ?? 'auto',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
