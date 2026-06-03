import { debtPlan, formatMoney, toNumber } from './finance'

export const buildInsights = ({ summary, incomes, expenses, debts, settings, t, language, currency }) => {
  const locale = language === 'de' ? 'de-DE' : 'ro-RO'
  const items = []
  const activeDebts = debts.filter((debt) => debt.status === 'active' && toNumber(debt.remaining_balance) > 0)
  const smallDebts = activeDebts.filter((debt) => toNumber(debt.remaining_balance) <= 1000)
  const highInterestDebts = activeDebts.filter((debt) => toNumber(debt.interest_rate) >= 8)
  const noPaymentDebts = activeDebts.filter((debt) => toNumber(debt.monthly_payment) <= 0)
  const finalPaymentDebt = activeDebts.find((debt) => toNumber(debt.final_payment) > 0)
  const plan = debtPlan(debts, settings)
  const accountSummary = summary.accounts || {}

  if (accountSummary.hasAccounts) {
    items.push({
      level: accountSummary.netBalance < 0 ? 'attention' : 'info',
      title: t('netBalance'),
      text: `Ai acum ${formatMoney(accountSummary.positiveTotal, currency, locale)} sold pozitiv in conturile incluse. Sold net: ${formatMoney(accountSummary.netBalance, currency, locale)}.`,
      action: accountSummary.netBalance < 0 ? t('overdraftPriority') : 'Pastreaza soldurile actualizate pentru un buget realist.',
    })
  }

  if (toNumber(accountSummary.overdraftUsed) > 0) {
    items.push({
      level: 'critical',
      title: t('overdraftUsed'),
      text: t('overdraftUsedWarning').replace('{amount}', formatMoney(accountSummary.overdraftUsed, currency, locale)),
      action: 'Nu considera Dispo disponibil ca bani liberi. Redu Dispo inainte de cumparaturi neesentiale.',
    })
  }

  if (accountSummary.stale) {
    items.push({
      level: 'attention',
      title: t('balancesOutdated'),
      text: 'Soldurile reale pot fi diferite de calculul afisat.',
      action: t('updateBalances'),
    })
  }

  if (toNumber(accountSummary.overdraftUsed) > 0 && activeDebts.some((debt) => /dispo|overdraft/i.test(`${debt.name} ${debt.debt_category}`))) {
    items.push({
      level: 'attention',
      title: t('overdraftUsed'),
      text: t('possibleOverdraftDuplicate'),
      action: 'Verifica daca Dispo este introdus si ca datorie manuala.',
    })
  }

  if (summary.remaining < 0) {
    items.push({
      level: 'critical',
      title: t('riskNegative'),
      text: `${formatMoney(Math.abs(summary.remaining), currency, locale)} lipsesc din bugetul estimat.`,
      action: 'Redu cheltuielile variabile sau amână plățile care nu sunt urgente.',
    })
  }

  if (summary.next14.length > 0) {
    const largest = summary.largestPayment
    items.push({
      level: summary.nextPaymentTotal > summary.incomeTotal * 0.4 ? 'attention' : 'info',
      title: t('largePaymentsSoon'),
      text: `${summary.next14.length} ${t('upcomingPayments')}, total ${formatMoney(summary.nextPaymentTotal, currency, locale)}.${largest ? ` ${t('largePayment')}: ${largest.name} - ${formatMoney(largest.amount, currency, locale)}.` : ''}`,
      action: 'Păstrează suma pentru aceste plăți înainte de cheltuieli noi.',
    })
  }

  if (smallDebts.length > 0) {
    items.push({
      level: 'recommendation',
      title: 'Snowball',
      text: `Ai ${smallDebts.length} datorii sub 1.000 EUR.`,
      action: 'Închide întâi datoria cea mai mică pentru progres rapid.',
    })
  }

  if (highInterestDebts.length > 0) {
    const maxRate = Math.max(...highInterestDebts.map((debt) => toNumber(debt.interest_rate)))
    items.push({
      level: 'recommendation',
      title: 'Avalanche',
      text: `Ai datorii cu dobândă până la ${maxRate.toFixed(2)}%.`,
      action: 'Plătește extra la dobânda cea mai mare ca să reduci costul total.',
    })
  }

  if (noPaymentDebts.length > 0) {
    items.push({
      level: 'attention',
      title: t('noMonthlyPayment'),
      text: `${noPaymentDebts.length} datorii active nu au rată lunară setată.`,
      action: 'Setează o rată minimă pentru un plan realist.',
    })
  }

  if (finalPaymentDebt) {
    items.push({
      level: 'info',
      title: t('finalPayment'),
      text: t('finalPaymentInsight')
        .replace('{name}', finalPaymentDebt.name)
        .replace('{amount}', formatMoney(finalPaymentDebt.final_payment, currency, locale)),
      action: 'Verifică dacă soldul rămas nu include deja rata finală, ca să nu fie dublată.',
    })
  }

  if (summary.dailyBudget > 0 && plan.firstDebt) {
    items.push({
      level: 'recommendation',
      title: t('recommendation'),
      text: `Buget zilnic rămas: ${formatMoney(summary.dailyBudget, currency, locale)}.`,
      action: `Plătește extra la ${plan.firstDebt.name} dacă rămâne buget pozitiv.`,
    })
  }

  if (!items.length && incomes.length + expenses.length + debts.length > 0) {
    items.push({ level: 'info', title: t('onTrack'), text: 'Bugetul estimat rămâne stabil.', action: 'Continuă să urmărești plățile apropiate.' })
  }
  if (!items.length) {
    items.push({ level: 'info', title: t('insights'), text: t('insightEmpty'), action: t('addExpense') })
  }

  const state = summary.remaining < 0 || summary.dailyBudget < 0 ? 'critical' : summary.nextPaymentTotal > summary.incomeTotal * 0.4 ? 'attention' : 'good'
  const risk = state === 'critical' ? 'high' : state === 'attention' ? 'medium' : 'low'
  const steps = [
    accountSummary.safeAvailable < 0 ? `Disponibil sigur real negativ: ${formatMoney(accountSummary.safeAvailable, currency, locale)}.` : `Disponibil sigur real: ${formatMoney(accountSummary.safeAvailable || 0, currency, locale)}.`,
    summary.nextPaymentTotal > 0 ? `Păstrează ${formatMoney(summary.nextPaymentTotal, currency, locale)} pentru plățile apropiate.` : 'Păstrează bugetul planificat pentru luna curentă.',
    'Evită cheltuielile variabile mari până la salariu.',
    plan.firstDebt ? `Direcționează extra către ${plan.firstDebt.name}.` : 'Adaugă datoriile active pentru recomandări mai bune.',
  ]

  return { state, risk, items, steps }
}
