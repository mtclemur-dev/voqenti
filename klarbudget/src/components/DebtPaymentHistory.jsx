import { useMemo, useState } from 'react'
import { debtPaymentsForId, sumDebtPayments } from '../lib/debtPayments'
import { formatMoney, isoDate, toNumber } from '../lib/finance'

export function DebtPaymentHistory({
  debt,
  payments,
  currency,
  locale,
  t,
  onAdd,
  onUpdate,
  onDelete,
  onResync,
}) {
  const [open, setOpen] = useState(false)
  const rows = useMemo(() => debtPaymentsForId(payments, debt.id), [payments, debt.id])
  const paid = sumDebtPayments(payments, debt.id)

  if (!open) {
    return (
      <button type="button" className="ghost tiny" onClick={() => setOpen(true)}>
        {paid > 0
          ? (t('debtPaymentHistoryPaid') || 'Plăți: {amount}').replace('{amount}', formatMoney(paid, currency, locale))
          : t('debtPaymentHistory')}
      </button>
    )
  }

  return (
    <div className="debt-pay-history">
      <div className="debt-pay-history-head">
        <strong>{t('debtPaymentHistory')}</strong>
        <button type="button" className="ghost tiny" onClick={() => setOpen(false)}>{t('cancel')}</button>
      </div>
      {rows.length === 0 ? (
        <p className="muted">{t('debtPaymentHistoryEmpty')}</p>
      ) : (
        <ul className="debt-pay-history-list">
          {rows.map((row) => (
            <li key={row.id}>
              <input
                type="date"
                defaultValue={row.payment_date}
                onBlur={(event) => {
                  const next = event.target.value
                  if (next && next !== row.payment_date) onUpdate(row, { payment_date: next })
                }}
              />
              <input
                type="number"
                min="0"
                step="0.01"
                defaultValue={row.amount}
                onBlur={(event) => {
                  const next = toNumber(String(event.target.value).replace(',', '.'))
                  if (next > 0 && Math.abs(next - toNumber(row.amount)) > 0.005) {
                    onUpdate(row, { amount: next })
                  }
                }}
              />
              <button type="button" className="ghost tiny danger-text" onClick={() => onDelete(row)}>{t('delete')}</button>
            </li>
          ))}
        </ul>
      )}
      <div className="debt-pay-history-add">
        <button
          type="button"
          className="ghost tiny"
          onClick={() => onAdd(debt, toNumber(debt.monthly_payment), isoDate(new Date()))}
        >
          {t('debtPaymentHistoryAddMonth')}
        </button>
        {rows.length > 0 && (
          <button type="button" className="ghost tiny" onClick={() => onResync(debt)}>
            {t('debtPaymentResync')}
          </button>
        )}
      </div>
    </div>
  )
}
