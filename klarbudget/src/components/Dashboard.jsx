import { formatMoney } from '../lib/finance'
import { FamilyWeekendWidgets } from './FamilyWeekendWidgets'
import { NatureBg } from './NatureBg'

export function Dashboard({ t, language, currency, summary, dbUserId, onNavigate }) {
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
    ['safeAvailableReal', summary.accounts.safeAvailable, summary.accounts.safeAvailable >= 0 ? 'positive' : 'danger', t('safeAvailableHint')],
    ['overdraftAvailable', summary.accounts.overdraftAvailable, 'neutral', t('overdraftAvailableHint')],
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
    <section className="section" style={{ position: 'relative', overflow: 'hidden', paddingTop: '1.25rem' }}>
      <NatureBg variant="minimal" />
      <div style={{ position: 'relative', zIndex: 1, display: 'contents' }}>
        <p className="eyebrow" style={{ fontSize: '0.72rem', marginBottom: '0.2rem', opacity: 0.75 }}>📊 Situație financiară</p>
        <div className={`status-banner ${summary.status}`}>
          <strong>{t(summary.status)}</strong>
          <span>{statusText}</span>
          {largestText && <span>{largestText}</span>}
        </div>
        {summary.accounts.stale && <div className="notice danger">{t('balancesOutdated')}</div>}
        {(summary.accounts.overdraftUsed > 0 || summary.accounts.netBalance < 0) && (
          <div className="notice danger">
            <strong>{t('priorityNow')}</strong>
            <span>{summary.accounts.overdraftUsed > 0 ? t('reduceOverdraftPriority') : t('accountsNegative')}</span>
          </div>
        )}
        {summary.accounts.positiveTotal <= 0 && <div className="notice">{t('noPositiveBalanceIncluded')}</div>}
        {summary.accounts.netBalance < 0 && <div className="notice danger">{t('overdraftPriority')}</div>}
        {summary.accounts.overdraftUsed > 0 && (
          <div className="notice danger">{t('overdraftUsedWarning').replace('{amount}', formatMoney(summary.accounts.overdraftUsed, currency, locale))}</div>
        )}
        <FamilyWeekendWidgets currency={currency} language={language} dbUserId={dbUserId} />
        <div className="metric-grid">
          {cards.map(([label, value, tone, hint, unit]) => (
            <article
              className={`metric-card ${tone} metric-card-${label} ${label === 'journalTodayTotal' ? 'clickable' : ''}`}
              key={label}
              onClick={label === 'journalTodayTotal' ? () => onNavigate('journal') : undefined}
              role={label === 'journalTodayTotal' ? 'button' : undefined}
              tabIndex={label === 'journalTodayTotal' ? 0 : undefined}
              onKeyDown={label === 'journalTodayTotal' ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') onNavigate('journal')
              } : undefined}
            >
              <span>{t(label)}</span>
              <strong>{unit === 'days' ? `${Math.round(value)} ${t('days')}` : formatMoney(value, currency, locale)}</strong>
              {label === 'journalTodayTotal' && <small>{t('openJournal')}</small>}
              {hint && <small>{hint}</small>}
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
