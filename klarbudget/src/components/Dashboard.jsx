import { formatMoney } from '../lib/finance'

export function Dashboard({ t, language, currency, summary }) {
  const locale = language === 'de' ? 'de-DE' : 'ro-RO'
  const cards = [
    ['totalIncome', summary.incomeTotal, 'positive'],
    ['fixedExpenses', summary.fixedTotal, 'neutral'],
    ['variableExpenses', summary.variableTotal, 'warning'],
    ['journalTodayTotal', summary.journalTodayTotal || 0, summary.journalTodayTotal > 0 ? 'warning' : 'neutral'],
    ['totalOnceThisMonth', summary.onceThisMonth, summary.onceThisMonth > 0 ? 'warning' : 'neutral'],
    ['urgentDebt', summary.debtTotals.urgent, 'danger'],
    ['mortgageDebt', summary.debtTotals.mortgage, 'neutral'],
    ['totalDebt', summary.debtTotal, 'danger'],
    ['positiveBalanceTotal', summary.accounts.positiveTotal, 'positive'],
    ['overdraftUsed', summary.accounts.overdraftUsed, summary.accounts.overdraftUsed > 0 ? 'danger' : 'neutral'],
    ['netBalance', summary.accounts.netBalance, summary.accounts.netBalance >= 0 ? 'positive' : 'danger'],
    ['safeAvailableReal', summary.accounts.safeAvailable, summary.accounts.safeAvailable >= 0 ? 'positive' : 'danger'],
    ['overdraftAvailable', summary.accounts.overdraftAvailable, 'neutral'],
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
      {summary.accounts.stale && <div className="notice danger">{t('balancesOutdated')}</div>}
      {summary.accounts.netBalance < 0 && <div className="notice danger">{t('overdraftPriority')}</div>}
      {summary.accounts.overdraftUsed > 0 && (
        <div className="notice danger">{t('overdraftUsedWarning').replace('{amount}', formatMoney(summary.accounts.overdraftUsed, currency, locale))}</div>
      )}
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
