import { IconBell, IconUser } from './icons'
import { firstName, useGreetingKey } from './planUtils'

function navClass(active) {
  return `min-h-11 rounded-xl px-3 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
    active ? 'bg-cyan-600 text-white' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'
  }`
}

export function AdminHeader({ t, displayName, unread = 0, onOpenInbox, onOpenProfile }) {
  const helloKey = useGreetingKey()
  const name = firstName(displayName)
  return (
    <header className="mb-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-lg font-black tracking-tight text-white">Voqenti</p>
        <p className="truncate text-sm text-slate-300">
          {t(helloKey)}{name ? `, ${name}` : ''}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={onOpenInbox}
          aria-label={t('inbox')}
          className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-slate-800 text-slate-100 hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          <IconBell />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-bold text-slate-950">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={onOpenProfile}
          aria-label={t('profile')}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-slate-800 text-slate-100 hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          <IconUser />
        </button>
      </div>
    </header>
  )
}

export function AdminPrimaryNav({ t, view, onOpenView, showMine = false }) {
  const adminViews = ['pontaj', 'reports', 'times', 'materials']
  const items = [
    { id: 'plan', label: t('adminNavPlan'), active: view === 'plan' },
    showMine && { id: 'mine', label: t('navHome'), active: view === 'mine' },
    showMine && { id: 'hours', label: t('navHours'), active: view === 'hours' },
    { id: 'openPosts', label: t('openPosts'), active: view === 'openPosts' },
    { id: 'notices', label: t('notices'), active: view === 'notices' },
    { id: 'guides', label: t('guides'), active: view === 'guides' },
    { id: 'history', label: t('history'), active: view === 'history' },
    { id: 'pontaj', label: t('adminMenu'), active: adminViews.includes(view) },
  ].filter(Boolean)
  return (
    <nav aria-label={t('mainNav')} className="mb-4 flex flex-wrap gap-1.5">
      {items.map(item => (
        <button
          key={item.id}
          type="button"
          onClick={() => onOpenView(item.id)}
          className={navClass(item.active)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  )
}
