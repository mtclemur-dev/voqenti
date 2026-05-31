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
  const actionType = action.action_type || 'unknown'
  return {
    action_type: actionType,
    data: action.data || {},
    confidence: typeof action.confidence === 'number' ? action.confidence : 0.5,
    requires_confirmation: true,
    risk_level: isRiskyAiAction(action) ? 'high' : 'normal',
    summary: action.summary || '',
  }
}

export async function requestAiActionPreview(prompt, language = 'ro') {
  const { data, error } = await supabase.functions.invoke('kb-ai-action-preview', {
    body: { prompt, language },
  })
  if (error) throw error
  return normalizeAiAction(data)
}

export function localAiActionPreview(prompt) {
  const text = prompt.toLowerCase()
  if (/(sterge|șterge|delete|löschen|loeschen)/i.test(text)) {
    return normalizeAiAction({
      action_type: 'unsupported',
      data: { reason: 'delete_requests_are_blocked' },
      confidence: 0.9,
      summary: prompt,
    })
  }
  if (/(credit|datorie|schuld|schulden|schlussrate|rata finala|rată finală)/i.test(text)) {
    return normalizeAiAction({
      action_type: /(schlussrate|rata finala|rată finală)/i.test(text) && !/(adauga|adaugă|nou)/i.test(text)
        ? 'update_debt_final_payment'
        : 'create_debt',
      data: inferDebtData(prompt),
      confidence: 0.62,
      summary: prompt,
    })
  }
  if (/(venit|salariu|income|einnahme|gehalt)/i.test(text)) {
    return normalizeAiAction({
      action_type: 'create_income',
      data: {
        name: inferName(prompt, ['venit', 'salariu', 'income', 'einnahme', 'gehalt']) || 'Venit',
        amount: inferFirstAmount(prompt),
        frequency: 'monthly',
        active: true,
      },
      confidence: 0.58,
      summary: prompt,
    })
  }
  if (/(calendar|programare|termin|reminder|reamintire)/i.test(text)) {
    return normalizeAiAction({
      action_type: 'create_google_event',
      data: inferCalendarData(prompt),
      confidence: 0.55,
      summary: prompt,
    })
  }
  return normalizeAiAction({
    action_type: /(unic|o singura data|o singură dată|einmalig)/i.test(text) ? 'create_one_time_expense' : 'create_expense',
    data: inferExpenseData(prompt),
    confidence: 0.45,
    summary: prompt,
  })
}

function inferDebtData(prompt) {
  const monthly = inferAmountNear(prompt, /(lunar|rate|rata|rată|monat|monthly)/i)
  const finalPayment = inferAmountNear(prompt, /(schlussrate|finala|finală|final)/i)
  const amount = inferFirstAmount(prompt)
  return {
    name: inferName(prompt, ['adauga', 'adaugă', 'datorie', 'credit']) || 'Datorie noua',
    debt_category: /auto|masina|mașina|wagen/i.test(prompt) ? 'credit_auto' : 'credit_consum',
    initial_amount: amount || 0,
    remaining_balance: amount || 0,
    monthly_payment: monthly || 0,
    final_payment: finalPayment || 0,
    interest_rate: 0,
    estimated_end_date: inferDate(prompt) || null,
    priority: 3,
    status: 'active',
  }
}

function inferExpenseData(prompt) {
  const amount = inferFirstAmount(prompt)
  const oneTime = /(unic|o singura data|o singură dată|einmalig)/i.test(prompt)
  const variable = /(mancare|mâncare|haine|motorina|motorină|copii|timp liber|buget)/i.test(prompt)
  return {
    name: inferName(prompt, ['adauga', 'adaugă', 'cheltuiala', 'cheltuială', 'plata', 'plată']) || 'Cheltuiala',
    category: variable ? 'mâncare' : 'altele',
    amount,
    expense_kind: oneTime ? 'one_time_expense' : variable ? 'variable_budget' : 'fixed_payment',
    frequency: oneTime ? 'once' : 'monthly',
    due_date: oneTime ? inferDate(prompt) : variable ? null : inferDate(prompt),
    expense_type: variable || oneTime ? 'variable' : 'fixed',
    payment_mode: variable ? 'variable_tracking' : oneTime ? 'manual_payment' : 'automatic_debit',
    active: true,
  }
}

function inferCalendarData(prompt) {
  return {
    title: inferName(prompt, ['adauga', 'adaugă', 'programare', 'termin', 'calendar', 'reminder', 'reamintire']) || 'Programare',
    date: inferDate(prompt) || '',
    time: inferTime(prompt) || '09:00',
    durationMinutes: 60,
    reminderMinutes: /zi|tag/i.test(prompt) ? 1440 : 30,
    location: '',
    notes: prompt,
  }
}

function inferFirstAmount(text) {
  const match = text.match(/(\d+(?:[.,]\d{1,2})?)\s*(eur|€)?/i)
  return match ? Number(match[1].replace(',', '.')) : 0
}

function inferAmountNear(text, pattern) {
  const matches = [...text.matchAll(/(\d+(?:[.,]\d{1,2})?)\s*(eur|€)?/gi)]
  const keywordIndex = text.search(pattern)
  if (keywordIndex < 0 || matches.length === 0) return 0
  const closest = matches.sort((a, b) => Math.abs(a.index - keywordIndex) - Math.abs(b.index - keywordIndex))[0]
  return Number(closest[1].replace(',', '.'))
}

function inferDate(text) {
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/)
  if (iso) return iso[0]
  const monthYear = text.match(/\b(ianuarie|februarie|martie|aprilie|mai|iunie|iulie|august|septembrie|octombrie|noiembrie|decembrie|januar|februar|marz|märz|april|mai|juni|juli|august|september|oktober|november|dezember)\s+(20\d{2})\b/i)
  if (!monthYear) return null
  const months = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie']
  const deMonths = ['januar', 'februar', 'marz', 'märz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember']
  const clean = monthYear[1].toLowerCase()
  let month = months.indexOf(clean) + 1
  if (month <= 0) {
    const deIndex = deMonths.indexOf(clean)
    month = deIndex >= 2 ? deIndex : deIndex + 1
  }
  return `${monthYear[2]}-${String(month).padStart(2, '0')}-01`
}

function inferTime(text) {
  const match = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/)
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : null
}

function inferName(prompt, wordsToRemove = []) {
  let cleaned = prompt
  wordsToRemove.forEach((word) => {
    cleaned = cleaned.replace(new RegExp(word, 'ig'), '')
  })
  cleaned = cleaned
    .replace(/\d+(?:[.,]\d{1,2})?\s*(eur|€)?/ig, '')
    .replace(/\b(lunar|monatlich|monthly|in|cu|mit|si|și|und|la|pe|pentru)\b/ig, '')
    .replace(/[.,]/g, ' ')
    .trim()
  return cleaned.split(/\s+/).slice(0, 4).join(' ')
}
