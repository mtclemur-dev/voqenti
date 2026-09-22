import { useMemo, useState } from 'react'
import WeekBoard from './WeekBoard'
import { IconAlert, IconChevron, IconUser, IconWork } from './icons'
import {
  assignmentRange,
  durationMinutes,
  fillText,
  formatClock,
  jobTone,
  longWeekdayDate,
  minutesLabel,
  rowWorkMinutes,
  shortPlace,
  workerInitials,
} from './planUtils'

const TONE = {
  open: 'bg-cyan-400',
  confirmed: 'bg-emerald-400',
  attention: 'bg-amber-300',
  problem: 'bg-rose-400',
  idle: 'bg-slate-500',
}

const DAY_TARGET_MINUTES = 7 * 60

function dayMinutesForWorker(workerId, jobs) {
  let total = 0
  let counted = false
  for (const job of jobs) {
    if (job?.status === 'cancelled' || job?.status === 'canceled') continue
    const row = (job.work_job_assignees ?? []).find(item => item.worker_id === workerId && ['assigned', 'approved'].includes(item.status))
    if (!row) continue
    const minutes = rowWorkMinutes({ ...row, work_jobs: job })
    if (!minutes) continue
    total += minutes
    counted = true
  }
  return counted ? total : null
}

function plannedMinutesForDay(jobs, skipIds) {
  let total = 0
  let counted = false
  for (const job of jobs) {
    if (job?.status === 'cancelled' || job?.status === 'canceled') continue
    const people = (job.work_job_assignees ?? []).filter(row => ['assigned', 'approved'].includes(row.status))
    for (const row of people) {
      if (skipIds?.has(row.worker_id)) continue
      const range = assignmentRange(row, job)
      if (!range.start || !range.end) continue
      const minutes = durationMinutes(job.work_date, range.start, range.end)
      if (!minutes) continue
      total += minutes
      counted = true
    }
  }
  return counted ? total : null
}

function jobHasWorker(job, workerId) {
  return (job.work_job_assignees ?? []).some(row => row.worker_id === workerId && ['assigned', 'approved', 'declined'].includes(row.status))
}

function jobStatusLabel(job, t) {
  const tone = jobTone(job)
  if (tone === 'idle') return t('planCancelled')
  if (tone === 'problem') return t('planDeclined')
  if (tone === 'attention') {
    const active = (job.work_job_assignees ?? []).filter(row => ['assigned', 'approved'].includes(row.status))
    const needed = Math.max(Number(job.needed_count) || 0, active.length, 1)
    if (!active.length || active.length < needed) return t('planCoverShort')
    return t('planUnseen')
  }
  if (tone === 'confirmed') return t('planSeenDone')
  return t('planAssigned')
}

export default function AdminPlanBoard({
  t,
  language,
  today,
  liveBoardDate,
  boardJobs,
  boardMarks,
  dayRoster,
  rosterFilter,
  onRosterFilter,
  rosterSearch,
  onRosterSearch,
  focusWorkerId,
  onFocusWorker,
  boardOpenId,
  onToggleJob,
  onSelectDate,
  onNewJob,
  objects = [],
  workerName,
  renderJob,
  jobFormOpen = false,
  hideOwnerHours = false,
  ownerIds,
  children,
}) {
  const hiddenOwnerIds = ownerIds instanceof Set ? ownerIds : new Set(ownerIds || [])
  const [peopleOpen, setPeopleOpen] = useState(false)
  const search = rosterSearch.trim().toLowerCase()
  const sortedJobs = useMemo(
    () => [...boardJobs].sort((a, b) => String(a.start_time || '').localeCompare(String(b.start_time || '')) || String(a.id).localeCompare(String(b.id))),
    [boardJobs],
  )
  const people = useMemo(() => {
    const rows = [
      ...dayRoster.free.map(item => ({ ...item, status: 'free' })),
      ...dayRoster.working.map(item => ({ ...item, status: 'working' })),
      ...dayRoster.off.map(item => ({ ...item, status: 'off' })),
    ]
    return rows
      .filter(item => !rosterFilter || item.status === rosterFilter)
      .filter(item => !search || (item.name || '').toLowerCase().includes(search))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .map(item => {
        const jobCount = sortedJobs.filter(job => jobHasWorker(job, item.id)).length
        const minutes = item.status === 'working' && !(hideOwnerHours && hiddenOwnerIds.has(item.id))
          ? dayMinutesForWorker(item.id, sortedJobs)
          : null
        return { ...item, jobCount, minutes, short: minutes != null && minutes < DAY_TARGET_MINUTES }
      })
  }, [dayRoster, hiddenOwnerIds, hideOwnerHours, rosterFilter, search, sortedJobs])

  const dayMinutes = useMemo(
    () => plannedMinutesForDay(sortedJobs, hideOwnerHours ? hiddenOwnerIds : null),
    [hiddenOwnerIds, hideOwnerHours, sortedJobs],
  )
  const shortPeople = useMemo(
    () => dayRoster.working
      .filter(item => !(hideOwnerHours && hiddenOwnerIds.has(item.id)))
      .map(item => {
        const minutes = dayMinutesForWorker(item.id, sortedJobs)
        return { ...item, minutes, short: minutes != null && minutes < DAY_TARGET_MINUTES }
      })
      .filter(item => item.short)
      .sort((a, b) => a.minutes - b.minutes || (a.name || '').localeCompare(b.name || '')),
    [dayRoster.working, hiddenOwnerIds, hideOwnerHours, sortedJobs],
  )
  const visibleJobs = focusWorkerId
    ? sortedJobs.filter(job => jobHasWorker(job, focusWorkerId))
    : sortedJobs
  const dimmedCount = sortedJobs.length - visibleJobs.length
  const focusName = people.find(item => item.id === focusWorkerId)?.name
    || [...dayRoster.free, ...dayRoster.working, ...dayRoster.off].find(item => item.id === focusWorkerId)?.name
    || ''

  const emptyPeople = !people.length
    ? (search
      ? t('adminEmptySearch')
      : rosterFilter === 'free'
        ? t('adminEmptyFree')
        : rosterFilter === 'working'
          ? t('adminEmptyWorking')
          : rosterFilter === 'off'
            ? t('adminEmptyOff')
            : t('adminEmptyFree'))
    : ''

  const emptyJobs = focusWorkerId && !visibleJobs.length
    ? t('adminJobsForWorkerEmpty')
    : t('adminEmptyDayJobs')

  const openForm = () => onNewJob?.(liveBoardDate)

  return (
    <div className="space-y-5">
      <WeekBoard
        t={t}
        language={language}
        today={today}
        selectedDate={liveBoardDate}
        onSelectDate={onSelectDate}
        marks={boardMarks}
        compact
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-black capitalize tracking-tight text-white sm:text-2xl">
            {longWeekdayDate(liveBoardDate, language)}
          </h2>
          <p className="mt-1 text-sm text-slate-300">
            {fillText(t('adminDayJobs'), { count: String(sortedJobs.length) })}
            {dayMinutes != null ? ` · ${fillText(t('adminDayHours'), { hours: minutesLabel(dayMinutes, t) })}` : ''}
            {' · '}
            {fillText(t('adminDayPlanned'), { count: String(dayRoster.working.length) })}
            {' · '}
            {fillText(t('adminDayFree'), { count: String(dayRoster.free.length) })}
            {' · '}
            {fillText(t('adminDayOff'), { count: String(dayRoster.off.length) })}
          </p>
          {focusName && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-cyan-100">{fillText(t('adminWorkerSelected'), { name: focusName })}</p>
              <button
                type="button"
                onClick={() => onFocusWorker('')}
                className="min-h-11 rounded-xl bg-slate-800 px-3 text-sm font-semibold text-white hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
              >
                {t('adminClearWorker')}
              </button>
            </div>
          )}
        </div>
        {!jobFormOpen && (
          <button
            type="button"
            onClick={openForm}
            className="hidden min-h-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-600 px-5 text-sm font-semibold text-white hover:bg-cyan-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 xl:inline-flex"
          >
            {t('adminNewJobPlus')}
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {[
          { id: 'free', label: t('planRosterFree'), count: dayRoster.free.length, Icon: IconUser, tone: 'emerald', filter: t('adminFilterFree') },
          { id: 'working', label: t('planRosterBusy'), count: dayRoster.working.length, Icon: IconWork, tone: 'amber', filter: t('adminFilterBusy') },
          { id: 'off', label: t('planRosterOff'), count: dayRoster.off.length, Icon: IconAlert, tone: 'rose', filter: t('adminFilterOff') },
        ].map(card => {
          const on = rosterFilter === card.id
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => onRosterFilter(on ? '' : card.id)}
              aria-pressed={on}
              aria-label={`${card.filter}: ${card.count}`}
              className={`min-h-11 rounded-2xl px-2 py-3 text-left ring-1 transition hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 sm:px-3 ${
                on
                  ? card.tone === 'emerald'
                    ? 'bg-emerald-400/15 ring-emerald-300/70'
                    : card.tone === 'amber'
                      ? 'bg-amber-400/15 ring-amber-300/70'
                      : 'bg-rose-400/15 ring-rose-300/70'
                  : 'bg-slate-900/80 ring-white/10'
              }`}
            >
              <card.Icon className={`h-5 w-5 ${card.tone === 'emerald' ? 'text-emerald-200' : card.tone === 'amber' ? 'text-amber-200' : 'text-rose-200'}`} />
              <p className="mt-1 text-2xl font-black text-white">{card.count}</p>
              <p className="text-[11px] font-semibold text-slate-200">{card.label}</p>
            </button>
          )
        })}
      </div>

      {shortPeople.length > 0 && (
        <section className="rounded-2xl border border-amber-300/25 bg-gradient-to-br from-amber-400/15 via-slate-900/80 to-slate-900/80 p-4">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.28em] text-amber-200">{t('adminUnderHoursTitle')}</p>
              <p className="mt-1 text-sm text-amber-50/90">{t('adminUnderHoursHint')}</p>
            </div>
            <p className="shrink-0 text-3xl font-black tabular-nums text-white">{shortPeople.length}</p>
          </div>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {shortPeople.map(person => {
              const selected = focusWorkerId === person.id
              const fill = Math.max(8, Math.round((person.minutes / DAY_TARGET_MINUTES) * 100))
              return (
                <li key={person.id}>
                  <button
                    type="button"
                    onClick={() => onFocusWorker(selected ? '' : person.id)}
                    aria-pressed={selected}
                    className={`w-full rounded-xl px-3 py-2.5 text-left ring-1 transition hover:bg-slate-950/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
                      selected ? 'bg-slate-950/70 ring-cyan-300/50' : 'bg-slate-950/35 ring-amber-300/20'
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-sm font-semibold text-white">{person.name}</span>
                      <span className="shrink-0 text-sm font-bold tabular-nums text-amber-100">{minutesLabel(person.minutes, t)}</span>
                    </span>
                    <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-slate-800" aria-hidden="true">
                      <span className="block h-full rounded-full bg-amber-300" style={{ width: `${fill}%` }} />
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {children}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
        <section className="rounded-2xl border border-white/10 bg-slate-900/80 p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white">{t('adminPeoplePanel')}</h3>
            <button
              type="button"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-300 hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 lg:hidden"
              aria-expanded={peopleOpen}
              aria-controls="admin-people-list"
              onClick={() => setPeopleOpen(current => !current)}
            >
              <span className="sr-only">{peopleOpen ? t('collapseDetails') : t('expandDetails')}</span>
              <IconChevron className={`h-5 w-5 transition-transform duration-200 motion-reduce:transition-none ${peopleOpen ? 'rotate-180' : ''}`} />
            </button>
          </div>
          <div id="admin-people-list" className={`${peopleOpen ? 'mt-3 block' : 'hidden'} lg:mt-3 lg:block`}>
            <input
              type="search"
              value={rosterSearch}
              onChange={e => onRosterSearch(e.target.value)}
              placeholder={t('workerSearch')}
              aria-label={t('workerSearch')}
              className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
            />
            {emptyPeople ? (
              <p className="mt-3 text-sm text-slate-300">{emptyPeople}</p>
            ) : (
              <ul className="mt-2 max-h-[28rem] space-y-1 overflow-auto">
                {people.map(person => {
                  const selected = focusWorkerId === person.id
                  const statusLabel = person.status === 'off'
                    ? t('planRosterOff')
                    : person.status === 'working'
                      ? t('planRosterBusy')
                      : t('planRosterFree')
                  return (
                    <li key={person.id}>
                      <button
                        type="button"
                        onClick={() => onFocusWorker(selected ? '' : person.id)}
                        aria-pressed={selected}
                        className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
                          selected ? 'bg-cyan-500/15 ring-1 ring-cyan-300/40' : ''
                        }`}
                      >
                        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-cyan-100">
                          {workerInitials(person.name)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-white">{person.name}</span>
                          <span className="mt-0.5 block truncate text-xs text-slate-300">
                            {person.status === 'working'
                              ? `${fillText(t('adminJobCount'), { count: String(person.jobCount) })}${person.minutes != null ? ` · ${minutesLabel(person.minutes, t)}` : ''}${person.short ? ` · ${t('adminUnderHoursTitle')}` : ''} · ${statusLabel}`
                              : person.status === 'off'
                                ? `${person.label} · ${statusLabel}`
                                : statusLabel}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-sm font-semibold text-white">{t('adminJobsPanel')}</h3>
          {sortedJobs.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-slate-900/80 px-5 py-8 text-center">
              <p className="text-sm text-slate-300">{emptyJobs}</p>
              {!jobFormOpen && (
                <button
                  type="button"
                  onClick={openForm}
                  className="mt-4 inline-flex min-h-12 items-center justify-center rounded-2xl bg-cyan-600 px-5 text-sm font-semibold text-white hover:bg-cyan-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
                >
                  {t('adminCreateFirstJob')}
                </button>
              )}
            </div>
          ) : (
            <ol className="relative space-y-2">
              {focusWorkerId && !visibleJobs.length && (
                <li className="rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-300">
                  {t('adminJobsForWorkerEmpty')}
                </li>
              )}
              {sortedJobs.map(job => {
                const open = boardOpenId === job.id
                const matched = !focusWorkerId || jobHasWorker(job, focusWorkerId)
                const object = objects.find(item => item.id === job.object_id)
                const place = job.object_name || job.location_text || t('planNoPlace')
                const area = shortPlace(job, object)
                const peopleNames = (job.work_job_assignees ?? [])
                  .filter(row => ['assigned', 'approved'].includes(row.status))
                  .map(row => workerName?.(row.worker_id))
                  .filter(Boolean)
                const start = formatClock(job.start_time)
                const end = formatClock(job.end_time)
                const tone = jobTone(job)
                const detailsId = `admin-job-${job.id}`
                return (
                  <li
                    key={job.id}
                    className={`rounded-2xl border border-white/10 bg-slate-900/80 transition duration-200 motion-reduce:transition-none ${
                      open ? 'relative z-20' : ''
                    } ${matched ? '' : 'opacity-40'}`}
                  >
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-controls={detailsId}
                      aria-label={`${place}${start ? ` ${start}` : ''}. ${open ? t('collapseDetails') : t('expandDetails')}`}
                      onClick={() => onToggleJob(job.id)}
                      className="flex min-h-12 w-full items-stretch gap-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                    >
                      <span className={`w-1 shrink-0 rounded-l-2xl ${TONE[tone]}`} aria-hidden="true" />
                      <span className="grid w-full grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 sm:grid-cols-[5.5rem_minmax(0,1fr)_auto]">
                        <span className="text-sm font-bold tabular-nums text-white">
                          {start || '—'}
                          {end && start ? <span className="mt-0.5 block text-[11px] font-semibold text-slate-400">{end}</span> : null}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-white">{place}</span>
                          <span className="mt-0.5 block truncate text-xs text-slate-300">
                            {[area && area !== place ? area : '', peopleNames.join(', ') || t('adminJobUnassigned')].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="hidden max-w-[9rem] truncate text-xs font-semibold text-slate-200 sm:inline">{jobStatusLabel(job, t)}</span>
                          <IconChevron className={`h-5 w-5 shrink-0 text-slate-400 transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
                        </span>
                      </span>
                    </button>
                    <div
                      id={detailsId}
                      className={`border-white/10 transition-[max-height,opacity] duration-200 motion-reduce:transition-none ${
                        open ? 'max-h-none overflow-visible border-t opacity-100' : 'max-h-0 overflow-hidden opacity-0'
                      }`}
                    >
                      {open && (
                        <div className="px-3 pb-3 pt-2">
                          <p className="mb-2 text-xs font-semibold text-slate-300 sm:hidden">{jobStatusLabel(job, t)}</p>
                          {renderJob?.(job)}
                        </div>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
          {focusWorkerId && dimmedCount > 0 && (
            <p className="mt-2 text-xs text-slate-400">{fillText(t('adminOtherJobsDimmed'), { count: String(dimmedCount) })}</p>
          )}
        </section>
      </div>

      {!jobFormOpen && (
        <div className="pointer-events-none xl:hidden">
          <div className="h-16" aria-hidden="true" />
          <div
            className="pointer-events-auto fixed inset-x-3 z-30 xl:hidden"
            style={{ bottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            <button
              type="button"
              onClick={openForm}
              className="mx-auto flex min-h-12 w-full max-w-[1680px] items-center justify-center rounded-2xl bg-cyan-600 px-4 text-sm font-semibold text-white shadow-lg shadow-slate-950/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
            >
              {t('adminNewJobPlus')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
