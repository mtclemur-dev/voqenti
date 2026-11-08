import { useEffect, useMemo, useState } from 'react'
import { DebtMonthlySchedule } from './DebtMonthlySchedule'
import { buildManualDebtPaymentPatch } from '../lib/debtAutoPay'
import { debtPaidSummary } from '../lib/debtPayments'
import { debtRemainingTotal, formatMoney, toNumber } from '../lib/finance'

export function DebtPaymentControls({
  item, t, currency, locale, payments, onPay,
  onSaveScheduleMonth, onDeletePaymentLog, onSyncSchedule,
}) {
  const monthly = toNumber(item.monthly_payment)
  const totalLeft = debtPaidSummary(item, payments).left
  const [customOpen, setCustomOpen] = useState(false)
  const [amountText, setAmountText] = useState(monthly > 0 ? String(monthly) : '')
  const [countAsMonthly, setCountAsMonthly] = useState(true)

  useEffect(() => {
    if (customOpen) {
      setAmountText(monthly > 0 ? String(monthly) : '')
      setCountAsMonthly(true)
    }
  }, [customOpen, monthly, item.id])

  const payAmount = toNumber(String(amountText).replace(',', '.'))
  const afterTotal = useMemo(() => {
    if (payAmount <= 0) return totalLeft
    const patch = buildManualDebtPaymentPatch(item, payAmount, { countAsMonthlyInstallment: false })
    if (!patch) return totalLeft
    return debtRemainingTotal({ ...item, ...patch })
  }, [item, payAmount, totalLeft])

  if (totalLeft <= 0.005) return null

  return (
    <div className="debt-pay-actions">
      {monthly > 0 && (
        <button
          type="button"
          className="secondary small debt-pay-main"
          onClick={() => onPay(item, monthly, { countAsMonthlyInstallment: true })}
        >
          {(t('debtRecordMonthlyPayment') || 'Rata {amount}').replace('{amount}', formatMoney(monthly, currency, locale))}
        </button>
      )}
      <button type="button" className="ghost small" onClick={() => setCustomOpen((open) => !open)}>
        {customOpen ? t('cancel') : t('debtRecordPaymentCustom')}
      </button>
      {customOpen && (
        <div className="debt-pay-custom">
          <div className="debt-pay-presets">
            {monthly > 0 && (
              <>
                <button type="button" className="ghost tiny" onClick={() => setAmountText(String(Math.round(monthly * 0.5 * 100) / 100))}>50%</button>
                <button type="button" className="ghost tiny" onClick={() => setAmountText(String(monthly))}>{t('debtPayPresetMonthly')}</button>
                <button type="button" className="ghost tiny" onClick={() => setAmountText(String(Math.round(monthly * 1.5 * 100) / 100))}>150%</button>
              </>
            )}
            <button type="button" className="ghost tiny" onClick={() => setAmountText(String(Math.round(totalLeft * 100) / 100))}>{t('debtPayPresetAll')}</button>
          </div>
          <label className="debt-pay-field">
            {t('debtRecordPaymentPrompt')}
            <input
              type="number"
              min="0"
              step="0.01"
              value={amountText}
              onChange={(event) => setAmountText(event.target.value)}
            />
          </label>
          {monthly > 0 && (
            <label className="checkbox debt-pay-check">
              <input
                type="checkbox"
                checked={countAsMonthly}
                onChange={(event) => setCountAsMonthly(event.target.checked)}
              />
              {t('debtPayCountAsMonthly')}
            </label>
          )}
          <p className="muted debt-pay-preview">
            {(t('debtPayAfterLabel') || 'După plată: {amount}').replace('{amount}', formatMoney(afterTotal, currency, locale))}
          </p>
          <button
            type="button"
            className="small"
            disabled={payAmount <= 0}
            onClick={() => {
              onPay(item, payAmount, { countAsMonthlyInstallment: monthly > 0 && countAsMonthly })
              setCustomOpen(false)
            }}
          >
            {t('debtPayConfirm')}
          </button>
        </div>
      )}
      {toNumber(item.starting_total) > 0 && item.first_payment_date && (
        <DebtMonthlySchedule
          debt={item}
          payments={payments}
          currency={currency}
          locale={locale}
          t={t}
          onSaveMonth={onSaveScheduleMonth}
          onDeleteMonth={onDeletePaymentLog}
          onSyncSchedule={onSyncSchedule}
        />
      )}
    </div>
  )
}
