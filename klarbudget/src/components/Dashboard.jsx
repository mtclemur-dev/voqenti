import { formatMoney } from '../lib/finance'

export function Dashboard({ t, language, currency, summary, onNavigate }) {
  const locale = language === 'de' ? 'de-DE' : 'ro-RO'
  const cards = [
    ['totalIncome', summary.incomeTotal, 'positive'],
    ['fixedExpenses', summary.fixedTotal, 'neutral'],
    ['variableExpenses', summary.variableTotal, 'warning'],
    ['totalOnceThisMonth', summary.onceThisMonth, summary.onceThisMonth > 0 ? 'warning' : 'neutral'],
    ['urgentDebt', summary.debtTotals.urgent, 'danger'],
    ['mortgageDebt', summary.debtTotals.mortgage, 'neutral'],
    ['totalDebt', summary.debtTotal, 'danger'],
    ['remainingMoney', summary.remaining, summary.remaining >= 0 ? 'positive' : 'danger', t('estimatedAfterPlanned')],
    ['daysUntilSalary', summary.daysUntilSalary, 'neutral', null, 'days'],
    ['dailyBudget', summary.dailyBudget, summary.dailyBudget >= 0 ? 'positive' : 'danger', t('untilSalary')],
    ['nextPaymentsTotal', summary.nextPaymentTotal, summary.nextPaymentTotal > 0 ? 'warning' : 'neutral'],
  ]

  const statusText = summary.next14.length
    ? `${summary.next14.length} ${t('upcomingPayments')}, ${formatMoney(summary.nextPaymentTotal, currency, locale)}.`
    : `${t('onTrack')}.`
  const largestText = summary.largestPayment
    ? `${t('largePayment')}: ${summary.largestPayment.name} - ${formatMoney(summary.largestPayment.amount, currency, locale)}`
    : ''

  return (
    <section className="section">
      <div className={`status-banner ${summary.status}`}>
        <strong>{t(summary.status)}</strong>
        <span>{statusText}</span>
        {largestText && <span>{largestText}</span>}
      </div>
      <div className="quick-actions">
        <button type="button" onClick={() => onNavigate('incomes')}>{t('addIncome')}</button>
        <button type="button" onClick={() => onNavigate('expenses')}>{t('addExpense')}</button>
        <button type="button" onClick={() => onNavigate('debts')}>{t('addDebt')}</button>
      </div>
      <div className="metric-grid">
        {cards.map(([label, value, tone, hint, unit]) => (
          <article className={`metric-card ${tone}`} key={label}>
            <span>{t(label)}</span>
            <strong>{unit === 'days' ? `${Math.round(value)} ${t('days')}` : formatMoney(value, currency, locale)}</strong>
            {hint && <small>{hint}</small>}
          </article>
        ))}
      </div>
    </section>
  )
}
