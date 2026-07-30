import { isoDate, parseLocalDate, toNumber } from './finance'

const MAX_CATCHUP_MONTHS = 60

/** Due date for a given calendar month (clamps day to month length). */
export function dueDateInMonth(year, monthIndex, dueDay) {
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const day = Math.min(Math.max(1, dueDay), daysInMonth)
  return new Date(year, monthIndex, day)
}

/** First unpaid due date on/after debt creation, not after today. */
export function firstEligibleDueDate(debt, dueDay, today = new Date()) {
  const created = debt.created_at ? new Date(debt.created_at) : today
  const start = new Date(created.getFullYear(), created.getMonth(), created.getDate())
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1)

  while (cursor <= today) {
    const due = dueDateInMonth(cursor.getFullYear(), cursor.getMonth(), dueDay)
    if (due >= start && due <= today) return due
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return null
}

/** Next due date strictly after lastAutoIso, if still <= today. */
export function nextDueAfter(lastAutoIso, dueDay, today = new Date()) {
  const last = parseLocalDate(lastAutoIso)
  if (!last) return null
  const cursor = new Date(last.getFullYear(), last.getMonth() + 1, 1)
  const due = dueDateInMonth(cursor.getFullYear(), cursor.getMonth(), dueDay)
  return due <= today ? due : null
}

/** Apply one monthly installment to remaining_balance, then final_payment. */
export function applyDebtInstallment(debt, installment) {
  let remaining = toNumber(debt.remaining_balance)
  let finalPay = toNumber(debt.final_payment)
  let left = Math.max(0, installment)

  const fromRemaining = Math.min(left, remaining)
  remaining -= fromRemaining
  left -= fromRemaining

  const fromFinal = Math.min(left, finalPay)
  finalPay -= fromFinal

  const totalLeft = remaining + finalPay
  const status = totalLeft <= 0.005 ? 'paid' : debt.status

  return {
    remaining_balance: Math.max(0, Math.round(remaining * 100) / 100),
    final_payment: Math.max(0, Math.round(finalPay * 100) / 100),
    status,
  }
}

/**
 * Compute pending auto-payments for one debt (pure, no DB).
 */
export function planDebtAutoPayments(debt, today = new Date()) {
  if (debt.status !== 'active') return []
  const dueDay = toNumber(debt.payment_due_day)
  const monthly = toNumber(debt.monthly_payment)
  if (dueDay < 1 || dueDay > 31 || monthly <= 0) return []

  const working = { ...debt }
  const plans = []
  let lastAuto = debt.last_auto_payment_date || null
  let guard = 0

  while (guard < MAX_CATCHUP_MONTHS) {
    const totalLeft = toNumber(working.remaining_balance) + toNumber(working.final_payment)
    if (totalLeft <= 0.005) break

    const nextDue = lastAuto
      ? nextDueAfter(lastAuto, dueDay, today)
      : firstEligibleDueDate(debt, dueDay, today)

    if (!nextDue) break

    const amount = Math.min(monthly, totalLeft)
    const patch = applyDebtInstallment(working, amount)
    Object.assign(working, patch)

    plans.push({
      dueDateIso: isoDate(nextDue),
      amount,
      patch: {
        remaining_balance: working.remaining_balance,
        final_payment: working.final_payment,
        status: working.status,
        last_auto_payment_date: isoDate(nextDue),
      },
    })

    lastAuto = isoDate(nextDue)
    guard += 1
  }

  return plans
}

/**
 * Apply automatic debt payments in Supabase.
 */
export async function applyAutomaticDebtPayments(supabase, debts = [], userId) {
  if (!supabase || !userId || !debts.length) {
    return { updated: false, appliedCount: 0, debts, payments: [], schemaMissing: false }
  }

  const today = new Date()
  let appliedCount = 0
  let schemaMissing = false
  const payments = []
  const debtMap = new Map(debts.map((d) => [d.id, { ...d }]))

  for (const debt of debts) {
    const plans = planDebtAutoPayments(debt, today)
    if (!plans.length) continue

    let latestPatch = null
    for (const step of plans) {
      latestPatch = step.patch
      payments.push({
        debt_id: debt.id,
        debt_name: debt.name,
        due_date: step.dueDateIso,
        amount: step.amount,
      })
      appliedCount += 1
    }

    const { error } = await supabase
      .from('kb_debts')
      .update(latestPatch)
      .eq('id', debt.id)
      .eq('user_id', userId)

    if (error) {
      if (/payment_due_day|last_auto_payment_date/i.test(error.message || '')) {
        schemaMissing = true
        break
      }
      console.warn('debt auto-pay failed', debt.id, error.message)
      continue
    }

    debtMap.set(debt.id, { ...debtMap.get(debt.id), ...latestPatch })
  }

  if (schemaMissing) {
    return { updated: false, appliedCount: 0, debts, payments: [], schemaMissing: true }
  }

  return {
    updated: appliedCount > 0,
    appliedCount,
    debts: debts.map((d) => debtMap.get(d.id) || d),
    payments,
    schemaMissing: false,
  }
}
