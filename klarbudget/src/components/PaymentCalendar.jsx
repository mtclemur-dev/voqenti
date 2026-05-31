import { useEffect, useMemo, useState } from 'react'
import { calendarGroups, daysUntil, formatMoney } from '../lib/finance'
import { clearStoredGoogleCalendarToken, createGoogleCalendarEvent, fetchGoogleCalendarEvents, getStoredGoogleCalendarToken, hasGoogleCalendarConfig, requestGoogleCalendarToken } from '../lib/googleCalendar'

export function PaymentCalendar({ t, language, currency, expenses, settings, paymentStatuses, onPaymentStatus, onEdit }) {
  const locale = language === 'de' ? 'de-DE' : 'ro-RO'
  const [calendarView, setCalendarView] = useState('month')
  const [filter, setFilter] = useState('all')
  const [monthDate, setMonthDate] = useState(() => new Date())
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [googleEvents, setGoogleEvents] = useState([])
  const [googleToken, setGoogleToken] = useState(() => getStoredGoogleCalendarToken())
  const [googleStatus, setGoogleStatus] = useState(hasGoogleCalendarConfig ? 'disconnected' : 'missing_config')
  const [googleError, setGoogleError] = useState('')
  const [googleSaveStatus, setGoogleSaveStatus] = useState('')
  const [googleEventForm, setGoogleEventForm] = useState(() => defaultGoogleEventForm(new Date()))
  const [showGoogleEventForm, setShowGoogleEventForm] = useState(false)
  const grouped = calendarGroups(expenses, settings, new Date(), paymentStatuses)
  const groups = useMemo(() => buildCalendarGroups(grouped, googleEvents, filter), [grouped, googleEvents, filter])
  const monthItems = useMemo(() => buildMonthItems(expenses, settings, paymentStatuses, googleEvents, monthDate), [expenses, settings, paymentStatuses, googleEvents, monthDate])
  const selectedItems = monthItems.filter((item) => sameDay(eventDate(item), selectedDate))

  useEffect(() => {
    setGoogleEventForm((current) => ({ ...current, date: dateToInput(selectedDate) }))
  }, [selectedDate])

  useEffect(() => {
    if (!hasGoogleCalendarConfig || !googleToken || googleEvents.length > 0) return
    loadGoogleEvents(googleToken).catch((error) => {
      clearStoredGoogleCalendarToken()
      setGoogleToken('')
      setGoogleStatus('disconnected')
      setGoogleError(buildGoogleCalendarError(error, t))
    })
  }, [googleToken])

  const loadGoogleEvents = async (token) => {
    const now = new Date()
    now.setDate(1)
    now.setHours(0, 0, 0, 0)
    const max = new Date()
    max.setDate(max.getDate() + 180)
    const events = await fetchGoogleCalendarEvents(token, { timeMin: now, timeMax: max })
    setGoogleEvents(events)
    setGoogleStatus('connected')
  }

  const connectGoogleCalendar = async () => {
    if (!hasGoogleCalendarConfig) return
    setGoogleError('')
    setGoogleStatus('connecting')
    try {
      const token = await requestGoogleCalendarToken()
      setGoogleToken(token)
      await loadGoogleEvents(token)
    } catch (error) {
      clearStoredGoogleCalendarToken()
      setGoogleToken('')
      setGoogleStatus('error')
      setGoogleError(buildGoogleCalendarError(error, t))
    }
  }

  const syncGoogleCalendar = async () => {
    if (!hasGoogleCalendarConfig) return
    setGoogleError('')
    setGoogleStatus('connecting')
    try {
      const token = googleToken || await requestGoogleCalendarToken()
      setGoogleToken(token)
      await loadGoogleEvents(token)
    } catch (error) {
      clearStoredGoogleCalendarToken()
      setGoogleToken('')
      setGoogleStatus('error')
      setGoogleError(buildGoogleCalendarError(error, t))
    }
  }

  const disconnectGoogleCalendar = () => {
    clearStoredGoogleCalendarToken()
    setGoogleToken('')
    setGoogleEvents([])
    setGoogleStatus('disconnected')
    setGoogleError('')
  }

  const saveGoogleEvent = async (event) => {
    event.preventDefault()
    if (!hasGoogleCalendarConfig) return
    setGoogleError('')
    setGoogleSaveStatus('saving')
    try {
      const token = googleToken || await requestGoogleCalendarToken({ prompt: 'consent' })
      setGoogleToken(token)
      const createdEvent = await createGoogleCalendarEvent(token, googleEventForm)
      setGoogleEvents((current) => [...current, createdEvent].sort((a, b) => a.startDate - b.startDate))
      setGoogleStatus('connected')
      setGoogleSaveStatus('saved')
      setGoogleEventForm((current) => ({
        ...defaultGoogleEventForm(selectedDate),
        date: current.date,
        reminderMinutes: current.reminderMinutes,
        durationMinutes: current.durationMinutes,
      }))
      setShowGoogleEventForm(false)
    } catch (error) {
      clearStoredGoogleCalendarToken()
      setGoogleToken('')
      setGoogleSaveStatus('error')
      setGoogleError(buildGoogleCalendarError(error, t))
    }
  }

  return (
    <section className="section">
      <div className="section-title">
        <h2>{t('calendar')}</h2>
        <div className="calendar-actions">
          {googleStatus === 'connected' && <span className="calendar-status">{t('googleConnected')}</span>}
          {googleStatus === 'connected' ? (
            <>
              <button type="button" className="secondary" onClick={syncGoogleCalendar} disabled={googleStatus === 'connecting'}>{t('syncGoogleCalendar')}</button>
              <button type="button" className="ghost danger-ghost" onClick={disconnectGoogleCalendar}>{t('disconnectGoogleCalendar')}</button>
            </>
          ) : (
            <button type="button" onClick={connectGoogleCalendar} disabled={!hasGoogleCalendarConfig || googleStatus === 'connecting'}>
              {googleStatus === 'connecting' ? t('syncGoogleCalendar') : t('connectGoogleCalendar')}
            </button>
          )}
        </div>
      </div>
      {googleStatus === 'missing_config' && <p className="muted">{t('googleCalendarMissingConfig')}</p>}
      {googleStatus === 'connected' && (
        <p className="muted">
          {googleEvents.length > 0
            ? t('googleCalendarLoaded').replace('{count}', googleEvents.length)
            : t('googleCalendarEmpty')}
        </p>
      )}
      {googleError && <div className="notice danger">{googleError}</div>}
      {hasGoogleCalendarConfig && (
        <div className="calendar-form-toggle">
          <button type="button" className="secondary" onClick={() => setShowGoogleEventForm((value) => !value)}>
            {showGoogleEventForm ? t('hideAppointmentForm') : t('addAppointmentToggle')}
          </button>
          {googleSaveStatus === 'saved' && <span className="muted">{t('googleEventSaved')}</span>}
        </div>
      )}
      {hasGoogleCalendarConfig && showGoogleEventForm && (
        <form className="google-event-form" onSubmit={saveGoogleEvent}>
          <div className="form-grid compact-form">
            <label>
              {t('appointmentTitle')}
              <input required value={googleEventForm.title} onChange={(event) => setGoogleEventForm({ ...googleEventForm, title: event.target.value })} />
            </label>
            <label>
              {t('appointmentDate')}
              <input required type="date" value={googleEventForm.date} onChange={(event) => setGoogleEventForm({ ...googleEventForm, date: event.target.value })} />
            </label>
            <label>
              {t('appointmentTime')}
              <input required type="time" value={googleEventForm.time} onChange={(event) => setGoogleEventForm({ ...googleEventForm, time: event.target.value })} />
            </label>
            <label>
              {t('durationMinutes')}
              <input min="5" step="5" type="number" value={googleEventForm.durationMinutes} onChange={(event) => setGoogleEventForm({ ...googleEventForm, durationMinutes: event.target.value })} />
            </label>
            <label>
              {t('reminder')}
              <select value={googleEventForm.reminderMinutes} onChange={(event) => setGoogleEventForm({ ...googleEventForm, reminderMinutes: event.target.value })}>
                <option value="0">{t('noReminder')}</option>
                <option value="10">10 {t('minutesBefore')}</option>
                <option value="30">30 {t('minutesBefore')}</option>
                <option value="60">1 {t('hourBefore')}</option>
                <option value="1440">1 {t('dayBefore')}</option>
              </select>
            </label>
            <label>
              {t('location')}
              <input value={googleEventForm.location} onChange={(event) => setGoogleEventForm({ ...googleEventForm, location: event.target.value })} />
            </label>
            <label className="full-span">
              {t('notes')}
              <textarea rows="2" value={googleEventForm.notes} onChange={(event) => setGoogleEventForm({ ...googleEventForm, notes: event.target.value })} />
            </label>
          </div>
          <div className="form-actions">
            <button type="submit" disabled={googleSaveStatus === 'saving'}>{googleSaveStatus === 'saving' ? t('saving') : t('addGoogleAppointment')}</button>
            <button type="button" className="ghost" onClick={() => setShowGoogleEventForm(false)}>{t('cancel')}</button>
          </div>
        </form>
      )}
      <div className="tabbar inline-tabs">
        <button type="button" className={calendarView === 'month' ? 'active' : ''} onClick={() => setCalendarView('month')}>{t('monthView')}</button>
        <button type="button" className={calendarView === 'agenda' ? 'active' : ''} onClick={() => setCalendarView('agenda')}>{t('agendaView')}</button>
      </div>
      <div className="tabbar inline-tabs">
        {['all', 'klarbudget', 'google', 'large', 'termine', 'familie', 'casa', 'masina', 'taxe'].map((item) => (
          <button type="button" className={filter === item ? 'active' : ''} key={item} onClick={() => setFilter(item)}>{t(item)}</button>
        ))}
      </div>
      {calendarView === 'month' ? (
        <MonthCalendar
          currency={currency}
          items={filterItems(monthItems, filter)}
          locale={locale}
          monthDate={monthDate}
          onChangeMonth={setMonthDate}
          onSelectDate={setSelectedDate}
          selectedDate={selectedDate}
          selectedItems={filterItems(selectedItems, filter)}
          t={t}
        />
      ) : groups.map(([titleKey, items]) => (
          <div className="calendar-group" key={titleKey}>
            <h3>{t(titleKey)}</h3>
            {items.length === 0 ? <p className="muted">{t('noData')}</p> : items.map((item) => item.source === 'google'
              ? <GoogleCalendarRow item={item} locale={locale} t={t} key={`${titleKey}-google-${item.id}`} />
              : <KlarBudgetRow item={item} currency={currency} locale={locale} onEdit={onEdit} onPaymentStatus={onPaymentStatus} t={t} key={`${titleKey}-kb-${item.id}-${item.due_date_iso || 'none'}`} />
            )}
          </div>
        ))}
    </section>
  )
}

function buildGoogleCalendarError(error, t) {
  const message = error?.message || ''
  if (/popup|closed|failed_to_open/i.test(message)) return t('googleCalendarPopupError')
  if (/consent|required|access_denied/i.test(message)) return t('googleCalendarConsentError')
  return `${t('googleCalendarConnectError')} ${message}`.trim()
}

function defaultGoogleEventForm(date) {
  return {
    title: '',
    date: dateToInput(date),
    time: '09:00',
    durationMinutes: '60',
    reminderMinutes: '30',
    location: '',
    notes: '',
  }
}

function dateToInput(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function MonthCalendar({ currency, items, locale, monthDate, onChangeMonth, onSelectDate, selectedDate, selectedItems, t }) {
  const days = buildMonthDays(monthDate)
  const title = monthDate.toLocaleDateString(locale, { month: 'long', year: 'numeric' })

  return (
    <>
      <div className="calendar-toolbar">
        <button type="button" className="secondary" onClick={() => onChangeMonth(addMonths(monthDate, -1))}>{'<'}</button>
        <h3>{title}</h3>
        <button type="button" className="secondary" onClick={() => onChangeMonth(addMonths(monthDate, 1))}>{'>'}</button>
      </div>
      <div className="month-grid">
        {days.map((day) => {
          const dayItems = items.filter((item) => sameDay(eventDate(item), day.date))
          return (
            <button
              type="button"
              className={`day-cell ${day.isCurrentMonth ? '' : 'muted-day'} ${sameDay(day.date, selectedDate) ? 'selected' : ''}`}
              key={day.date.toISOString()}
              onClick={() => onSelectDate(day.date)}
            >
              <span>{day.date.getDate()}</span>
              {dayItems.slice(0, 3).map((item) => (
                <small className={item.source === 'google' ? 'event-dot google' : 'event-dot'} key={`${item.source || 'kb'}-${item.id}`}>{item.source === 'google' ? item.title : item.name}</small>
              ))}
              {dayItems.length > 3 && <small>+{dayItems.length - 3}</small>}
            </button>
          )
        })}
      </div>
      <div className="calendar-group">
        <h3>{selectedDate.toLocaleDateString(locale)}</h3>
        {selectedItems.length === 0 ? <p className="muted">{t('noData')}</p> : selectedItems.map((item) => item.source === 'google'
          ? <GoogleCalendarRow item={item} locale={locale} t={t} key={`selected-google-${item.id}`} />
          : <KlarBudgetReadOnlyRow item={item} currency={currency} locale={locale} t={t} key={`selected-kb-${item.id}-${item.due_date_iso || 'none'}`} />
        )}
      </div>
    </>
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
        {item.calendarName && <span>{item.calendarName}</span>}
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

function KlarBudgetReadOnlyRow({ item, currency, locale, t }) {
  return (
    <article className={`payment-row ${item.is_large ? 'large' : ''}`}>
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

function buildMonthItems(expenses, settings, paymentStatuses, googleEvents, monthDate) {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
  const last = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)
  const monthPayments = calendarGroups(expenses, settings, first, paymentStatuses)
  const payments = [...monthPayments.next7, ...monthPayments.days8to14, ...monthPayments.restOfMonth, ...monthPayments.next90]
    .filter((item) => eventDate(item) >= first && eventDate(item) <= last)
  const google = googleEvents.filter((event) => event.startDate >= first && event.startDate <= last)
  return [...payments, ...google]
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

function buildMonthDays(monthDate) {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
  const start = new Date(first)
  const mondayOffset = (first.getDay() + 6) % 7
  start.setDate(first.getDate() - mondayOffset)
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return { date, isCurrentMonth: date.getMonth() === monthDate.getMonth() }
  })
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1)
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function isCurrentMonth(date) {
  const now = new Date()
  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()
}

function isCurrentMonthOrFirst14(item) {
  return isCurrentMonth(item.startDate) || item.days_until <= 14
}
