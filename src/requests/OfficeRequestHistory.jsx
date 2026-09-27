import { DateTime } from 'luxon'
import { fillText } from '../plan/planUtils'
import { requestCategoryKey, requestStatusKey } from './requestTemplates'

function whenLabel(value, language, t) {
  const dt = DateTime.fromISO(value, { zone: 'Europe/Berlin' })
  if (!dt.isValid) return ''
  const today = DateTime.now().setZone('Europe/Berlin').startOf('day')
  const day = dt.startOf('day')
  const clock = dt.toFormat('HH:mm')
  if (day.equals(today)) return fillText(t('requestWhenToday'), { time: clock })
  if (day.equals(today.minus({ days: 1 }))) return fillText(t('requestWhenYesterday'), { time: clock })
  return `${dt.setLocale(language).toFormat('dd.MM.yyyy')} · ${clock}`
}

export default function OfficeRequestHistory({
  t,
  language = 'de',
  items = [],
  loading = false,
  compact = false,
}) {
  if (loading) {
    return <p className="text-sm text-slate-400" aria-live="polite">{t('loading')}</p>
  }
  if (!items.length) {
    return <p className="text-sm text-slate-400">{t('requestHistoryEmpty')}</p>
  }

  return (
    <ul className={compact ? 'space-y-2' : 'space-y-3'}>
      {items.map(item => (
        <li key={item.id} className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2">
          <p className="text-sm font-semibold text-white">
            {item.quantity ? `${item.quantity} · ` : ''}
            {item.message}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {t(requestCategoryKey(item.category))}
            {' · '}
            {t(requestStatusKey(item.status))}
            {item.created_at ? ` · ${whenLabel(item.created_at, language, t)}` : ''}
          </p>
          {item.office_reply ? (
            <p className="mt-2 text-sm text-cyan-100">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                {t('requestOfficeReply')}
              </span>
              {item.office_reply}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
