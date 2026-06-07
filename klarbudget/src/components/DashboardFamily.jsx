import { useMemo } from 'react'
import { formatMoney, toNumber, variableBudgetStats, expenseKind } from '../lib/finance'

export function DashboardFamily({
  t,
  language,
  currency,
  summary,
  expenses = [],
  journalEntries = [],
  onOpenQuickSpend,
  onNavigate,
}) {
  const locale = language === 'de' ? 'de-DE' : 'ro-RO'

  // Today's Status Banner
  const statusInfo = useMemo(() => {
    const status = summary.status
    const days = summary.daysUntilSalary || 0
    
    if (status === 'riskNegative' || summary.accounts?.netBalance < 0) {
      return {
        type: 'danger',
        title: t('todayStatusCritical').replace('{days}', days),
        className: 'danger',
      }
    } else if (status === 'largePaymentsSoon') {
      return {
        type: 'warning',
        title: t('todayStatusWarning'),
        className: 'warning',
      }
    } else {
      return {
        type: 'good',
        title: `${t('todayStatusGood')} ${t('daysUntilSalary')}: ${days} ${t('days')}.`,
        className: 'good',
      }
    }
  }, [summary, t])

  // Daily Budget
  const dailyBudgetText = useMemo(() => {
    const daily = toNumber(summary.dailyBudget)
    if (daily <= 0) {
      return t('spendLessToday')
    }
    return t('dailyBudgetAmount').replace('{amount}', formatMoney(daily, currency, locale))
  }, [summary.dailyBudget, currency, locale, t])

  // Food Budget Stats
  const foodStats = useMemo(() => {
    const foodExpense = expenses.find(
      (e) =>
        expenseKind(e) === 'variable_budget' &&
        (e.category?.toLowerCase() === 'mâncare' || e.category?.toLowerCase() === 'mancare' || e.category?.toLowerCase() === 'essen')
    )
    if (!foodExpense) return null
    return variableBudgetStats(foodExpense, new Date(), journalEntries)
  }, [expenses, journalEntries])

  // Food Progress percentage and bar color class
  const foodProgress = useMemo(() => {
    if (!foodStats || foodStats.budget <= 0) return 0
    const pct = Math.round((foodStats.spent / foodStats.budget) * 100)
    return Math.min(100, Math.max(0, pct))
  }, [foodStats])

  const foodColorClass = useMemo(() => {
    if (foodProgress > 90) return 'danger'
    if (foodProgress > 70) return 'warning'
    return 'good'
  }, [foodProgress])

  // Primele 3 plati viitoare si cea mai mare plata
  const nextPayments = summary.next14 || []
  const top3Payments = nextPayments.slice(0, 3)
  const largestPayment = summary.largestPayment

  return (
    <div className="dashboard-family flex flex-col gap-4">
      {/* Situația de azi */}
      <section className="section">
        <div className="section-title">
          <h2>🏡 {t('monthState')}</h2>
          <span className={`status-pill ${statusInfo.className}`}>{t(statusInfo.type)}</span>
        </div>
        <div className={`status-banner ${statusInfo.className}`} style={{ padding: '1.25rem', border: '1px solid var(--line)' }}>
          <strong style={{ fontSize: '1.1rem' }}>{statusInfo.title}</strong>
        </div>
      </section>

      {/* Buton mare "+ Am cheltuit" */}
      <button type="button" className="big-action-button" onClick={onOpenQuickSpend}>
        ➕ {t('quickSpend')}
      </button>

      {/* Cât putem cheltui azi */}
      <section className="section">
        <h2>💰 {t('dailyBudget')}</h2>
        <p style={{ fontSize: '1.35rem', fontWeight: 'bold', color: 'var(--green)' }}>
          {dailyBudgetText}
        </p>
      </section>

      {/* Mâncare */}
      {foodStats && (
        <section className="section clickable" onClick={() => onNavigate('family_food')}>
          <div className="section-title">
            <h2>🍏 {t('familyFood')}</h2>
            <span className={`status-pill ${foodColorClass}`}>{foodProgress}%</span>
          </div>
          <div>
            <p style={{ fontSize: '1.2rem', fontWeight: 'bold', margin: '0 0 0.25rem 0' }}>
              {t('budgetFood')
                .replace('{amount}', formatMoney(foodStats.remaining, currency, locale))}
            </p>
            <p className="muted" style={{ fontSize: '0.95rem', margin: 0 }}>
              {t('budgetFoodDaily')
                .replace('{amount}', formatMoney(foodStats.dailyRemaining, currency, locale))}
            </p>
            <div className="progress-container">
              <div
                className={`progress-bar ${foodColorClass}`}
                style={{ width: `${foodProgress}%` }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginTop: '0.5rem' }} className="muted">
              <span>{t('foodSpent')}: {formatMoney(foodStats.spent, currency, locale)}</span>
              <span>{t('budgetFoodMonthly')}: {formatMoney(foodStats.budget, currency, locale)}</span>
            </div>
          </div>
        </section>
      )}

      {/* Următoarele plăți */}
      <section className="section clickable" onClick={() => onNavigate('family_payments')}>
        <div className="section-title">
          <h2>💳 {t('paymentsNext')}</h2>
          <span>{nextPayments.length}</span>
        </div>
        <p style={{ fontSize: '1.15rem', fontWeight: 'bold', margin: '0 0 0.5rem 0' }}>
          {t('paymentsTotalUpcoming').replace('{amount}', formatMoney(summary.nextPaymentTotal, currency, locale))}
        </p>
        
        {top3Payments.length > 0 && (
          <div className="list" style={{ gap: '0.5rem', marginTop: '0.75rem' }}>
            {top3Payments.map((p) => (
              <div
                key={p.id}
                className="list-item"
                style={{
                  gridTemplateColumns: '1fr auto',
                  padding: '0.65rem 0.85rem',
                  fontSize: '0.92rem',
                  borderRadius: '10px',
                  background: 'var(--surface-soft)',
                  border: '1px solid var(--line)',
                }}
              >
                <div>
                  <strong>{p.name}</strong>
                  <span className="muted" style={{ fontSize: '0.82rem' }}>
                    {p.next_due_date ? new Date(p.next_due_date).toLocaleDateString(locale) : ''} — {t(p.payment_mode || 'automatic_debit')}
                  </span>
                </div>
                <b>{formatMoney(p.amount, currency, locale)}</b>
              </div>
            ))}
          </div>
        )}

        {largestPayment && (
          <p className="muted" style={{ fontSize: '0.85rem', marginTop: '0.75rem', borderTop: '1px solid var(--line)', paddingTop: '0.5rem' }}>
            🔥 {t('largePayment')}: <strong>{largestPayment.name}</strong> — {formatMoney(largestPayment.amount, currency, locale)}
          </p>
        )}
      </section>

      {/* Conturi pe scurt */}
      <section className="section">
        <h2>🏦 {t('accounts')}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginTop: '0.5rem' }}>
          <div className="metric-card" style={{ padding: '0.9rem', borderRadius: '12px' }}>
            <span>{t('netBalance')}</span>
            <strong style={{ fontSize: '1.2rem', color: summary.accounts?.netBalance < 0 ? 'var(--red)' : 'var(--green)' }}>
              {formatMoney(summary.accounts?.netBalance || 0, currency, locale)}
            </strong>
          </div>
          <div className="metric-card" style={{ padding: '0.9rem', borderRadius: '12px' }}>
            <span>{t('limitaDispoRamasa')}</span>
            <strong style={{ fontSize: '1.2rem' }}>
              {formatMoney(summary.accounts?.overdraftAvailable || 0, currency, locale)}
            </strong>
          </div>
        </div>
        <p className="muted" style={{ fontSize: '0.82rem', marginTop: '0.65rem' }}>
          ℹ️ {t('dispoExplanation')}
        </p>
      </section>
    </div>
  )
}
