import {
  debtRemainingTotal,
  expenseKind,
  formatMoney,
  isoDate,
  upcomingPayments,
  variableBudgetStats,
  toNumber,
} from './finance'

export function buildChatGptBudgetSummary({
  currency,
  debts,
  expenses,
  incomes,
  journalEntries = [],
  language,
  paymentStatuses,
  settings,
  summary,
  syncedAt,
  utilityReadings = [],
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
  const todayKey = isoDate(now)
  const todayJournal = journalEntries.filter((item) => item.entry_date === todayKey)
  const todayJournalTotal = todayJournal.reduce((sum, item) => sum + toNumber(item.amount), 0)

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
    `- Cheltuieli reale introduse azi: ${formatMoney(todayJournalTotal, currency, locale)} (${todayJournal.length} intrari)`,
    '',
    'Conturi si solduri reale:',
    `- Sold pozitiv total inclus: ${formatMoney(summary.accounts?.positiveTotal || 0, currency, locale)}`,
    `- Dispo folosit: ${formatMoney(summary.accounts?.overdraftUsed || 0, currency, locale)}`,
    `- Sold net actual: ${formatMoney(summary.accounts?.netBalance || 0, currency, locale)}`,
    `- Plati pana la salariu: ${formatMoney(summary.upcomingUntilSalaryTotal || 0, currency, locale)}`,
    `- Bugete variabile necesare pana la salariu: ${formatMoney(summary.accounts?.variableNeededUntilSalary || 0, currency, locale)}`,
    `- Rezerva minima: ${formatMoney(summary.accounts?.minimumReserve || 0, currency, locale)}`,
    `- Proiectie disponibil pana la salariu: ${formatMoney(summary.accounts?.safeAvailable || 0, currency, locale)}`,
    `- Dispo disponibil ramas, informativ: ${formatMoney(summary.accounts?.overdraftAvailable || 0, currency, locale)} (credit disponibil, nu bani liberi)`,
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
    formatVariableBudgets(variableBudgets, currency, locale, journalEntries),
    '',
    'Buget mancare:',
    formatVariableBudgets(foodBudgets, currency, locale, journalEntries),
    '',
    'Utilitati - contoare, avans lunar si regularizare estimata:',
    formatUtilityReadings(utilityReadings, settings, currency, locale),
    '',
    'Jurnal zilnic - ultimele cheltuieli reale:',
    formatJournalEntries(journalEntries.slice(0, 20), currency, locale),
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

function formatJournalEntries(entries, currency, locale) {
  if (!entries.length) return '- nu exista cheltuieli reale introduse.'
  return entries.map((item) => `- ${item.entry_date}: ${item.description}, ${formatMoney(item.amount, currency, locale)}, ${item.category}${item.store ? `, ${item.store}` : ''}`).join('\n')
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

function formatVariableBudgets(expenses, currency, locale, journalEntries = []) {
  if (!expenses.length) return '- nu exista.'
  return expenses.map((expense) => {
    const stats = variableBudgetStats(expense, new Date(), journalEntries)
    return `- ${expense.name} (${expense.category}): buget ${formatMoney(stats.budget, currency, locale)}, cheltuit ${formatMoney(stats.spent, currency, locale)}, ramas ${formatMoney(stats.remaining, currency, locale)}`
  }).join('\n')
}

function formatUtilityReadings(readings = [], settings = {}, currency, locale) {
  if (!readings.length) return '- nu exista citiri de utilitati introduse.'

  const now = new Date()
  const currentYear = now.getFullYear()
  const monthsElapsed = now.getMonth() + 1
  const labels = {
    electricity: 'Curent / electricitate',
    gas: 'Gaz',
    water: 'Apa',
  }
  const units = {
    electricity: 'kWh',
    gas: 'm3',
    water: 'm3',
  }
  const priceKeys = {
    electricity: 'utility_price_electricity',
    gas: 'utility_price_gas',
    water: 'utility_price_water',
  }
  const paymentKeys = {
    electricity: 'utility_monthly_payment_electricity',
    gas: 'utility_monthly_payment_gas',
    water: 'utility_monthly_payment_water',
  }

  return ['electricity', 'gas', 'water'].map((meterType) => {
    const meterReadings = readings
      .filter((item) => item.meter_type === meterType)
      .sort((a, b) => String(a.reading_date).localeCompare(String(b.reading_date)))
    if (meterReadings.length < 2) {
      const latest = meterReadings[meterReadings.length - 1]
      return latest
        ? `- ${labels[meterType]}: exista o singura citire (${latest.reading_date}, index ${toNumber(latest.value).toFixed(2)} ${units[meterType]}). Mai trebuie o citire ca sa calculez consumul real.`
        : `- ${labels[meterType]}: nu exista citiri.`
    }

    const unitPrice = toNumber(settings[priceKeys[meterType]])
    const monthlyPayment = toNumber(settings[paymentKeys[meterType]])
    let currentYearConsumption = 0
    let currentYearCost = 0
    let currentYearDays = 0

    for (let i = 1; i < meterReadings.length; i++) {
      const previous = meterReadings[i - 1]
      const current = meterReadings[i]
      if (new Date(current.reading_date).getFullYear() !== currentYear) continue

      const consumption = toNumber(current.value) - toNumber(previous.value)
      if (consumption < 0) continue

      const days = Math.ceil((new Date(current.reading_date) - new Date(previous.reading_date)) / (1000 * 60 * 60 * 24))
      const cost = current.cost_estimate ? toNumber(current.cost_estimate) : consumption * unitPrice
      currentYearConsumption += consumption
      currentYearCost += cost
      currentYearDays += Math.max(0, days)
    }

    const latest = meterReadings[meterReadings.length - 1]
    const previous = meterReadings[meterReadings.length - 2]
    const lastConsumption = toNumber(latest.value) - toNumber(previous.value)
    const paidToDate = monthlyPayment * monthsElapsed
    const difference = paidToDate - currentYearCost
    const projectedAnnualCost = currentYearDays > 0 ? (currentYearCost / currentYearDays) * 365 : 0
    const recommendedMonthlyPayment = projectedAnnualCost > 0 ? projectedAnnualCost / 12 : 0

    return [
      `- ${labels[meterType]}:`,
      `  - ultima citire: ${latest.reading_date}, index ${toNumber(latest.value).toFixed(2)} ${units[meterType]}`,
      `  - consum ultimul interval: ${lastConsumption.toFixed(2)} ${units[meterType]}`,
      `  - tarif folosit: ${unitPrice.toFixed(4)} EUR/${units[meterType]}`,
      `  - avans lunar platit: ${formatMoney(monthlyPayment, currency, locale)}`,
      `  - platit pana acum in ${currentYear}: ${formatMoney(paidToDate, currency, locale)}`,
      `  - consum real estimat in ${currentYear}: ${currentYearConsumption.toFixed(2)} ${units[meterType]}`,
      `  - cost real estimat in ${currentYear}: ${formatMoney(currentYearCost, currency, locale)}`,
      `  - diferenta estimata: ${difference >= 0 ? 'posibil bani inapoi' : 'posibil de plata'} ${formatMoney(Math.abs(difference), currency, locale)}`,
      recommendedMonthlyPayment > 0 ? `  - avans lunar recomandat estimativ: ${formatMoney(recommendedMonthlyPayment, currency, locale)}` : '',
    ].filter(Boolean).join('\n')
  }).join('\n')
}
