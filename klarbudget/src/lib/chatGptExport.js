import {
  debtRemainingTotal,
  expenseKind,
  formatMoney,
  upcomingPayments,
  variableBudgetStats,
  toNumber,
} from './finance'

export function buildChatGptBudgetSummary({
  currency,
  debts,
  expenses,
  incomes,
  language,
  paymentStatuses,
  settings,
  summary,
  syncedAt,
}) {
  const locale = language === 'de' ? 'de-DE' : 'ro-RO'
  const now = new Date()
  const generatedAt = syncedAt || now
  const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(now)
  const next7 = upcomingPayments(expenses, 7, settings, now, paymentStatuses)
  const next14 = upcomingPayments(expenses, 14, settings, now, paymentStatuses)
  const activeDebts = debts.filter((debt) => debt.status === 'active' && debtRemainingTotal(debt) > 0)
  const smallDebts = activeDebts.filter((debt) => debtRemainingTotal(debt) <= 1000)
  const highInterestDebts = activeDebts.filter((debt) => toNumber(debt.interest_rate) >= 8)
  const noPaymentDebts = activeDebts.filter((debt) => toNumber(debt.monthly_payment) <= 0)
  const finalPaymentDebts = activeDebts.filter((debt) => toNumber(debt.final_payment) > 0)
  const variableBudgets = expenses.filter((expense) => expense.active && expenseKind(expense) === 'variable_budget')
  const foodBudgets = variableBudgets.filter((expense) => /mancare|mâncare|essen|food|lidl|kaufland/i.test(`${expense.name} ${expense.category}`))

  return [
    'Analizeaza bugetul meu KlarBudget si da-mi recomandari pentru urmatoarele 7 zile.',
    '',
    `Luna curenta: ${monthLabel}`,
    `Rezumat generat la: ${new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(generatedAt)}`,
    '',
    'Rezumat lunar:',
    `- Venit total lunar: ${formatMoney(summary.incomeTotal, currency, locale)}`,
    `- Cheltuieli fixe lunare: ${formatMoney(summary.fixedTotal, currency, locale)}`,
    `- Bugete variabile lunare: ${formatMoney(summary.variableTotal, currency, locale)}`,
    `- Cheltuieli unice luna curenta: ${formatMoney(summary.onceThisMonth, currency, locale)}`,
    `- Total datorii active: ${formatMoney(summary.debtTotal, currency, locale)}`,
    `- Rate lunare datorii: ${formatMoney(summary.debtPayments, currency, locale)}`,
    `- Bani ramasi estimat: ${formatMoney(summary.remaining, currency, locale)}`,
    `- Zile pana la salariu: ${summary.daysUntilSalary}`,
    `- Buget zilnic ramas: ${formatMoney(summary.dailyBudget, currency, locale)}/zi`,
    '',
    'Conturi si solduri reale:',
    `- Sold pozitiv total inclus: ${formatMoney(summary.accounts?.positiveTotal || 0, currency, locale)}`,
    `- Dispo folosit: ${formatMoney(summary.accounts?.overdraftUsed || 0, currency, locale)}`,
    `- Sold net actual: ${formatMoney(summary.accounts?.netBalance || 0, currency, locale)}`,
    `- Plati pana la salariu: ${formatMoney(summary.upcomingUntilSalaryTotal || 0, currency, locale)}`,
    `- Bugete variabile necesare pana la salariu: ${formatMoney(summary.accounts?.variableNeededUntilSalary || 0, currency, locale)}`,
    `- Rezerva minima: ${formatMoney(summary.accounts?.minimumReserve || 0, currency, locale)}`,
    `- Disponibil sigur real: ${formatMoney(summary.accounts?.safeAvailable || 0, currency, locale)}`,
    `- Dispo disponibil ramas, informativ: ${formatMoney(summary.accounts?.overdraftAvailable || 0, currency, locale)}`,
    '',
    'Plati urmatoare:',
    formatPayments('- Urmatoarele 7 zile', next7, currency, locale),
    formatPayments('- Urmatoarele 14 zile', next14, currency, locale),
    '',
    'Venituri active:',
    formatIncomeList(incomes, currency, locale),
    '',
    'Datorii active:',
    formatDebtList(activeDebts, currency, locale),
    '',
    'Datorii mici:',
    formatDebtList(smallDebts, currency, locale),
    '',
    'Datorii cu dobanda mare:',
    formatDebtList(highInterestDebts, currency, locale),
    '',
    'Datorii fara rata lunara:',
    formatDebtList(noPaymentDebts, currency, locale),
    '',
    'Credite cu Schlussrate / rata finala:',
    formatFinalPayments(finalPaymentDebts, currency, locale),
    '',
    'Bugete variabile:',
    formatVariableBudgets(variableBudgets, currency, locale),
    '',
    'Buget mancare:',
    formatVariableBudgets(foodBudgets, currency, locale),
    '',
    'Google Calendar:',
    '- Evenimentele Google Calendar sunt vizibile in ecranul Calendar dupa conectare. Exportul nu trimite automat date catre Google sau OpenAI.',
    '',
    'Te rog sa imi spui:',
    '- ce cheltuieli pot reduce in urmatoarele 7 zile',
    '- ce plati trebuie prioritizate',
    '- daca risc sa raman pe minus',
    '- ce datorie ar trebui atacata prima',
    '- ce suma pot pastra zilnic pana la salariu',
  ].join('\n')
}

function formatPayments(title, payments, currency, locale) {
  if (!payments.length) return `${title}: nu sunt plati planificate.`
  const total = payments.reduce((sum, item) => sum + toNumber(item.amount), 0)
  return [
    `${title}: ${formatMoney(total, currency, locale)}`,
    ...payments.map((item) => `  - ${item.name}: ${formatMoney(item.amount, currency, locale)}, data ${item.due_date_iso}, in ${item.days_until} zile`),
  ].join('\n')
}

function formatIncomeList(incomes, currency, locale) {
  const active = incomes.filter((income) => income.active)
  if (!active.length) return '- nu sunt venituri active.'
  return active.map((income) => `- ${income.name}: ${formatMoney(income.amount, currency, locale)}, ${income.frequency}`).join('\n')
}

function formatDebtList(debts, currency, locale) {
  if (!debts.length) return '- nu exista.'
  return debts.map((debt) => [
    `- ${debt.name}`,
    `sold ${formatMoney(debt.remaining_balance, currency, locale)}`,
    `rata ${formatMoney(debt.monthly_payment, currency, locale)}`,
    `dobanda ${toNumber(debt.interest_rate).toFixed(2)}%`,
    toNumber(debt.final_payment) > 0 ? `Schlussrate ${formatMoney(debt.final_payment, currency, locale)}` : '',
    `total ${formatMoney(debtRemainingTotal(debt), currency, locale)}`,
  ].filter(Boolean).join(', ')).join('\n')
}

function formatFinalPayments(debts, currency, locale) {
  if (!debts.length) return '- nu exista credite cu Schlussrate.'
  return debts.map((debt) => `- ${debt.name}: Schlussrate ${formatMoney(debt.final_payment, currency, locale)}, total ramas ${formatMoney(debtRemainingTotal(debt), currency, locale)}`).join('\n')
}

function formatVariableBudgets(expenses, currency, locale) {
  if (!expenses.length) return '- nu exista.'
  return expenses.map((expense) => {
    const stats = variableBudgetStats(expense)
    return `- ${expense.name} (${expense.category}): buget ${formatMoney(stats.budget, currency, locale)}, cheltuit ${formatMoney(stats.spent, currency, locale)}, ramas ${formatMoney(stats.remaining, currency, locale)}`
  }).join('\n')
}
