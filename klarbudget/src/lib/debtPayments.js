import { applyDebtInstallment } from './debtAutoPay'
import { computeRemainingFromSchedule } from './debtSchedule'
import { debtRemainingTotal, formatMoney, isoDate, toNumber } from './finance'

export { debtPlanStartDate } from './debtSchedule'

export function debtPaymentsForId(payments = [], debtId) {
  return payments
    .filter((row) => row.debt_id === debtId && row.payment_type === 'debt')
    .sort((a, b) => String(b.payment_date).localeCompare(String(a.payment_date)))
}

export function sumDebtPayments(payments = [], debtId) {
  return debtPaymentsForId(payments, debtId).reduce((sum, row) => sum + toNumber(row.amount), 0)
}

/** Sold la deschiderea planului (principal + Schlussrate). */
export function debtOpeningBalances(debt) {
  const starting = debtStartingTotal(debt, [])
  const storedFinal = toNumber(debt.initial_final_payment ?? debt.final_payment)
  const storedPrincipal = toNumber(debt.initial_amount)
  if (toNumber(debt.starting_total) > 0) {
    const finalPart = Math.min(storedFinal, starting)
    let principalPart = starting - finalPart
    if (principalPart < 0) {
      principalPart = starting
      return { remaining_balance: principalPart, final_payment: 0 }
    }
    return { remaining_balance: principalPart, final_payment: finalPart }
  }
  if (storedPrincipal + storedFinal > 0) {
    return { remaining_balance: storedPrincipal, final_payment: storedFinal }
  }
  const left = debtRemainingTotal(debt)
  return { remaining_balance: left, final_payment: 0 }
}

/** Total contract: starting_total sau initial + plăți + sold curent. */
export function debtStartingTotal(debt, payments = []) {
  const explicit = toNumber(debt.starting_total)
  if (explicit > 0) return explicit
  const paid = sumDebtPayments(payments, debt.id)
  const left = debtRemainingTotal(debt)
  if (paid > 0) return paid + left
  const initFinal = toNumber(debt.initial_final_payment ?? debt.final_payment)
  const fromInitial = toNumber(debt.initial_amount) + initFinal
  if (fromInitial > 0) return fromInitial
  return left
}

export function debtUsesSchedule(debt) {
  return (
    toNumber(debt.starting_total) > 0
    && toNumber(debt.monthly_payment) > 0
    && Boolean(debt.first_payment_date)
  )
}

export function debtPaidSummary(debt, payments = []) {
  const total = debtStartingTotal(debt, payments)
  if (debtUsesSchedule(debt)) {
    const schedule = computeRemainingFromSchedule(debt, payments, new Date())
    if (schedule) {
      const paid = Math.min(schedule.paidTotal, total)
      const left = Math.min(schedule.leftTotal, total)
      const percent = total > 0 ? Math.round((paid / total) * 100) : 0
      return { paid, total, left, percent, paidFromLog: paid }
    }
  }

  const paidFromLog = sumDebtPayments(payments, debt.id)
  const leftStored = debtRemainingTotal(debt)
  let paid = paidFromLog
  let left = leftStored

  if (paidFromLog > 0) {
    left = Math.max(0, Math.round((total - paidFromLog) * 100) / 100)
  } else {
    paid = Math.max(0, Math.round((total - leftStored) * 100) / 100)
  }

  if (left > total) left = total
  if (paid > total) paid = total

  const percent = total > 0 ? Math.round((paid / total) * 100) : 0
  return { paid, total, left, percent, paidFromLog }
}

export function balancesAfterPayments(debt, paymentRows = []) {
  let working = { ...debtOpeningBalances(debt), status: debt.status }
  const sorted = [...paymentRows]
    .filter((row) => row.payment_type === 'debt')
    .sort((a, b) => String(a.payment_date).localeCompare(String(b.payment_date)))

  for (const row of sorted) {
    Object.assign(working, applyDebtInstallment(working, toNumber(row.amount)))
  }
  return working
}

export function syncDebtBalancesFromPayments(debt, paymentRows = []) {
  if (debtUsesSchedule(debt)) {
    const computed = computeRemainingFromSchedule(debt, paymentRows, new Date())
    if (computed) {
      const totalLeft = computed.leftTotal
      const status = totalLeft <= 0.005 ? 'paid' : debt.status === 'paused' ? 'paused' : 'active'
      return {
        remaining_balance: computed.remaining_balance,
        final_payment: computed.final_payment,
        status,
      }
    }
  }

  const working = balancesAfterPayments(debt, paymentRows)
  const totalLeft = toNumber(working.remaining_balance) + toNumber(working.final_payment)
  const status = totalLeft <= 0.005 ? 'paid' : debt.status === 'paused' ? 'paused' : 'active'
  return {
    remaining_balance: working.remaining_balance,
    final_payment: working.final_payment,
    status,
  }
}

/** Verifică dacă soldul din DB diferă de istoricul plăților. */
export function debtBalanceMismatch(debt, payments = []) {
  if (debtUsesSchedule(debt)) {
    const expected = computeRemainingFromSchedule(debt, payments, new Date())
    if (expected) {
      const diffPrincipal = Math.abs(toNumber(debt.remaining_balance) - toNumber(expected.remaining_balance))
      const diffFinal = Math.abs(toNumber(debt.final_payment) - toNumber(expected.final_payment))
      return diffPrincipal > 0.02 || diffFinal > 0.02
    }
  }

  const expected = balancesAfterPayments(debt, payments)
  const diffPrincipal = Math.abs(toNumber(debt.remaining_balance) - toNumber(expected.remaining_balance))
  const diffFinal = Math.abs(toNumber(debt.final_payment) - toNumber(expected.final_payment))
  return diffPrincipal > 0.02 || diffFinal > 0.02
}

export function formatDebtProgressLine(debt, payments, currency, locale, t) {
  const { paid, total, percent } = debtPaidSummary(debt, payments)
  return (t?.('debtPaidProgress') || 'Plătit {paid} din {total} ({percent}%)')
    .replace('{paid}', formatMoney(paid, currency, locale))
    .replace('{total}', formatMoney(total, currency, locale))
    .replace('{percent}', String(percent))
}

export function buildDebtPaymentRow(debt, amount, paymentDate, userId, notes = '') {
  return {
    user_id: userId,
    debt_id: debt.id,
    name: debt.name,
    amount: Math.round(toNumber(amount) * 100) / 100,
    payment_date: paymentDate || isoDate(new Date()),
    payment_type: 'debt',
    notes,
  }
}

export function autoPaymentRowsFromSteps(steps = [], userId) {
  return steps.map((step) => ({
    user_id: userId,
    debt_id: step.debt_id,
    name: step.debt_name,
    amount: Math.round(toNumber(step.amount) * 100) / 100,
    payment_date: step.due_date,
    payment_type: 'debt',
    notes: 'auto',
  }))
}

