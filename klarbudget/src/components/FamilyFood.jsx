import { useMemo } from 'react'
import { formatMoney, variableBudgetStats, expenseKind } from '../lib/finance'

export function FamilyFood({
  t,
  language,
  currency,
  expenses = [],
  journalEntries = [],
  onOpenQuickSpend,
}) {
  const locale = language === 'de' ? 'de-DE' : 'ro-RO'

  // Food Budget Stats
  const foodExpense = useMemo(() => {
    return expenses.find(
      (e) =>
        expenseKind(e) === 'variable_budget' &&
        (e.category?.toLowerCase() === 'mâncare' || e.category?.toLowerCase() === 'mancare' || e.category?.toLowerCase() === 'essen')
    )
  }, [expenses])

  const foodStats = useMemo(() => {
    if (!foodExpense) return null
    return variableBudgetStats(foodExpense, new Date(), journalEntries)
  }, [foodExpense, journalEntries])

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

  // Last 10 food journal entries
  const lastFoodExpenses = useMemo(() => {
    return journalEntries
      .filter(
        (entry) =>
          entry.category?.toLowerCase() === 'mâncare' ||
          entry.category?.toLowerCase() === 'mancare' ||
          entry.category?.toLowerCase() === 'essen'
      )
      .slice(0, 10)
  }, [journalEntries])

  return (
    <div className="family-food flex flex-col gap-4">
      {/* Metrics Card */}
      <section className="section">
        <div className="section-title">
          <h2>🍏 {t('budgetFoodTitle')}</h2>
          <span className={`status-pill ${foodColorClass}`}>{foodProgress}%</span>
        </div>

        {foodStats ? (
          <div className="flex flex-col gap-3">
            <div className="progress-container" style={{ height: '16px', borderRadius: '8px' }}>
              <div
                className={`progress-bar ${foodColorClass}`}
                style={{ width: `${foodProgress}%` }}
              />
            </div>

            <div className="metric-grid" style={{ marginTop: '0.5rem' }}>
              <div className="metric-card">
                <span>{language === 'de' ? 'Lebensmittelbudget' : 'Buget lunar'}</span>
                <strong>{formatMoney(foodStats.budget, currency, locale)}</strong>
              </div>
              <div className="metric-card">
                <span>{t('foodSpent')}</span>
                <strong style={{ color: 'var(--ink)' }}>{formatMoney(foodStats.spent, currency, locale)}</strong>
              </div>
              <div className="metric-card">
                <span>{t('foodRemaining')}</span>
                <strong style={{ color: foodStats.remaining <= 0 ? 'var(--red)' : 'var(--green)' }}>
                  {formatMoney(foodStats.remaining, currency, locale)}
                </strong>
              </div>
              <div className="metric-card">
                <span>{language === 'de' ? 'Täglich übrig' : 'Buget pe zi'}</span>
                <strong>{formatMoney(foodStats.dailyRemaining, currency, locale)}</strong>
              </div>
            </div>
          </div>
        ) : (
          <div className="notice" style={{ margin: '0.5rem 0' }}>
            {language === 'de'
              ? 'Kein variables Budget für Lebensmittel ("Essen") in Finanzen gefunden. Erstelle eines im Detailmodus.'
              : 'Nu am găsit un buget variabil pentru "Mâncare" în Finanțe. Creează unul în Modul Detaliat.'}
          </div>
        )}

        <button
          type="button"
          className="big-action-button"
          style={{ marginTop: '0.75rem' }}
          onClick={() => onOpenQuickSpend({ category: 'mâncare' })}
        >
          ➕ {t('addFoodExpense')}
        </button>
      </section>

      {/* Ultimele cheltuieli de mâncare */}
      <section className="section">
        <h2>📋 {t('lastFoodExpenses')}</h2>

        {lastFoodExpenses.length === 0 ? (
          <div className="empty" style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--muted)' }}>
            {t('noData')}
          </div>
        ) : (
          <div className="list" style={{ gap: '0.65rem' }}>
            {lastFoodExpenses.map((entry) => {
              const dateObj = entry.entry_date ? new Date(entry.entry_date) : new Date()
              const dateStr = String(dateObj.getDate()).padStart(2, '0') + '.' + String(dateObj.getMonth() + 1).padStart(2, '0')
              
              return (
                <article
                  key={entry.id}
                  className="list-item"
                  style={{
                    gridTemplateColumns: '1fr auto',
                    padding: '0.75rem 0.95rem',
                    borderRadius: '10px',
                    border: '1px solid var(--line)',
                    background: '#ffffff',
                  }}
                >
                  <div>
                    <strong>{entry.description || t('noStore')}</strong>
                    <span className="muted" style={{ fontSize: '0.82rem' }}>
                      {dateStr} {entry.store ? `— ${entry.store}` : ''} {entry.person ? `— ${t(entry.person)}` : ''}
                    </span>
                  </div>
                  <b>{formatMoney(entry.amount, currency, locale)}</b>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
