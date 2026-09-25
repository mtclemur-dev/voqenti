import { DateTime } from 'luxon'
import { firstName, formatDisplayDate, isoDate, leaveBalance, vacationDaysInRange, workerInitials } from './planUtils'

const softDateClass = 'min-h-11 w-full rounded-xl border-0 bg-white/[0.04] px-3 text-sm font-light text-white/85 ring-1 ring-white/10 [color-scheme:dark] focus:outline-none focus-visible:ring-white/25'
const softDateStyle = { colorScheme: 'dark' }

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
  if (left <= 0) return { bar: 'bg-rose-200/50', ink: 'text-rose-100/70', wash: 'from-rose-950/15' }
  if (left <= Math.max(3, Math.round(limit * 0.2))) return { bar: 'bg-amber-100/55', ink: 'text-amber-50/75', wash: 'from-amber-950/15' }
  return { bar: 'bg-teal-100/45', ink: 'text-teal-50/75', wash: 'from-teal-950/20' }
}

function RemainBar({ used, limit, tone }) {
  const fill = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0
  return (
    <span className="mt-5 block h-px bg-white/[0.07]" aria-hidden="true">
      <span className={`block h-px ${tone.bar}`} style={{ width: `${fill}%` }} />
    </span>
  )
}

function LeaveDot({ vacation, muted = false }) {
  return (
    <span
      className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
        muted ? 'bg-white/15' : vacation ? 'bg-teal-100/60' : 'bg-rose-100/50'
      }`}
      aria-hidden="true"
    />
  )
}

export function MyLeaveCard({ t, language, year, worker, absences = [] }) {
  if (!worker?.id) return null
  const balance = leaveBalance(worker, absences, year)
  const tone = toneFor(balance.left, balance.limit)
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
    <section className={`overflow-hidden rounded-[1.75rem] border border-white/[0.05] bg-gradient-to-b ${tone.wash} to-slate-950/30 px-5 py-7`}>
      <p className="text-[10px] font-medium uppercase tracking-[0.34em] text-white/35">
        {t('leaveMyTitle')}
        <span className="text-white/20"> · {year}</span>
      </p>
      <div className="mt-6 flex items-end justify-between gap-6">
        <div>
          <p className={`text-[3rem] font-light leading-none tabular-nums tracking-tight ${tone.ink}`}>{balance.left}</p>
          <p className="mt-2 text-[13px] font-light text-white/50">{leftLabel(balance.left, t)}</p>
        </div>
        <p className="pb-1 text-right text-[12px] font-light leading-5 text-white/32">
          {daysLabel(balance.used, t)}
          <span className="text-white/20"> / {daysLabel(balance.limit, t)}</span>
        </p>
      </div>
      <RemainBar used={balance.used} limit={balance.limit} tone={tone} />
      {t('leaveMyHint') ? <p className="mt-5 text-[13px] font-light leading-6 text-white/38">{t('leaveMyHint')}</p> : null}
      {sickDays > 0 && (
        <p className="mt-1 text-[12px] font-light text-rose-100/45">{t('leaveSickDays').replace('{days}', String(sickDays))}</p>
      )}

      {mine.length === 0 ? (
        <p className="mt-7 text-[13px] font-light text-white/28">{t('leaveMyEmpty')}</p>
      ) : (
        <div className="mt-7 space-y-6">
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
      <p className="text-[10px] font-medium uppercase tracking-[0.3em] text-white/24">{title}</p>
      <ul className="mt-3">
        {items.map(item => {
          const vacation = item.reason === 'vacation'
          const days = vacationDaysInRange(item.start_date, item.end_date, year)
          return (
            <li key={item.id} className={`flex items-start gap-3 border-t border-white/[0.035] py-3 first:border-t-0 first:pt-0 ${muted ? 'opacity-50' : ''}`}>
              <LeaveDot vacation={vacation} muted={muted} />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-white/75">
                  {vacation ? t('absenceVacation') : t('absenceSick')}
                </span>
                <span className="mt-0.5 block text-[12px] font-light text-white/36">
                  {formatDisplayDate(item.start_date, language)} – {formatDisplayDate(item.end_date, language)}
                </span>
              </span>
              <span className="shrink-0 pt-0.5 text-[12px] font-light tabular-nums text-white/40">{daysLabel(days, t)}</span>
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
  const people = [...workers].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), language || 'de', { sensitivity: 'base' }))

  return (
    <div className="space-y-10">
      <section className="rounded-[1.75rem] border border-white/[0.05] bg-slate-950/25 px-5 py-7">
        <p className="text-[10px] font-medium uppercase tracking-[0.34em] text-white/32">
          {t('leaveYearTitle').replace('{year}', String(year))}
        </p>
        <h3 className="mt-3 text-[1.65rem] font-light tracking-tight text-white/88">{t('leaveOverviewTitle')}</h3>
        {t('leaveYearHint') ? <p className="mt-2 max-w-md text-[13px] font-light leading-6 text-white/38">{t('leaveYearHint')}</p> : null}
        <ul className="mt-7 grid gap-2.5 sm:grid-cols-2">
          {people.map((worker) => {
            const balance = leaveBalance(worker, absences, year)
            const tone = toneFor(balance.left, balance.limit)
            const on = form.worker_id === worker.id
            return (
              <li key={worker.id}>
                <div className={`rounded-[1.25rem] px-4 py-4 transition ${on ? `bg-gradient-to-b ${tone.wash} to-white/[0.03] ring-1 ring-white/10` : 'bg-white/[0.015] hover:bg-white/[0.035]'}`}>
                  <button
                    type="button"
                    onClick={() => setForm(current => ({ ...current, worker_id: worker.id }))}
                    className="flex w-full items-center gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
                  >
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/[0.08] text-[10px] font-medium tracking-[0.12em] text-white/50">
                      {workerInitials(worker.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-white/80">{worker.name}</span>
                      <span className={`mt-0.5 block text-[12px] font-light ${tone.ink}`}>{leftLabel(balance.left, t)}</span>
                    </span>
                    <span className="text-right">
                      <span className={`block text-[1.5rem] font-light leading-none tabular-nums ${tone.ink}`}>{balance.left}</span>
                      <span className="mt-1 block text-[10px] font-light tabular-nums tracking-wide text-white/28">{balance.used} / {balance.limit}</span>
                    </span>
                  </button>
                  <RemainBar used={balance.used} limit={balance.limit} tone={tone} />
                  <label className="mt-4 flex items-baseline justify-between gap-3 text-[11px] font-light tracking-wide text-white/32">
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
                      className="h-8 w-12 border-0 border-b border-white/15 bg-transparent text-center text-sm font-light tabular-nums text-white/75 focus:border-white/35 focus:outline-none"
                    />
                  </label>
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <form onSubmit={onSubmit} className="rounded-[1.75rem] border border-white/[0.05] bg-slate-950/15 px-5 py-7">
        <p className="text-[10px] font-medium uppercase tracking-[0.34em] text-white/32">{t('absenceTitle')}</p>
        {t('absenceHint') ? <p className="mt-3 text-[13px] font-light leading-6 text-white/38">{t('absenceHint')}</p> : null}
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="text-[11px] font-light tracking-wide text-white/38">
            {t('absenceWorker')}
            <select
              value={form.worker_id}
              onChange={e => setForm(current => ({ ...current, worker_id: e.target.value }))}
              className="mt-1.5 min-h-11 w-full rounded-xl border-0 bg-white/[0.04] px-3 text-sm font-light text-white/90 ring-1 ring-white/10 focus:outline-none focus-visible:ring-white/25"
            >
              <option value="">{t('workerSelect')}</option>
              {people.map(worker => (
                <option key={worker.id} value={worker.id}>{worker.name}</option>
              ))}
            </select>
          </label>
          <label className="text-[11px] font-light tracking-wide text-white/38">
            {t('absenceReason')}
            <select
              value={form.reason}
              onChange={e => setForm(current => ({ ...current, reason: e.target.value }))}
              className="mt-1.5 min-h-11 w-full rounded-xl border-0 bg-white/[0.04] px-3 text-sm font-light text-white/90 ring-1 ring-white/10 focus:outline-none focus-visible:ring-white/25"
            >
              <option value="sick">{t('absenceSick')}</option>
              <option value="vacation">{t('absenceVacation')}</option>
            </select>
          </label>
          <DateField
            label={t('absenceFrom')}
            className="block text-[11px] font-light tracking-wide text-white/38"
            inputClassName={softDateClass}
            inputStyle={softDateStyle}
            value={form.start_date}
            onChange={value => setForm(current => {
              const start = isoDate(value)
              const end = isoDate(current.end_date)
              return { ...current, start_date: start, end_date: end && start && end < start ? start : end }
            })}
          />
          <DateField
            label={t('absenceTo')}
            className="block text-[11px] font-light tracking-wide text-white/38"
            inputClassName={softDateClass}
            inputStyle={softDateStyle}
            value={form.end_date}
            onChange={value => setForm(current => {
              const start = isoDate(current.start_date)
              const end = isoDate(value)
              return { ...current, start_date: start && end && end < start ? end : start, end_date: end }
            })}
          />
        </div>
        {selectedBalance && form.reason === 'vacation' && (
          <p className={`mt-5 text-[13px] font-light ${over ? 'text-rose-100/65' : 'text-white/42'}`}>
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
          className="mt-5 min-h-11 w-full rounded-xl border-0 bg-white/[0.04] px-3 text-sm font-light text-white/90 ring-1 ring-white/10 placeholder:text-white/22 focus:outline-none focus-visible:ring-white/25"
        />
        <button type="submit" className="mt-6 min-h-12 w-full rounded-full bg-white/[0.88] px-4 text-[13px] font-medium tracking-[0.04em] text-slate-900 hover:bg-white">
          {t('absenceSave')}
        </button>
        {editingId && (
          <button type="button" onClick={onCancelEdit} className="mt-2 min-h-11 w-full rounded-full bg-transparent px-4 text-[13px] font-light text-white/45 ring-1 ring-white/10 hover:text-white/80">
            {t('cancel')}
          </button>
        )}

        {absences.length === 0 ? (
          <p className="mt-8 text-center text-[13px] font-light text-white/28">{t('absenceEmpty')}</p>
        ) : (
          <ul className="mt-8">
            {absences.map((item) => {
              const vacation = item.reason === 'vacation'
              const days = vacationDaysInRange(item.start_date, item.end_date, year)
              return (
                <li key={item.id} className="flex items-start justify-between gap-3 border-t border-white/[0.035] py-3.5 first:border-t-0 first:pt-0">
                  <div className="flex min-w-0 items-start gap-3">
                    <LeaveDot vacation={vacation} />
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-white/78">
                        {firstName(workers.find(worker => worker.id === item.worker_id)?.name) || t('planUnknownWorker')}
                        <span className="font-light text-white/32">
                          {' · '}
                          {vacation ? t('absenceVacation') : t('absenceSick')}
                        </span>
                      </p>
                      <p className="mt-0.5 text-[12px] font-light text-white/34">
                        {formatDisplayDate(item.start_date, language)} – {formatDisplayDate(item.end_date, language)}
                        {' · '}
                        {daysLabel(days, t)}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-4">
                    <button type="button" onClick={() => onEdit(item)} className="min-h-11 text-[13px] font-light text-white/42 hover:text-white">{t('edit')}</button>
                    <button type="button" onClick={() => onDelete(item)} className="min-h-11 text-[13px] font-light text-white/28 hover:text-rose-100/70">{t('delete')}</button>
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
