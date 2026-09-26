import {
  berlinWeekDays,
  berlinWeekStart,
  dayNumber,
  isWeekend,
  longWeekdayDate,
  monthTitle,
  shiftIso,
  weekdayShort,
} from './planUtils'
import { IconChevron } from './icons'

function JobDots({ count, active, muted = false }) {
  const n = Math.min(Number(count) || 0, 3)
  return (
    <span className="mt-1 flex h-2 items-center justify-center gap-[3px]" aria-hidden="true">
      {n === 0 ? (
        <span className="h-1 w-1 rounded-full bg-transparent" />
      ) : Array.from({ length: n }, (_, index) => (
        <span
          key={index}
          className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-white' : muted ? 'bg-slate-500' : 'bg-cyan-300'}`}
        />
      ))}
    </span>
  )
}

function DayMarks({ mark, t }) {
  const items = []
  if (mark?.problem) items.push({ id: 'problem', className: 'bg-rose-400', label: t('planMarkProblem') })
  if (mark?.attention) items.push({ id: 'attention', className: 'bg-amber-300', label: t('planMarkAttention') })
  if (mark?.jobs && items.length < 2) items.push({ id: 'jobs', className: 'bg-cyan-400', label: t('planMarkJobs') })
  const shown = items.slice(0, 2)
  if (!shown.length) {
    return <span className="mt-1 flex h-2 items-center justify-center" aria-hidden="true" />
  }
  return (
    <span className="mt-1 flex h-2 items-center justify-center gap-1">
      {shown.map(item => (
        <span key={item.id} className={`h-1.5 w-1.5 rounded-full ${item.className}`}>
          <span className="sr-only">{item.label}</span>
        </span>
      ))}
    </span>
  )
}

export default function WeekBoard({
  t,
  language = 'de',
  today,
  selectedDate,
  onSelectDate,
  counts = {},
  marks,
  compact = false,
  hidePast = false,
}) {
  const weekStart = berlinWeekStart(selectedDate || today)
  const days = berlinWeekDays(weekStart)
  const selected = selectedDate && (!hidePast || selectedDate >= today) ? selectedDate : today
  const thisWeekStart = berlinWeekStart(today)
  const canPrev = !hidePast || weekStart > thisWeekStart

  const jump = (date) => {
    if (hidePast && date < today) return
    onSelectDate(date)
  }
  const jumpWeek = (weeks) => {
    const next = shiftIso(weekStart, weeks * 7)
    if (hidePast && next < thisWeekStart) return
    onSelectDate(hidePast && next < today ? today : next)
  }

  return (
    <section className="relative overflow-hidden rounded-[1.85rem] bg-slate-950/80 ring-1 ring-white/10">
      <div className="pointer-events-none absolute -left-10 top-0 h-28 w-28 rounded-full bg-cyan-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-8 top-8 h-24 w-24 rounded-full bg-fuchsia-500/10 blur-3xl" />

      <div className={`relative ${compact ? 'px-3 pb-3 pt-3 sm:px-4' : 'px-4 pb-4 pt-4 sm:px-5'}`}>
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => jumpWeek(-1)}
            disabled={!canPrev}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-white/5 text-slate-200 ring-1 ring-white/10 transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-30"
            aria-label={t('planPrevWeek')}
          >
            <IconChevron className="h-5 w-5 rotate-90" />
          </button>
          <div className="min-w-0 text-center">
            <p className={`truncate font-semibold capitalize tracking-tight text-white ${compact ? 'text-xs' : 'text-sm'}`}>
              {monthTitle(selected, language)}
            </p>
            <button
              type="button"
              onClick={() => jump(today)}
              className={`${compact ? 'mt-0.5 min-h-8 px-2.5' : 'mt-1 min-h-9 px-3'} rounded-full text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
                selected === today
                  ? 'bg-cyan-400 text-slate-950'
                  : 'bg-white/10 text-slate-200 hover:bg-white/15'
              }`}
            >
              {t('planToday')}
            </button>
          </div>
          <button
            type="button"
            onClick={() => jumpWeek(1)}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-white/5 text-slate-200 ring-1 ring-white/10 transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
            aria-label={t('planNextWeek')}
          >
            <IconChevron className="h-5 w-5 -rotate-90" />
          </button>
        </div>

        <div className={`${compact ? 'mt-3' : 'mt-5'} grid grid-cols-7 gap-1`}>
          {days.map(date => (
            <p
              key={`label-${date}`}
              className={`text-center text-[10px] font-semibold uppercase tracking-[0.16em] ${
                isWeekend(date) ? 'text-slate-500' : 'text-slate-400'
              }`}
            >
              {weekdayShort(date, language)}
            </p>
          ))}
          {days.map(date => {
            const past = date < today
            const locked = hidePast && past
            const count = locked ? 0 : (counts[date] || 0)
            const on = selected === date
            const isToday = date === today
            const weekend = isWeekend(date)
            const mark = locked ? null : marks?.[date]
            const markLabel = [
              mark?.jobs ? t('planMarkJobs') : '',
              mark?.attention ? t('planMarkAttention') : '',
              mark?.problem ? t('planMarkProblem') : '',
            ].filter(Boolean).join('. ')
            return (
              <button
                key={date}
                type="button"
                disabled={locked}
                onClick={() => jump(date)}
                aria-current={on ? 'date' : undefined}
                aria-label={`${weekdayShort(date, language)} ${dayNumber(date)}${markLabel ? `. ${markLabel}` : ''}`}
                className="group flex flex-col items-center justify-start pt-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:cursor-default"
              >
                <span
                  className={`flex items-center justify-center rounded-full font-semibold leading-none transition ${
                    compact ? 'h-9 w-9 text-base' : 'h-11 w-11 text-lg'
                  } ${
                    on
                      ? 'bg-cyan-400 text-slate-950 ring-2 ring-cyan-100 shadow-[0_0_0_3px_rgba(34,211,238,0.28)]'
                      : locked
                        ? 'text-slate-600'
                        : isToday
                          ? 'bg-white/10 text-white ring-1 ring-cyan-300/70'
                          : weekend
                            ? 'text-slate-500 hover:bg-white/5 hover:text-slate-200'
                            : 'text-slate-100 hover:bg-white/5'
                  }`}
                >
                  {dayNumber(date)}
                </span>
                {marks ? (
                  <DayMarks mark={mark} t={t} />
                ) : (
                  <JobDots count={count} active={on} muted={past} />
                )}
              </button>
            )
          })}
        </div>

        {!compact && (
          <p className="mt-4 border-t border-white/5 pt-3 text-center text-sm font-medium capitalize text-slate-300">
            {longWeekdayDate(selected, language)}
          </p>
        )}
      </div>
    </section>
  )
}
