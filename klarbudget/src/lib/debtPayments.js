import { applyDebtInstallment } from './debtAutoPay'
import { debtRemainingTotal, formatMoney, isoDate, toNumber } from './finance'

export function debtPaymentsForId(payments = [], debtId) {
  return payments
    .filter((row) => row.debt_id === debtId && row.payment_type === 'debt')
    .sort((a, b) => String(b.payment_date).localeCompare(String(a.payment_date)))
}

export function sumDebtPayments(payments = [], debtId) {
  return debtPaymentsForId(payments, debtId).reduce((sum, row) => sum + toNumber(row.amount), 0)
}

/** Total contract ≈ plătit + rămas (funcționează și fără istoric complet). */
export function debtTotalOriginal(debt, payments = []) {
  const paid = sumDebtPayments(payments, debt.id)
  const left = debtRemainingTotal(debt)
  if (paid > 0) return paid + left
  const initFinal = toNumber(debt.initial_final_payment ?? debt.final_payment)
  return toNumber(debt.initial_amount) + initFinal
}

export function debtPaidSummary(debt, payments = []) {
  const paidFromLog = sumDebtPayments(payments, debt.id)
  const left = debtRemainingTotal(debt)
  const paid = paidFromLog > 0 ? paidFromLog : Math.max(0, debtTotalOriginal(debt, payments) - left)
  const total = paid + left
  const percent = total > 0 ? Math.round((paid / total) * 100) : 0
  return { paid, total, left, percent }
}

export function syncDebtBalancesFromPayments(debt, paymentRows = []) {
  const initFinal = toNumber(debt.initial_final_payment ?? debt.final_payment)
  let working = {
    remaining_balance: toNumber(debt.initial_amount),
    final_payment: initFinal,
    status: 'active',
  }
  const sorted = [...paymentRows]
    .filter((row) => row.payment_type === 'debt')
    .sort((a, b) => String(a.payment_date).localeCompare(String(b.payment_date)))
  for (const row of sorted) {
    Object.assign(working, applyDebtInstallment(working, toNumber(row.amount)))
  }
  const totalLeft = toNumber(working.remaining_balance) + toNumber(working.final_payment)
  working.status = totalLeft <= 0.005 ? 'paid' : debt.status === 'paused' ? 'paused' : 'active'
  return {
    remaining_balance: working.remaining_balance,
    final_payment: working.final_payment,
    status: working.status,
  }
}

export function formatDebtProgressLine(debt, payments, currency, locale, t) {
  const { paid, total, percent } = debtPaidSummary(debt, payments)
  const label = (t?.('debtPaidProgress') || 'Plătit {paid} din {total} ({percent}%)')
    .replace('{paid}', formatMoney(paid, currency, locale))
    .replace('{total}', formatMoney(total, currency, locale))
    .replace('{percent}', String(percent))
  return label
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
