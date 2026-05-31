import { useMemo, useState } from 'react'
import { calendarGroups, daysUntil, formatMoney } from '../lib/finance'
import { fetchGoogleCalendarEvents, hasGoogleCalendarConfig, requestGoogleCalendarToken } from '../lib/googleCalendar'

export function PaymentCalendar({ t, language, currency, expenses, settings, paymentStatuses, onPaymentStatus, onEdit }) {
  const locale = language === 'de' ? 'de-DE' : 'ro-RO'
  const [filter, setFilter] = useState('all')
  const [googleEvents, setGoogleEvents] = useState([])
  const [googleStatus, setGoogleStatus] = useState(hasGoogleCalendarConfig ? 'disconnected' : 'missing_config')
  const [googleError, setGoogleError] = useState('')
  const grouped = calendarGroups(expenses, settings, new Date(), paymentStatuses)
  const groups = useMemo(() => buildCalendarGroups(grouped, googleEvents, filter), [grouped, googleEvents, filter])

  const connectGoogleCalendar = async () => {
    if (!hasGoogleCalendarConfig) return
    setGoogleError('')
    setGoogleStatus('connecting')
    try {
      const token = await requestGoogleCalendarToken()
      const now = new Date()
      const max = new Date()
      max.setDate(max.getDate() + 90)
      const events = await fetchGoogleCalendarEvents(token, { timeMin: now, timeMax: max })
      setGoogleEvents(events)
      setGoogleStatus('connected')
    } catch (error) {
      setGoogleStatus('error')
      setGoogleError(error.message)
    }
  }

  return (
    <section className="section">
      <div className="section-title">
        <h2>{t('calendar')}</h2>
        <button type="button" onClick={connectGoogleCalendar} disabled={!hasGoogleCalendarConfig || googleStatus === 'connecting'}>
          {googleStatus === 'connected' ? t('googleConnected') : t('connectGoogleCalendar')}
        </button>
      </div>
      {googleStatus === 'missing_config' && <p className="muted">{t('googleCalendarMissingConfig')}</p>}
      {googleError && <div className="notice danger">{googleError}</div>}
      <div className="tabbar inline-tabs">
        {['all', 'klarbudget', 'google', 'large', 'termine', 'familie', 'casa', 'masina', 'taxe'].map((item) => (
          <button type="button" className={filter === item ? 'active' : ''} key={item} onClick={() => setFilter(item)}>{t(item)}</button>
        ))}
      </div>
      {groups.map(([titleKey, items]) => (
        <div className="calendar-group" key={titleKey}>
          <h3>{t(titleKey)}</h3>
          {items.length === 0 ? <p className="muted">{t('noData')}</p> : items.map((item) => item.source === 'google'
            ? <GoogleCalendarRow item={item} locale={locale} t={t} key={`${title}-google-${item.id}`} />
            : <KlarBudgetRow item={item} currency={currency} locale={locale} onEdit={onEdit} onPaymentStatus={onPaymentStatus} t={t} key={`${title}-kb-${item.id}-${item.due_date_iso || 'none'}`} />
          )}
        </div>
      ))}
    </section>
  )
}

function KlarBudgetRow({ item, currency, locale, onEdit, onPaymentStatus, t }) {
  return (
    <article className={`payment-row ${item.is_large ? 'large' : ''} ${item.payment_status}`}>
      <div>
        <strong>{item.name}</strong>
        <span>{item.next_due_date ? item.next_due_date.toLocaleDateString(locale) : t('noDueDate')} - {item.category} - {t(item.payment_mode || 'automatic_debit')}</span>
        <div className="badge-row">
          <span className="badge">KlarBudget</span>
          {item.is_large && <span className="badge">{t('largePayment')}</span>}
        </div>
      </div>
      <div className="payment-actions">
        <b>{formatMoney(item.amount, currency, locale)}</b>
        {item.payment_mode === 'manual_payment' && (
          <button type="button" className="ghost" onClick={() => onPaymentStatus(item, 'paid')}>{t('markPaid')}</button>
        )}
        <button type="button" className="ghost" onClick={() => onEdit(item)}>{t('edit')}</button>
      </div>
    </article>
  )
}

function GoogleCalendarRow({ item, locale, t }) {
  const time = item.allDay
    ? item.startDate.toLocaleDateString(locale)
    : `${item.startDate.toLocaleDateString(locale)} ${item.startDate.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`

  return (
    <article className="payment-row google-event">
      <div>
        <strong>{item.title}</strong>
        <span>{time}</span>
        {item.location && <span>{item.location}</span>}
        {item.description && <span>{item.description.slice(0, 120)}</span>}
        <div className="badge-row">
          <span className="badge google">Google Calendar</span>
          <span className="badge">{item.category}</span>
        </div>
      </div>
      <div className="payment-actions">
        <span className="muted">{t('termine')}</span>
      </div>
    </article>
  )
}

function buildCalendarGroups(klarBudgetGroups, googleEvents, filter) {
  const googleItems = googleEvents.map((event) => ({
    ...event,
    days_until: daysUntil(event.startDate),
  }))

  const buckets = {
    next7: [...klarBudgetGroups.next7, ...googleItems.filter((item) => item.days_until >= 0 && item.days_until <= 7)],
    days8to14: [...klarBudgetGroups.days8to14, ...googleItems.filter((item) => item.days_until >= 8 && item.days_until <= 14)],
    restOfMonth: [...klarBudgetGroups.restOfMonth, ...googleItems.filter((item) => item.days_until >= 15 && isCurrentMonth(item.startDate))],
    next90: [...klarBudgetGroups.next90, ...googleItems.filter((item) => item.days_until >= 0 && item.days_until <= 90 && !isCurrentMonthOrFirst14(item))],
  }

  return [
    ['next7', filterItems(buckets.next7, filter)],
    ['days8to14', filterItems(buckets.days8to14, filter)],
    ['restOfMonth', filterItems(buckets.restOfMonth, filter)],
    ['next90', filterItems(buckets.next90, filter)],
  ].map(([title, items]) => [title, items.sort((a, b) => eventDate(a) - eventDate(b))])
}

function filterItems(items, filter) {
  if (filter === 'all') return items
  if (filter === 'klarbudget') return items.filter((item) => item.source !== 'google')
  if (filter === 'google') return items.filter((item) => item.source === 'google')
  if (filter === 'large') return items.filter((item) => item.is_large)
  if (filter === 'termine') return items.filter((item) => item.source === 'google')
  const categoryMap = { familie: 'Familie', casa: 'Casă', masina: 'Mașină', taxe: 'Taxe' }
  return items.filter((item) => item.category === categoryMap[filter])
}

function eventDate(item) {
  return item.source === 'google' ? item.startDate : item.next_due_date || new Date(8640000000000000)
}

function isCurrentMonth(date) {
  const now = new Date()
  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()
}

function isCurrentMonthOrFirst14(item) {
  return isCurrentMonth(item.startDate) || item.days_until <= 14
}
