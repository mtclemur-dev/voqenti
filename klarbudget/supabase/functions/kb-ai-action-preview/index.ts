const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type AIAction = {
  action_type: string
  data: Record<string, unknown>
  confidence: number
  requires_confirmation: true
  summary?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { prompt = '', language = 'ro' } = await req.json()
    const action = await buildActionPreview(String(prompt), String(language))
    return json(action)
  } catch (error) {
    return json({ error: error.message || 'Invalid request' }, 400)
  }
})

async function buildActionPreview(prompt: string, language: string): Promise<AIAction> {
  const openAiKey = Deno.env.get('OPENAI_API_KEY')
  if (!openAiKey) return localPreview(prompt)

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openAiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: Deno.env.get('OPENAI_MODEL') || 'gpt-5-mini',
      input: [
        {
          role: 'system',
          content: [
            'You convert KlarBudget user requests into safe JSON action previews.',
            'Never execute actions. Always return requires_confirmation true.',
            'Never return destructive actions for delete requests; return action_type unsupported instead.',
            'Supported action_type values: create_income, create_expense, create_debt, create_google_event, create_one_time_expense, update_debt_final_payment.',
            'Return only JSON with action_type, data, confidence, requires_confirmation, summary.',
          ].join('\n'),
        },
        { role: 'user', content: `Language: ${language}\nRequest: ${prompt}` },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'klarbudget_action_preview',
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['action_type', 'data', 'confidence', 'requires_confirmation'],
            properties: {
              action_type: { type: 'string' },
              data: { type: 'object', additionalProperties: true },
              confidence: { type: 'number' },
              requires_confirmation: { type: 'boolean' },
              summary: { type: 'string' },
            },
          },
        },
      },
    }),
  })

  if (!response.ok) return localPreview(prompt)
  const result = await response.json()
  const text = result.output_text || result.output?.[0]?.content?.[0]?.text
  if (!text) return localPreview(prompt)
  const parsed = JSON.parse(text)
  return { ...parsed, requires_confirmation: true }
}

function localPreview(prompt: string): AIAction {
  const amount = Number(prompt.match(/(\d+(?:[.,]\d{1,2})?)/)?.[1]?.replace(',', '.') || 0)
  const lower = prompt.toLowerCase()
  if (/(sterge|șterge|delete|löschen|loeschen)/i.test(lower)) {
    return {
      action_type: 'unsupported',
      data: { reason: 'delete_requests_are_blocked' },
      confidence: 0.9,
      requires_confirmation: true,
      summary: prompt,
    }
  }
  if (/(credit|datorie|schuld|schlussrate)/i.test(lower)) {
    return {
      action_type: 'create_debt',
      data: {
        name: /auto|masina|mașina/i.test(lower) ? 'Credit auto' : 'Datorie noua',
        debt_category: /auto|masina|mașina/i.test(lower) ? 'credit_auto' : 'credit_consum',
        initial_amount: 0,
        remaining_balance: 0,
        monthly_payment: amount,
        final_payment: Number(prompt.match(/schlussrate\s*(\d+(?:[.,]\d{1,2})?)/i)?.[1]?.replace(',', '.') || 0),
        interest_rate: 0,
        priority: 3,
        status: 'active',
      },
      confidence: 0.45,
      requires_confirmation: true,
      summary: prompt,
    }
  }
  return {
    action_type: 'create_expense',
    data: {
      name: 'Cheltuiala',
      amount,
      category: 'altele',
      expense_kind: 'fixed_payment',
      frequency: 'monthly',
      expense_type: 'fixed',
      payment_mode: 'automatic_debit',
      active: true,
    },
    confidence: 0.35,
    requires_confirmation: true,
    summary: prompt,
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
