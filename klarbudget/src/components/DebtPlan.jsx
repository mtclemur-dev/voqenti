import { debtPlan, formatMoney, formatMonths } from '../lib/finance'

export function DebtPlan({ t, language, currency, debts, settings, onSettingsChange }) {
  const plan = debtPlan(debts, settings)
  const snowball = debtPlan(debts, { ...settings, debt_method: 'snowball' })
  const avalanche = debtPlan(debts, { ...settings, debt_method: 'avalanche' })
  const locale = language === 'de' ? 'de-DE' : 'ro-RO'

  return (
    <section className="section">
      <h2>{t('plan')}</h2>
      <div className="controls">
        <label>
          {t('snowball')} / {t('avalanche')}
          <select value={settings.debt_method} onChange={(event) => onSettingsChange({ debt_method: event.target.value })}>
            <option value="snowball">{t('snowball')}</option>
            <option value="avalanche">{t('avalanche')}</option>
          </select>
        </label>
        <label>
          {t('extraPayment')}
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="ex. 50 EUR"
            value={settings.monthly_extra_debt_payment}
            onChange={(event) => onSettingsChange({ monthly_extra_debt_payment: event.target.value })}
          />
          <small>{t('extraPaymentHint')}</small>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={Boolean(settings.include_mortgage_in_plan)}
            onChange={(event) => onSettingsChange({ include_mortgage_in_plan: event.target.checked })}
          />
          {t('includeMortgage')}
        </label>
      </div>
      <div className="quick-actions">
        {[50, 100, 200].map((amount) => (
          <button type="button" className="secondary" key={amount} onClick={() => onSettingsChange({ monthly_extra_debt_payment: amount })}>+{amount} EUR</button>
        ))}
        <button type="button" className="secondary" onClick={() => onSettingsChange({ monthly_extra_debt_payment: 0 })}>Reset</button>
      </div>
      {plan.hasZeroPaymentDebt && <div className="notice danger">{t('noRateWarning')}</div>}
      <p className="muted">{t('planEstimateNote')}</p>
      <div className="metric-grid compact">
        <Metric t={t} label="includedDebts" value={formatMoney(plan.includedTotal, currency, locale)} />
        <Metric t={t} label="totalMonthlyPayments" value={formatMoney(plan.monthlyPayments, currency, locale)} />
        <Metric t={t} label="averageInterest" value={`${plan.averageInterest.toFixed(2)}%`} />
        <Metric t={t} label="highestInterest" value={`${plan.highestInterest.toFixed(2)}%`} />
        <Metric t={t} label="firstDebt" value={plan.firstDebt?.name ?? '-'} />
        <Metric t={t} label="monthsLeft" value={formatMonths(plan.monthsWithExtra, language)} />
        <Metric t={t} label="monthsSaved" value={formatMonths(plan.monthsSaved, language)} tone="positive" />
      </div>
      {plan.firstDebt && (
        <div className="notice">
          {t('recommendation')}: {plan.firstDebt.name}
        </div>
      )}
      <div className="compare-grid">
        <CompareCard title={t('snowball')} plan={snowball} language={language} advantage={language === 'de' ? 'schneller sichtbarer Fortschritt' : 'progres rapid'} />
        <CompareCard title={t('avalanche')} plan={avalanche} language={language} advantage={language === 'de' ? 'geringere Gesamtkosten' : 'cost total mai mic'} />
      </div>
      <div className="list">
        {plan.ordered.map((debt, index) => (
          <div className="list-item" key={debt.id}>
            <div>
              <strong>{index + 1}. {debt.name}</strong>
              <span>{debt.interest_rate || 0}% - {t('monthlyPayment')}: {formatMoney(debt.monthly_payment, currency, locale)}</span>
            </div>
            <b>{formatMoney(Number(debt.remaining_balance || 0) + Number(debt.final_payment || 0), currency, locale)}</b>
          </div>
        ))}
      </div>
    </section>
  )
}

function Metric({ t, label, value, tone = '' }) {
  return (
    <article className={`metric-card ${tone}`}>
      <span>{t(label)}</span>
      <strong>{value}</strong>
    </article>
  )
}

function CompareCard({ title, plan, language, advantage }) {
  return (
    <article className="compare-card">
      <h3>{title}</h3>
      <strong>{plan.firstDebt?.name ?? '-'}</strong>
      <span>{formatMonths(plan.monthsWithExtra, language)}</span>
      <small>{advantage}</small>
    </article>
  )
}
