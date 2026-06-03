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

export function classifyIntent() {
  return 'disabled'
}

export function isQuestionPrompt() {
  return false
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

export async function requestAiQuestion() {
  return {
    kind: 'answer',
    unavailable: true,
    answer: 'AI-ul direct in aplicatie este dezactivat momentan. Foloseste Export pentru ChatGPT.',
  }
}

export async function requestAiActionPreview() {
  return {
    kind: 'clarification',
    intent: 'disabled',
    message: 'ai_disabled',
  }
}
