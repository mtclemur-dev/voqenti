import { useMemo, useState } from 'react'
import { buildAutoSchedule, computeRemainingFromSchedule, mergeScheduleWithLog } from '../lib/debtSchedule'
import { formatMoney, toNumber } from '../lib/finance'

export function DebtMonthlySchedule({
  debt,
  payments,
  currency,
  locale,
  t,
  onSaveMonth,
  onDeleteMonth,
  onSyncSchedule,
}) {
  const [open, setOpen] = useState(false)
  const merged = useMemo(() => mergeScheduleWithLog(debt, payments, new Date()), [debt, payments])
  const autoCount = buildAutoSchedule(debt).length

  if (!open) {
    return (
      <button type="button" className="ghost tiny" onClick={() => setOpen(true)}>
        {(t('debtMonthlyScheduleOpen') || 'Rate lunare ({count})').replace('{count}', String(autoCount))}
      </button>
    )
  }

  return (
    <div className="debt-pay-history">
      <div className="debt-pay-history-head">
        <strong>{t('debtMonthlyScheduleTitle')}</strong>
        <button type="button" className="ghost tiny" onClick={() => setOpen(false)}>{t('cancel')}</button>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: '0.78rem' }}>{t('debtMonthlyScheduleHint')}</p>
      <ul className="debt-pay-history-list">
        {merged.map((row) => (
          <li key={row.id || row.payment_date}>
            <span className="debt-schedule-date">{row.payment_date}</span>
            <input
              type="number"
              min="0"
              step="0.01"
              defaultValue={row.amount}
              onBlur={(event) => {
                const next = toNumber(String(event.target.value).replace(',', '.'))
                if (next <= 0) return
                if (Math.abs(next - row.amount) > 0.005 || !row.persisted) {
                  onSaveMonth(debt, row, next)
                }
              }}
            />
            {row.persisted && row.id && (
              <button type="button" className="ghost tiny danger-text" onClick={() => onDeleteMonth(row)}>{t('delete')}</button>
            )}
          </li>
        ))}
      </ul>
      <button type="button" className="ghost tiny" onClick={() => onSyncSchedule(debt)}>
        {t('debtPaymentResync')}
      </button>
    </div>
  )
}

export function DebtComputedRemaining({ debt, payments, currency, locale, t }) {
  const preview = computeRemainingFromSchedule(debt, payments, new Date())
  if (!preview || !toNumber(debt.starting_total)) return null
  return (
    <p className="muted debt-computed-remaining">
      {(t('debtComputedRemaining') || 'Sold calculat: {amount} ({count} rate)')
        .replace('{amount}', formatMoney(preview.leftTotal, currency, locale))
        .replace('{count}', String(preview.installmentCount))}
    </p>
  )
}
