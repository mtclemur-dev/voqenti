const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type AIResult = {
  kind: 'answer' | 'action' | 'clarification'
  answer?: string
  intent?: string
  action_type?: string
  data?: Record<string, unknown>
  confidence?: number
  requires_confirmation?: true
  summary?: string
  message?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { prompt = '', language = 'ro', mode = 'auto', intent = 'unknown', context = {} } = await req.json()
    console.log('kb-ai-action-preview request', { mode, intent, language, promptLength: String(prompt).length })
    const result = await buildAiResult(String(prompt), String(language), String(mode), String(intent), context)
    return json(result)
  } catch (error) {
    console.error('kb-ai-action-preview error', { message: error.message, name: error.name })
    return json({ kind: 'clarification', message: 'edge_function_error' }, 500)
  }
})

async function buildAiResult(prompt: string, language: string, mode: string, intent: string, context: unknown): Promise<AIResult> {
  const classifiedIntent = intent === 'unknown' ? classifyIntent(prompt) : intent
  if (classifiedIntent === 'blocked_delete') {
    return { kind: 'clarification', intent: classifiedIntent, message: 'delete_requests_are_blocked' }
  }
  if (mode === 'action' && classifiedIntent === 'question') {
    return { kind: 'answer', intent: classifiedIntent, answer: modelAnswer(language) }
  }
  if (mode === 'action' && classifiedIntent === 'unknown') {
    return { kind: 'clarification', intent: classifiedIntent, message: 'ask_user_action_or_answer' }
  }

  const openAiKey = Deno.env.get('OPENAI_API_KEY')
  if (!openAiKey) {
    console.warn('OPENAI_API_KEY missing for kb-ai-action-preview')
    return mode === 'question'
      ? { kind: 'answer', answer: unavailableAnswer(language) }
      : { kind: 'clarification', intent: classifiedIntent, message: 'openai_key_missing' }
  }

  return mode === 'question'
    ? askOpenAiQuestion(openAiKey, prompt, language, context)
    : buildOpenAiAction(openAiKey, prompt, language, classifiedIntent)
}

async function askOpenAiQuestion(openAiKey: string, prompt: string, language: string, context: unknown): Promise<AIResult> {
  if (isModelQuestion(prompt)) return { kind: 'answer', answer: modelAnswer(language) }

  const response = await callOpenAi(openAiKey, {
    model: Deno.env.get('OPENAI_MODEL') || 'gpt-5-mini',
    input: [
      {
        role: 'system',
        content: [
          'You are KlarBudget AI. Answer budget questions in a concise, safe way.',
          'Do not create, update, or delete records.',
          'If the user asks to perform an action, say they should use the action preview flow.',
          'Use the provided budget context only as high-level context.',
        ].join('\n'),
      },
      { role: 'user', content: `Language: ${language}\nBudget context: ${JSON.stringify(context)}\nQuestion: ${prompt}` },
    ],
  })

  const answer = extractOutputText(response)
  return { kind: 'answer', answer: answer || unavailableAnswer(language) }
}

async function buildOpenAiAction(openAiKey: string, prompt: string, language: string, intent: string): Promise<AIResult> {
  const response = await callOpenAi(openAiKey, {
    model: Deno.env.get('OPENAI_MODEL') || 'gpt-5-mini',
    input: [
      {
        role: 'system',
        content: [
          'You convert KlarBudget user requests into safe JSON action previews.',
          'Never execute actions. Always return requires_confirmation true.',
          'Never return destructive actions for delete requests; return kind clarification instead.',
          'Supported action_type values: create_income, create_expense, create_debt, create_google_event, create_one_time_expense, update_debt_final_payment.',
          'If intent is unclear, return kind clarification.',
          'Return only JSON matching the schema.',
        ].join('\n'),
      },
      { role: 'user', content: `Language: ${language}\nClassified intent: ${intent}\nRequest: ${prompt}` },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'klarbudget_ai_result',
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['kind'],
          properties: {
            kind: { type: 'string', enum: ['action', 'clarification'] },
            intent: { type: 'string' },
            action_type: { type: 'string' },
            data: { type: 'object', additionalProperties: true },
            confidence: { type: 'number' },
            requires_confirmation: { type: 'boolean' },
            summary: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  })

  const text = extractOutputText(response)
  if (!text) return { kind: 'clarification', intent, message: 'empty_model_response' }
  const parsed = JSON.parse(text)
  if (parsed.kind !== 'action') return { kind: 'clarification', intent, message: parsed.message || 'ask_user_action_or_answer' }
  return {
    kind: 'action',
    intent,
    action_type: parsed.action_type,
    data: parsed.data || {},
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
    requires_confirmation: true,
    summary: parsed.summary || prompt,
  }
}

async function callOpenAi(openAiKey: string, body: Record<string, unknown>) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openAiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('OpenAI response error', { status: response.status, body: errorText.slice(0, 500) })
    throw new Error(`OpenAI error ${response.status}`)
  }
  return response.json()
}

function extractOutputText(result: Record<string, unknown>) {
  if (typeof result.output_text === 'string') return result.output_text
  const output = Array.isArray(result.output) ? result.output : []
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : []
    for (const part of content) {
      if (typeof part?.text === 'string') return part.text
    }
  }
  return ''
}

function classifyIntent(prompt: string) {
  const text = prompt.toLowerCase().trim()
  if (/(sterge|șterge|delete|löschen|loeschen|remove)/i.test(text)) return 'blocked_delete'
  if (/^(ce|cine|cum|de ce|cat|cât|pot|care|unde|wann|warum|wie|was|welches)\b|\?$/.test(text)) return 'question'
  if (/(adaug|adaugă|adauga|creeaz|creează|creaza|pune|registreaza|înregistrează|hinzuf|erstell|create|add)/i.test(text)) {
    if (/(venit|salariu|income|einnahme|gehalt)/i.test(text)) return 'create_income'
    if (/(datorie|credit|schuld|schlussrate)/i.test(text)) return 'create_debt'
    if (/(calendar|programare|termin|reminder|reamintire|tüv|tuv)/i.test(text)) return 'create_calendar_event'
    if (/(unic|o singura data|o singură dată|einmalig|plată unică|plata unica)/i.test(text)) return 'create_one_time_expense'
    if (/(cheltuial|plată|plata|expense|ausgabe|lidl|kaufland|netflix|telekom)/i.test(text)) return 'create_expense'
  }
  if (/(modifica|modifică|schimba|schimbă|actualizeaza|actualizează|update|change|ändern|aendern)/i.test(text)) return 'update_record'
  return 'unknown'
}

function isModelQuestion(prompt: string) {
  return /(ce model|model de ai|what model|welches modell|ki modell|ai model)/i.test(prompt)
}

function modelAnswer(language: string) {
  if (language === 'de') {
    return 'Ich bin ueber das KlarBudget AI-Modul verbunden. Das genaue Modell haengt von der Backend-Konfiguration ab. Wenn OpenAI verwendet wird, ist es das Modell, das in der Supabase Edge Function gesetzt ist.'
  }
  return 'Sunt conectat prin modulul AI KlarBudget. Modelul exact depinde de configurația backend-ului. Dacă este folosit OpenAI, modelul este cel setat în Supabase Edge Function.'
}

function unavailableAnswer(language: string) {
  return language === 'de'
    ? 'Die KI ist momentan nicht verfuegbar. Bitte pruefe die Edge Function.'
    : 'AI-ul nu este disponibil momentan. Verifică Edge Function.'
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
