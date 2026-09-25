import { DateTime } from 'luxon'
import { firstName, formatDisplayDate, isoDate, leaveBalance, vacationDaysInRange, workerInitials } from './planUtils'

function daysLabel(count, t) {
  if (count === 1) return t('leaveDaysOne')
  return t('leaveDaysCount').replace('{days}', String(count))
}

function leftLabel(count, t) {
  if (count <= 0) return t('leaveNone')
  if (count === 1) return t('leaveLeftOne')
  return t('leaveLeft').replace('{days}', String(count))
}

function toneFor(left, limit) {
  if (left <= 0) return { bar: 'bg-rose-300', text: 'text-rose-100', ring: 'ring-rose-300/20' }
  if (left <= Math.max(3, Math.round(limit * 0.2))) return { bar: 'bg-amber-300', text: 'text-amber-100', ring: 'ring-amber-300/20' }
  return { bar: 'bg-emerald-300', text: 'text-emerald-100', ring: 'ring-emerald-300/20' }
}

export function MyLeaveCard({ t, language, year, worker, absences = [] }) {
  if (!worker?.id) return null
  const balance = leaveBalance(worker, absences, year)
  const tone = toneFor(balance.left, balance.limit)
  const fill = balance.limit ? Math.min(100, Math.round((balance.used / balance.limit) * 100)) : 0
  const mine = [...absences]
    .filter(item => item.worker_id === worker.id)
    .sort((a, b) => isoDate(a.start_date).localeCompare(isoDate(b.start_date)))
  const today = DateTime.now().setZone('Europe/Berlin').toISODate()
  const upcoming = mine.filter(item => isoDate(item.end_date) >= today)
  const past = mine.filter(item => isoDate(item.end_date) < today)
  const sickDays = mine
    .filter(item => item.reason !== 'vacation')
    .reduce((sum, item) => sum + vacationDaysInRange(item.start_date, item.end_date, year), 0)

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-gradient-to-br from-slate-900/95 via-slate-900/80 to-emerald-950/40 p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-200/80">{t('leaveMyTitle')}</p>
      <div className="mt-3 flex items-end justify-between gap-4">
        <div>
          <p className={`text-4xl font-black tabular-nums tracking-tight ${tone.text}`}>{balance.left}</p>
          <p className="mt-1 text-sm text-slate-300">{leftLabel(balance.left, t)}</p>
        </div>
        <p className="pb-1 text-right text-xs leading-5 text-slate-400">
          {t('leaveYearTitle').replace('{year}', String(year))}
          <br />
          {daysLabel(balance.used, t)} / {daysLabel(balance.limit, t)}
        </p>
      </div>
      <span className="mt-4 block h-1.5 overflow-hidden rounded-full bg-slate-800/80" aria-hidden="true">
        <span className={`block h-full rounded-full ${tone.bar}`} style={{ width: `${fill}%` }} />
      </span>
      {t('leaveMyHint') ? <p className="mt-3 text-sm leading-6 text-slate-400">{t('leaveMyHint')}</p> : null}
      {sickDays > 0 && (
        <p className="mt-2 text-xs text-rose-100/80">{t('leaveSickDays').replace('{days}', String(sickDays))}</p>
      )}

      {mine.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">{t('leaveMyEmpty')}</p>
      ) : (
        <div className="mt-4 space-y-3">
          {upcoming.length > 0 && (
            <LeaveList t={t} language={language} year={year} title={t('leaveUpcoming')} items={upcoming} />
          )}
          {past.length > 0 && (
            <LeaveList t={t} language={language} year={year} title={t('leavePast')} items={past} muted />
          )}
        </div>
      )}
    </section>
  )
}

function LeaveList({ t, language, year, title, items, muted = false }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{title}</p>
      <ul className="mt-2 space-y-1.5">
        {items.map(item => {
          const vacation = item.reason === 'vacation'
          const days = vacationDaysInRange(item.start_date, item.end_date, year)
          return (
            <li
              key={item.id}
              className={`flex items-center justify-between gap-3 rounded-2xl px-3 py-2.5 ${
                muted ? 'bg-slate-950/35 text-slate-400' : vacation ? 'bg-emerald-400/8 text-emerald-50' : 'bg-rose-400/8 text-rose-50'
              }`}
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold">
                  {vacation ? t('absenceVacation') : t('absenceSick')}
                </span>
                <span className="mt-0.5 block text-xs text-slate-400">
                  {formatDisplayDate(item.start_date, language)} – {formatDisplayDate(item.end_date, language)}
                </span>
              </span>
              <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-300">{daysLabel(days, t)}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function LeavePeoplePanel({
  t,
  language,
  year,
  workers = [],
  absences = [],
  form,
  setForm,
  editingId,
  onSubmit,
  onEdit,
  onDelete,
  onCancelEdit,
  onSaveLimit,
  DateField,
}) {
  const selected = workers.find(item => item.id === form.worker_id)
  const exceptId = editingId || ''
  const previewDays = form.reason === 'vacation' && form.worker_id
    ? vacationDaysInRange(form.start_date, form.end_date, year)
    : 0
  const selectedBalance = selected ? leaveBalance(selected, absences, year, exceptId) : null
  const after = selectedBalance ? selectedBalance.left - previewDays : null
  const over = selected && form.reason === 'vacation' && after != null && after < 0

  return (
    <div className="space-y-5">
      <section className="rounded-[1.75rem] border border-white/10 bg-slate-900/80 p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-200/80">{t('leaveYearTitle').replace('{year}', String(year))}</p>
            <h3 className="mt-1 text-xl font-black text-white">{t('leaveOverviewTitle')}</h3>
            {t('leaveYearHint') ? <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">{t('leaveYearHint')}</p> : null}
          </div>
        </div>
        <ul className="mt-5 grid gap-2 sm:grid-cols-2">
          {workers.map((worker) => {
            const balance = leaveBalance(worker, absences, year)
            const tone = toneFor(balance.left, balance.limit)
            const fill = balance.limit ? Math.min(100, Math.round((balance.used / balance.limit) * 100)) : 0
            const on = form.worker_id === worker.id
            return (
              <li key={worker.id}>
                <div className={`rounded-2xl p-3 ring-1 transition ${on ? `bg-slate-950/80 ${tone.ring}` : 'bg-slate-950/40 ring-white/5 hover:ring-white/10'}`}>
                  <button
                    type="button"
                    onClick={() => setForm(current => ({ ...current, worker_id: worker.id }))}
                    className="flex w-full items-center gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                  >
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-cyan-100">
                      {workerInitials(worker.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-white">{worker.name}</span>
                      <span className={`mt-0.5 block text-xs ${tone.text}`}>{leftLabel(balance.left, t)}</span>
                    </span>
                    <span className="text-right">
                      <span className="block text-lg font-black tabular-nums text-white">{balance.left}</span>
                      <span className="block text-[11px] text-slate-500">{balance.used}/{balance.limit}</span>
                    </span>
                  </button>
                  <span className="mt-2 block h-1 overflow-hidden rounded-full bg-slate-800" aria-hidden="true">
                    <span className={`block h-full rounded-full ${tone.bar}`} style={{ width: `${fill}%` }} />
                  </span>
                  <label className="mt-3 flex items-center justify-between gap-3 text-[11px] text-slate-400">
                    {t('leaveLimit')}
                    <input
                      type="number"
                      min="1"
                      max="365"
                      defaultValue={balance.limit}
                      key={`${worker.id}-${balance.limit}`}
                      onBlur={event => {
                        const next = Number(event.target.value)
                        if (!Number.isFinite(next) || next < 1 || next === balance.limit) return
                        onSaveLimit?.(worker, Math.min(365, Math.round(next)))
                      }}
                      className="h-9 w-16 rounded-lg border border-white/10 bg-slate-950 text-center text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                    />
                  </label>
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <form onSubmit={onSubmit} className="rounded-[1.75rem] border border-white/10 bg-slate-900/75 p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">{t('absenceTitle')}</p>
        {t('absenceHint') ? <p className="mt-1 text-sm leading-6 text-slate-400">{t('absenceHint')}</p> : null}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-400">
            {t('absenceWorker')}
            <select
              value={form.worker_id}
              onChange={e => setForm(current => ({ ...current, worker_id: e.target.value }))}
              className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm text-white"
            >
              <option value="">{t('workerSelect')}</option>
              {workers.map(worker => (
                <option key={worker.id} value={worker.id}>{worker.name}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-400">
            {t('absenceReason')}
            <select
              value={form.reason}
              onChange={e => setForm(current => ({ ...current, reason: e.target.value }))}
              className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm text-white"
            >
              <option value="sick">{t('absenceSick')}</option>
              <option value="vacation">{t('absenceVacation')}</option>
            </select>
          </label>
          <DateField
            label={t('absenceFrom')}
            className="block text-xs font-semibold text-slate-300"
            value={form.start_date}
            onChange={value => setForm(current => {
              const start = isoDate(value)
              const end = isoDate(current.end_date)
              return { ...current, start_date: start, end_date: end && start && end < start ? start : end }
            })}
          />
          <DateField
            label={t('absenceTo')}
            className="block text-xs font-semibold text-slate-300"
            value={form.end_date}
            onChange={value => setForm(current => {
              const start = isoDate(current.start_date)
              const end = isoDate(value)
              return { ...current, start_date: start && end && end < start ? end : start, end_date: end }
            })}
          />
        </div>
        {selectedBalance && form.reason === 'vacation' && (
          <p className={`mt-3 text-sm ${over ? 'text-rose-200' : 'text-emerald-100/90'}`}>
            {t('leaveThisBooking').replace('{days}', String(previewDays))}
            {' · '}
            {over
              ? t('leaveOverLimit').replace('{days}', String(selectedBalance.left)).replace('{year}', String(year))
              : t('leaveAfterBooking').replace('{days}', String(Math.max(0, after)))}
          </p>
        )}
        <input
          value={form.note}
          onChange={e => setForm(current => ({ ...current, note: e.target.value }))}
          placeholder={t('absenceNote')}
          className="mt-3 min-h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm text-white"
        />
        <button type="submit" className="mt-4 min-h-12 w-full rounded-2xl bg-slate-100 px-4 text-sm font-semibold text-slate-950 hover:bg-white">
          {t('absenceSave')}
        </button>
        {editingId && (
          <button type="button" onClick={onCancelEdit} className="mt-2 min-h-12 w-full rounded-2xl bg-slate-800 px-4 text-sm font-semibold text-white">
            {t('cancel')}
          </button>
        )}

        {absences.length === 0 ? (
          <p className="mt-4 text-center text-sm text-slate-500">{t('absenceEmpty')}</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {absences.map((item) => {
              const vacation = item.reason === 'vacation'
              const days = vacationDaysInRange(item.start_date, item.end_date, year)
              return (
                <li key={item.id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-950/50 px-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">
                      {firstName(workers.find(worker => worker.id === item.worker_id)?.name) || t('planUnknownWorker')}
                      <span className="font-normal text-slate-400">
                        {' · '}
                        {vacation ? t('absenceVacation') : t('absenceSick')}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {formatDisplayDate(item.start_date, language)} – {formatDisplayDate(item.end_date, language)}
                      {' · '}
                      {daysLabel(days, t)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-3">
                    <button type="button" onClick={() => onEdit(item)} className="min-h-11 text-sm font-semibold text-cyan-200">{t('edit')}</button>
                    <button type="button" onClick={() => onDelete(item)} className="min-h-11 text-sm font-semibold text-rose-200">{t('delete')}</button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </form>
    </div>
  )
}
