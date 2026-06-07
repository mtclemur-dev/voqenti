import { useMemo } from 'react'
import { upcomingPayments, formatMoney } from '../lib/finance'

export function FamilyPayments({
  t,
  language,
  currency,
  expenses = [],
  settings = {},
  paymentStatuses = [],
  onPaymentStatus,
}) {
  const locale = language === 'de' ? 'de-DE' : 'ro-RO'

  const payments = useMemo(() => {
    // List upcoming payments for the next 30 days, including paid ones so the user has visual feedback
    return upcomingPayments(expenses, 30, settings, new Date(), paymentStatuses, { includePaid: true })
  }, [expenses, settings, paymentStatuses])

  const formatDateShort = (dateString) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    return `${day}.${month}`
  }

  return (
    <div className="family-payments flex flex-col gap-4">
      <section className="section">
        <div className="section-title">
          <h2>💳 {t('paymentsNext')}</h2>
          <span>{payments.length}</span>
        </div>
        <p className="muted" style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>
          {language === 'de' ? 'Zukünftige Fixkosten und Zahlungen für die nächsten 30 Tage.' : 'Plăți fixe și rate planificate pentru următoarele 30 de zile.'}
        </p>

        {payments.length === 0 ? (
          <div className="empty" style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)' }}>
            {t('noData')}
          </div>
        ) : (
          <div className="list" style={{ gap: '0.65rem' }}>
            {payments.map((item) => {
              const isPaid = item.payment_status === 'paid'
              const isManual = item.payment_mode === 'manual_payment'
              const dateText = formatDateShort(item.due_date_iso || item.due_date)
              
              // Romanian: "automat" or "manual"
              // German: "automatisch" or "manuell"
              const typeText = language === 'de'
                ? (isManual ? 'manuell' : 'automatisch')
                : (isManual ? 'manual' : 'automat')

              return (
                <article
                  key={`${item.id}-${item.due_date_iso || 'none'}`}
                  className={`list-item ${isPaid ? 'paid' : ''}`}
                  style={{
                    gridTemplateColumns: '1fr auto',
                    alignItems: 'center',
                    padding: '0.85rem 1rem',
                    borderRadius: '12px',
                    border: '1px solid var(--line)',
                    background: isPaid ? 'rgba(238, 244, 238, 0.4)' : '#ffffff',
                    opacity: isPaid ? 0.65 : 1,
                  }}
                >
                  <div style={{ display: 'grid', gap: '0.2rem' }}>
                    <strong style={{ fontSize: '1.05rem', color: isPaid ? 'var(--muted)' : 'var(--ink)' }}>
                      {item.name}
                    </strong>
                    <span className="muted" style={{ fontSize: '0.82rem' }}>
                      {dateText} — {typeText} — {item.category}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <b style={{ fontSize: '1.05rem', color: isPaid ? 'var(--muted)' : 'var(--ink)' }}>
                      {formatMoney(item.amount, currency, locale)}
                    </b>
                    {isManual && !isPaid && onPaymentStatus && (
                      <button
                        type="button"
                        className="ghost"
                        style={{
                          minHeight: '34px',
                          padding: '0.35rem 0.65rem',
                          fontSize: '0.8rem',
                          borderRadius: '8px',
                          background: 'var(--green-soft)',
                          color: 'var(--green)',
                          fontWeight: 'bold',
                        }}
                        onClick={() => onPaymentStatus(item, 'paid')}
                      >
                        {language === 'de' ? 'Bezahlt' : 'Plătește'}
                      </button>
                    )}
                    {isPaid && (
                      <span
                        style={{
                          fontSize: '0.82rem',
                          color: '#2e6640',
                          fontWeight: 'bold',
                          background: '#eaf5ec',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '6px',
                        }}
                      >
                        ✓ {language === 'de' ? 'Bezahlt' : 'Plătită'}
                      </span>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
