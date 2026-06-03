import { supabase } from '../supabaseClient'
import { toNumber } from './finance'

export const safeActionTypes = [
  'create_income',
  'create_expense',
  'create_debt',
  'create_google_event',
  'create_one_time_expense',
  'update_debt_final_payment',
]

const riskyActionTypes = ['delete_debt', 'delete_expense', 'update_debt_balance', 'create_google_event']

export function classifyIntent(prompt) {
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

export function isQuestionPrompt(prompt) {
  return classifyIntent(prompt) === 'question'
}

export function isRiskyAiAction(action) {
  if (!action) return false
  if (riskyActionTypes.includes(action.action_type)) return true
  const data = action.data || {}
  const amount = Math.max(
    toNumber(data.amount),
    toNumber(data.initial_amount),
    toNumber(data.remaining_balance),
    toNumber(data.final_payment),
    toNumber(data.monthly_payment),
  )
  return amount > 500
}

export function normalizeAiAction(rawAction) {
  const action = rawAction || {}
  return {
    kind: 'action',
    intent: action.intent || action.action_type || 'unknown',
    action_type: action.action_type || 'unknown',
    data: action.data || {},
    confidence: typeof action.confidence === 'number' ? action.confidence : 0,
    requires_confirmation: true,
    risk_level: isRiskyAiAction(action) ? 'high' : 'normal',
    summary: action.summary || '',
  }
}

export async function requestAiQuestion(prompt, context = {}) {
  if (isModelQuestion(prompt)) return localModelAnswer()
  try {
    const { data, error } = await supabase.functions.invoke('kb-ai-action-preview', {
      body: { prompt, language: context.language || 'ro', mode: 'question', context },
    })
    if (error) throw error
    if (data?.kind === 'answer' && data.answer) return data
    return { kind: 'answer', answer: data?.answer || context.t?.('aiNoAnswer') || 'AI-ul nu a returnat un raspuns text.' }
  } catch (error) {
    console.error('KlarBudget AI question error', sanitizeError(error))
    return {
      kind: 'answer',
      unavailable: true,
      answer: context.t?.('aiUnavailable') || 'AI-ul nu este disponibil momentan. Verifica Edge Function.',
    }
  }
}

export async function requestAiActionPreview(prompt, language = 'ro') {
  const intent = classifyIntent(prompt)
  if (intent === 'question') return { kind: 'answer', intent, answer: 'question' }
  if (intent === 'unknown') return { kind: 'clarification', intent, message: 'clarify' }
  if (intent === 'blocked_delete') return { kind: 'clarification', intent, message: 'blocked_delete' }

  try {
    const { data, error } = await supabase.functions.invoke('kb-ai-action-preview', {
      body: { prompt, language, mode: 'action', intent },
    })
    if (error) throw error
    if (data?.kind === 'clarification' || data?.kind === 'answer') return data
    return normalizeAiAction(data)
  } catch (error) {
    console.error('KlarBudget AI action preview error', sanitizeError(error))
    return {
      kind: 'error',
      intent,
      message: 'edge_function_failed',
    }
  }
}

function isModelQuestion(prompt) {
  return /(ce model|model de ai|what model|welches modell|ki modell|ai model)/i.test(normalizePrompt(prompt))
}

function localModelAnswer() {
  return {
    kind: 'answer',
    answer: 'Sunt conectat prin modulul AI KlarBudget. Modelul exact depinde de configuratia backend-ului. Daca este folosit OpenAI, modelul este cel setat in Supabase Edge Function.',
  }
}

function normalizePrompt(prompt) {
  return String(prompt || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function sanitizeError(error) {
  return {
    name: error?.name,
    message: error?.message,
    status: error?.status,
    context: error?.context,
  }
}
