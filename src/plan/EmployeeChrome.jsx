import { useEffect, useState } from 'react'
import { DateTime } from 'luxon'
import { supabase } from '../supabaseClient'
import { IconBell, IconClock, IconClose, IconHome, IconTips, IconUser } from './icons'
import { assignmentRange, firstName, isAssignmentActive, nextShiftText, sortPlanRows, useGreetingKey } from './planUtils'

function IconButton({ label, active = false, onClick, children, badge = 0 }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`relative inline-flex min-h-12 min-w-12 items-center justify-center rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${active ? 'bg-cyan-500 text-slate-950' : 'bg-slate-800 text-slate-100'}`}
    >
      {children}
      {badge > 0 && (
        <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-bold text-slate-950">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  )
}

export function EmployeeHeader({
  t,
  language,
  currentWorker,
  displayName,
  unread = 0,
  onOpenInbox,
  nextJob: nextJobProp,
}) {
  const helloKey = useGreetingKey()
  const [today] = useState(() => DateTime.now().setZone('Europe/Berlin').toISODate())
  const [nextJob, setNextJob] = useState(nextJobProp ?? null)
  const [nextStart, setNextStart] = useState('')
  const name = firstName(currentWorker?.name || displayName)

  useEffect(() => {
    if (nextJobProp) {
      setNextJob(nextJobProp)
      setNextStart('')
      return undefined
    }
    let cancelled = false
    const load = async () => {
      if (!currentWorker?.id) {
        setNextJob(null)
        setNextStart('')
        return
      }
      const { data } = await supabase
        .from('work_job_assignees')
        .select('*, work_jobs!inner(*)')
        .eq('worker_id', currentWorker.id)
        .in('status', ['assigned', 'approved'])
        .gte('work_jobs.work_date', today)
      if (cancelled) return
      const rows = (data ?? [])
        .filter(row => isAssignmentActive(row) && row.work_jobs.work_date >= today)
        .sort(sortPlanRows)
      setNextJob(rows[0]?.work_jobs ?? null)
      setNextStart(assignmentRange(rows[0]).start)
    }
    load()
    return () => { cancelled = true }
  }, [currentWorker?.id, nextJobProp, today])

  return (
    <header className="mb-5 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-lg font-bold text-white">
          {t(helloKey)}, {name || t('planUnknownWorker')}
        </p>
        <p className="mt-1 text-sm text-slate-300">{nextShiftText(nextJob, today, t, language, nextStart)}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <IconButton label={t('inbox')} onClick={onOpenInbox} badge={unread}>
          <IconBell />
        </IconButton>
      </div>
    </header>
  )
}

export function EmployeeProfilePanel({
  t,
  language,
  languages,
  open,
  onClose,
  onLanguageChange,
  onSignOut,
  showHelp = false,
  onOpenHelp,
  notifyPermission = 'granted',
  onEnableNotifications,
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/70 sm:items-center">
      <button type="button" className="absolute inset-0" aria-label={t('close')} onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('profile')}
        className="relative w-full max-w-sm rounded-t-3xl border border-slate-700 bg-slate-900 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-3xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">{t('profile')}</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-slate-800 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
            aria-label={t('close')}
          >
            <IconClose />
          </button>
        </div>
        <label className="block text-sm text-slate-300">
          {t('language')}
          <select
            value={language}
            onChange={event => onLanguageChange(event.target.value)}
            className="mt-2 min-h-12 w-full rounded-xl bg-slate-800 px-3 text-base text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            {languages.map(item => (
              <option key={item.code} value={item.code}>{item.label}</option>
            ))}
          </select>
        </label>
        {showHelp && (
          <button
            type="button"
            onClick={onOpenHelp}
            className="mt-4 min-h-12 w-full rounded-xl bg-slate-800 px-4 text-sm font-semibold text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            {t('navHelp')}
          </button>
        )}
        {onEnableNotifications && notifyPermission !== 'granted' && notifyPermission !== 'unsupported' && (
          <button
            type="button"
            onClick={onEnableNotifications}
            className="mt-4 min-h-12 w-full rounded-xl bg-amber-300 px-4 text-sm font-semibold text-slate-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            {t('enableNotifications')}
          </button>
        )}
        <button
          type="button"
          onClick={onSignOut}
          className="mt-6 min-h-12 w-full rounded-xl bg-slate-800/80 px-4 text-sm font-semibold text-slate-300 ring-1 ring-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          {t('signOut')}
        </button>
      </div>
    </div>
  )
}

export function EmployeeBottomNav({ t, view, onOpenView, onOpenInbox, onOpenProfile, inboxOpen = false, profileOpen = false, unread = 0 }) {
  const items = [
    { id: 'plan', label: t('navHome'), icon: IconHome, action: () => onOpenView('plan') },
    { id: 'hours', label: t('navHours'), icon: IconClock, action: () => onOpenView('hours') },
    { id: 'guides', label: t('navTips'), icon: IconTips, action: () => onOpenView('guides') },
    { id: 'inbox', label: t('navInbox'), icon: IconBell, action: onOpenInbox, badge: unread, active: inboxOpen },
    { id: 'profile', label: t('profile'), icon: IconUser, action: onOpenProfile, active: profileOpen },
  ]
  return (
    <nav
      aria-label={t('mainNav')}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-slate-950/95 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden"
    >
      <div className={`mx-auto grid max-w-lg gap-1 ${items.length === 5 ? 'grid-cols-5' : 'grid-cols-4'}`}>
        {items.map(item => {
          const Icon = item.icon
          const active = item.active || view === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={item.action}
              className={`relative flex min-h-12 flex-col items-center justify-center rounded-xl px-1 text-[11px] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${active ? 'text-cyan-200' : 'text-slate-400'}`}
            >
              <Icon className="h-5 w-5" />
              <span className="mt-0.5 truncate">{item.label}</span>
              {item.badge > 0 && (
                <span className="absolute right-2 top-0 inline-flex min-w-4 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-bold text-slate-950">
                  {item.badge > 9 ? '9+' : item.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

export function EmployeeDesktopNav({ t, view, onOpenView, onOpenInbox, onOpenProfile, unread = 0, showHelp = false }) {
  const items = [
    { id: 'plan', label: t('navHome') },
    { id: 'hours', label: t('navHours') },
    showHelp && { id: 'openPosts', label: t('navHelp') },
    { id: 'guides', label: t('navTips') },
  ].filter(Boolean)
  return (
    <div className="mb-5 hidden flex-wrap gap-2 md:flex">
      {items.map(item => (
        <button
          key={item.id}
          type="button"
          onClick={() => onOpenView(item.id)}
          className={`min-h-11 rounded-xl px-4 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${view === item.id ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-200'}`}
        >
          {item.label}
        </button>
      ))}
      <button
        type="button"
        onClick={onOpenInbox}
        className="relative min-h-11 rounded-xl bg-slate-800 px-4 text-sm font-semibold text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
      >
        {t('inbox')}
        {unread > 0 && <span className="ml-2 rounded-full bg-amber-400 px-1.5 text-[10px] font-bold text-slate-950">{unread}</span>}
      </button>
      <button
        type="button"
        onClick={onOpenProfile}
        className="min-h-11 rounded-xl bg-slate-800 px-4 text-sm font-semibold text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
      >
        {t('profile')}
      </button>
    </div>
  )
}
