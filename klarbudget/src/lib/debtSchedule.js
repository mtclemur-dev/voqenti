import { dueDateInMonth } from './debtAutoPay'
import { isoDate, parseLocalDate, startOfDay, toNumber } from './finance'

export function debtPlanStartDate(debt) {
  if (debt.first_payment_date) return parseLocalDate(debt.first_payment_date)
  if (debt.created_at) return startOfDay(new Date(debt.created_at))
  return null
}

const MAX_MONTHS = 120

/** Zi scadență: întotdeauna din data primei rate (evită dezacord cu payment_due_day vechi). */
export function debtDueDay(debt) {
  const start = debtPlanStartDate(debt)
  if (start) return start.getDate()
  const explicit = toNumber(debt.payment_due_day)
  if (explicit >= 1 && explicit <= 31) return explicit
  return 0
}

export function effectiveStartingTotal(debt) {
  const explicit = toNumber(debt.starting_total)
  if (explicit > 0) return explicit
  const fromParts = toNumber(debt.initial_amount) + toNumber(debt.final_payment)
  if (fromParts > 0) return fromParts
  const initFinal = toNumber(debt.initial_final_payment)
  return toNumber(debt.initial_amount) + initFinal
}

/** Scadențe lunare: prima dată = first_payment_date, apoi aceeași zi în fiecare lună. */
export function dueDatesUpToToday(debt, today = new Date()) {
  const firstDue = debtPlanStartDate(debt)
  const monthly = toNumber(debt.monthly_payment)
  if (!firstDue || monthly <= 0) return []

  const end = startOfDay(today)
  const dueDay = firstDue.getDate()
  const dates = []
  let due = startOfDay(firstDue)
  let guard = 0

  while (guard < MAX_MONTHS) {
    if (due > end) break
    dates.push(isoDate(due))
    const nextMonth = new Date(due.getFullYear(), due.getMonth() + 1, 1)
    due = dueDateInMonth(nextMonth.getFullYear(), nextMonth.getMonth(), dueDay)
    guard += 1
  }
  return dates
}

export function monthKeyFromDate(dateIso) {
  const parsed = parseLocalDate(dateIso)
  if (!parsed) return ''
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`
}

/** Plan automat: fiecare lună → rată standard. */
export function buildAutoSchedule(debt, today = new Date()) {
  const monthly = toNumber(debt.monthly_payment)
  return dueDatesUpToToday(debt, today).map((payment_date) => ({
    payment_date,
    amount: monthly,
    source: 'schedule',
  }))
}

/** Log existent indexat pe lună (YYYY-MM). */
export function paymentsByMonth(paymentRows = [], debtId) {
  const map = new Map()
  paymentRows
    .filter((row) => row.debt_id === debtId && row.payment_type === 'debt')
    .forEach((row) => {
      const key = monthKeyFromDate(row.payment_date)
      if (!key) return
      map.set(key, row)
    })
  return map
}

/**
 * Îmbină planul cu logul: lunile din plan fără intrare → rată standard;
 * intrările existente se păstrează (editabile manual).
 */
export function mergeScheduleWithLog(debt, paymentRows = [], today = new Date()) {
  const schedule = buildAutoSchedule(debt, today)
  const byMonth = paymentsByMonth(paymentRows, debt.id)
  const usedIds = new Set()

  const merged = schedule.map((slot) => {
    const key = monthKeyFromDate(slot.payment_date)
    const existing = byMonth.get(key)
    if (existing) {
      usedIds.add(existing.id)
      return {
        id: existing.id,
        payment_date: existing.payment_date,
        amount: toNumber(existing.amount),
        persisted: true,
        notes: existing.notes || '',
      }
    }
    return {
      id: null,
      payment_date: slot.payment_date,
      amount: slot.amount,
      persisted: false,
      notes: 'schedule',
    }
  })

  paymentRows
    .filter((row) => row.debt_id === debt.id && row.payment_type === 'debt' && !usedIds.has(row.id))
    .forEach((row) => {
      merged.push({
        id: row.id,
        payment_date: row.payment_date,
        amount: toNumber(row.amount),
        persisted: true,
        notes: row.notes || 'manual',
      })
    })

  merged.sort((a, b) => String(a.payment_date).localeCompare(String(b.payment_date)))
  return merged
}

export function computeRemainingFromSchedule(debt, paymentRows = [], today = new Date()) {
  const starting = effectiveStartingTotal(debt)
  if (starting <= 0 || !debtPlanStartDate(debt)) return null

  const merged = mergeScheduleWithLog(debt, paymentRows, today)
  const schluss = toNumber(debt.final_payment)
  let paid = merged.reduce((sum, row) => sum + toNumber(row.amount), 0)
  paid = Math.min(paid, starting)
  const left = Math.max(0, Math.round((starting - paid) * 100) / 100)

  const principalLeft = Math.max(0, Math.round((left - schluss) * 100) / 100)
  const finalLeft = Math.max(0, Math.round(Math.min(schluss, left) * 100) / 100)

  return {
    remaining_balance: principalLeft >= 0 ? principalLeft : left,
    final_payment: finalLeft,
    paidTotal: paid,
    leftTotal: left,
    installmentCount: merged.length,
  }
}

export function prepareDebtSaveFields(values) {
  const result = { ...values }
  const monthly = toNumber(result.monthly_payment)

  if (result.first_payment_date) {
    const d = parseLocalDate(result.first_payment_date)
    if (d) result.payment_due_day = d.getDate()
  }

  if (!toNumber(result.starting_total)) {
    result.starting_total = effectiveStartingTotal(result)
  }
  const starting = toNumber(result.starting_total)

  if (starting > 0) {
    result.initial_amount = starting - toNumber(result.final_payment)
    if (toNumber(result.initial_amount) < 0) result.initial_amount = starting
  }

  if (starting > 0 && monthly > 0 && result.first_payment_date) {
    const preview = computeRemainingFromSchedule(
      { ...result, id: 'preview' },
      [],
      new Date(),
    )
    if (preview) {
      result.remaining_balance = preview.remaining_balance
      if (toNumber(result.final_payment) > 0) {
        result.final_payment = preview.final_payment
      }
    }
  } else if (toNumber(result.remaining_balance) === 0 && starting > 0) {
    result.remaining_balance = starting - toNumber(result.final_payment)
  }

  return result
}

/** Rânduri de plată care lipsesc din log pentru lunile scadente până azi. */
export function missingSchedulePaymentSlots(debt, paymentRows = [], today = new Date()) {
  return mergeScheduleWithLog(debt, paymentRows, today).filter((row) => !row.persisted)
}
