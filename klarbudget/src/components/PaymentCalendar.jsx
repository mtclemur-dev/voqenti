import { calendarGroups, formatMoney } from '../lib/finance'

export function PaymentCalendar({ t, language, currency, expenses, settings, paymentStatuses, onPaymentStatus, onEdit }) {
  const locale = language === 'de' ? 'de-DE' : 'ro-RO'
  const grouped = calendarGroups(expenses, settings, new Date(), paymentStatuses)
  const groups = [
    [t('next7'), grouped.next7],
    [t('days8to14'), grouped.days8to14],
    [t('restOfMonth'), grouped.restOfMonth],
    [t('next90'), grouped.next90],
    [t('noDueDate'), grouped.unscheduled],
  ]

  return (
    <section className="section">
      <h2>{t('calendar')}</h2>
      {groups.map(([title, items]) => (
        <div className="calendar-group" key={title}>
          <h3>{title}</h3>
          {items.length === 0 ? <p className="muted">{t('noData')}</p> : items.map((item) => (
            <article className={`payment-row ${item.is_large ? 'large' : ''} ${item.payment_status}`} key={`${title}-${item.id}-${item.due_date_iso}`}>
              <div>
                <strong>{item.name}</strong>
                <span>{item.next_due_date ? item.next_due_date.toLocaleDateString(locale) : t('noDueDate')} - {item.category} - {t(item.payment_mode || 'automatic_debit')}</span>
                {item.is_large && <span className="badge">{t('largePayment')}</span>}
              </div>
              <div className="payment-actions">
                <b>{formatMoney(item.amount, currency, locale)}</b>
                {item.next_due_date && (
                  <a className="ghost button-link" href={googleCalendarUrl(item, currency, locale)} target="_blank" rel="noreferrer">
                    {t('googleCalendar')}
                  </a>
                )}
                {item.payment_mode === 'manual_payment' && (
                  <button type="button" className="ghost" onClick={() => onPaymentStatus(item, 'paid')}>{t('markPaid')}</button>
                )}
                <button type="button" className="ghost" onClick={() => onEdit(item)}>{t('edit')}</button>
              </div>
            </article>
          ))}
        </div>
      ))}
    </section>
  )
}

function googleCalendarUrl(item, currency, locale) {
  const start = formatGoogleDate(item.next_due_date)
  const endDate = new Date(item.next_due_date)
  endDate.setDate(endDate.getDate() + 1)
  const end = formatGoogleDate(endDate)
  const title = `KlarBudget: ${item.name}`
  const details = `${item.category || ''}\n${formatMoney(item.amount, currency, locale)}\n${item.payment_mode || ''}`
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${start}/${end}`,
    details,
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

function formatGoogleDate(date) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
}
