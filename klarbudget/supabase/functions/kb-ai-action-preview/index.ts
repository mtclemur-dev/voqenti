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
    console.error('kb-ai-action-preview error', { message: error?.message, name: error?.name })
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

  try {
    return mode === 'question'
      ? await askOpenAiQuestion(openAiKey, prompt, language, context)
      : await buildOpenAiAction(openAiKey, prompt, language, classifiedIntent)
  } catch (error) {
    console.error('kb-ai-action-preview OpenAI call failed', { message: error?.message, name: error?.name })
    return mode === 'question'
      ? { kind: 'answer', answer: unavailableAnswer(language) }
      : { kind: 'clarification', intent: classifiedIntent, message: 'openai_unavailable', summary: String(error?.message || '') }
  }
}

async function askOpenAiQuestion(openAiKey: string, prompt: string, language: string, context: unknown): Promise<AIResult> {
  if (isModelQuestion(prompt)) return { kind: 'answer', answer: modelAnswer(language) }

  const response = await callOpenAi(openAiKey, {
    model: Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini',
    input: [
      {
        role: 'system',
        content: [
          'You are KlarBudget AI. Answer budget questions concisely and safely.',
          'Do not create, update, or delete records.',
          'If the user asks to perform an action, tell them to use the action preview flow.',
          'Answer in the requested language.',
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
    model: Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini',
    input: [
      {
        role: 'system',
        content: [
          'You convert KlarBudget user requests into safe JSON action previews.',
          'Never execute actions. Always return requires_confirmation true.',
          'Never return destructive actions for delete requests.',
          'Supported action_type values: create_income, create_expense, create_debt, create_google_event, create_one_time_expense, update_debt_final_payment.',
          'For one-time expenses use action_type create_one_time_expense and data.expense_kind one_time_expense.',
          'Use frequency values only: monthly, quarterly, semiannual, yearly, once.',
          'Use payment_mode values only: automatic_debit, manual_payment, variable_tracking.',
          'Use expense_kind values only: fixed_payment, variable_budget, one_time_expense.',
          'Dates must be YYYY-MM-DD when the user provides enough information.',
          'Return only valid JSON.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `Language: ${language}`,
          `Classified intent: ${intent}`,
          `Request: ${prompt}`,
          'JSON shape:',
          '{"kind":"action","intent":"create_expense","action_type":"create_expense","data":{},"confidence":0.9,"requires_confirmation":true,"summary":"short summary"}',
        ].join('\n'),
      },
    ],
  })

  const parsed = parseJsonObject(extractOutputText(response))
  if (!parsed || parsed.kind !== 'action') {
    return { kind: 'clarification', intent, message: 'ask_user_action_or_answer' }
  }

  return {
    kind: 'action',
    intent,
    action_type: String(parsed.action_type || intent),
    data: normalizeActionData(parsed.data || {}, intent),
    confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0,
    requires_confirmation: true,
    summary: String(parsed.summary || prompt),
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

function parseJsonObject(text: string) {
  try {
    return JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0])
    } catch {
      return null
    }
  }
}

function normalizeActionData(data: Record<string, unknown>, intent: string) {
  const next = { ...data }
  if (intent === 'create_one_time_expense') {
    next.expense_kind = 'one_time_expense'
    next.frequency = 'once'
    next.expense_type = 'variable'
    next.payment_mode = 'manual_payment'
  }
  if (intent === 'create_expense') {
    next.expense_kind = next.expense_kind || 'fixed_payment'
    next.frequency = next.frequency || 'monthly'
    next.expense_type = next.expense_type || 'fixed'
    next.payment_mode = next.payment_mode || 'automatic_debit'
  }
  return next
}

function classifyIntent(prompt: string) {
  const text = normalizePrompt(prompt)
  if (/(sterge|delete|loschen|loeschen|remove)/i.test(text)) return 'blocked_delete'
  if (/^(ce|cine|cum|de ce|cat|pot|care|unde|cand|wann|warum|wie|was|welches)\b|\?$/.test(text.trim())) return 'question'
  if (/(adaug|adauga|creeaz|creeaza|creaza|pune|registreaza|inregistreaza|hinzuf|erstell|create|add)/i.test(text)) {
    if (/(venit|salariu|income|einnahme|gehalt)/i.test(text)) return 'create_income'
    if (/(datorie|credit|schuld|schlussrate)/i.test(text)) return 'create_debt'
    if (/(calendar|programare|termin|reminder|reamintire|tuv)/i.test(text)) return 'create_calendar_event'
    if (/(unic|o singura data|einmalig|plata unica|cheltuiala unica)/i.test(text)) return 'create_one_time_expense'
    if (/(cheltuial|plata|expense|ausgabe|lidl|kaufland|netflix|telekom)/i.test(text)) return 'create_expense'
  }
  if (/(modifica|schimba|actualizeaza|update|change|andern|aendern)/i.test(text)) return 'update_record'
  return 'unknown'
}

function isModelQuestion(prompt: string) {
  return /(ce model|model de ai|what model|welches modell|ki modell|ai model)/i.test(normalizePrompt(prompt))
}

function normalizePrompt(prompt: string) {
  return String(prompt || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function modelAnswer(language: string) {
  if (language === 'de') {
    return 'Ich bin ueber das KlarBudget AI-Modul verbunden. Das genaue Modell haengt von der Backend-Konfiguration ab. Wenn OpenAI verwendet wird, ist es das Modell, das in der Supabase Edge Function gesetzt ist.'
  }
  return 'Sunt conectat prin modulul AI KlarBudget. Modelul exact depinde de configuratia backend-ului. Daca este folosit OpenAI, modelul este cel setat in Supabase Edge Function.'
}

function unavailableAnswer(language: string) {
  return language === 'de'
    ? 'Die KI ist momentan nicht verfuegbar. Bitte pruefe die Edge Function.'
    : 'AI-ul nu este disponibil momentan. Verifica Edge Function.'
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
