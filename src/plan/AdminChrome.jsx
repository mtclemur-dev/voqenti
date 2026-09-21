import { useEffect, useRef, useState } from 'react'
import { IconBell, IconUser } from './icons'
import { firstName, useGreetingKey } from './planUtils'

function navClass(active, compact = false) {
  return `min-h-11 rounded-xl font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
    compact ? 'px-2.5 text-[13px]' : 'px-3 text-sm'
  } ${active ? 'bg-cyan-600 text-white' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'}`
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

function NavMenu({ id, label, active, open, onToggle, children }) {
  return (
    <div className="relative" data-nav-menu={id}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={onToggle}
        className={navClass(active, true)}
      >
        {label}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 z-30 mt-1 min-w-44 rounded-xl border border-white/10 bg-slate-900 p-1 shadow-lg shadow-slate-950/40"
        >
          {children}
        </div>
      )}
    </div>
  )
}

function menuItemClass(active) {
  return `block min-h-11 w-full rounded-lg px-3 text-left text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
    active ? 'bg-cyan-600 text-white' : 'text-slate-200 hover:bg-slate-800'
  }`
}

export function AdminPrimaryNav({ t, view, onOpenView, showMine = false, inboxOpen = false, onOpenInbox }) {
  const [menu, setMenu] = useState('')
  const rootRef = useRef(null)
  const adminViews = ['pontaj', 'reports', 'times', 'materials']
  const moreActive = ['openPosts', 'guides', 'history', ...adminViews].includes(view)
  const commActive = view === 'notices' || inboxOpen

  useEffect(() => {
    setMenu('')
  }, [view, inboxOpen])

  useEffect(() => {
    if (!menu) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') setMenu('')
    }
    const onPointer = (event) => {
      if (!rootRef.current?.contains(event.target)) setMenu('')
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer)
    }
  }, [menu])

  const openView = (next) => {
    setMenu('')
    onOpenView(next)
  }

  return (
    <nav ref={rootRef} aria-label={t('mainNav')} className="mb-4 flex flex-wrap gap-1.5">
      <button type="button" onClick={() => openView('plan')} className={navClass(view === 'plan', true)}>
        {t('adminNavPlan')}
      </button>
      {showMine && (
        <button type="button" onClick={() => openView('mine')} className={navClass(view === 'mine', true)}>
          {t('navHome')}
        </button>
      )}
      {showMine && (
        <button type="button" onClick={() => openView('hours')} className={navClass(view === 'hours', true)}>
          {t('navHours')}
        </button>
      )}
      <NavMenu
        id="comm"
        label={t('adminNavComm')}
        active={commActive}
        open={menu === 'comm'}
        onToggle={() => setMenu(current => current === 'comm' ? '' : 'comm')}
      >
        <button type="button" role="menuitem" onClick={() => openView('notices')} className={menuItemClass(view === 'notices')}>
          {t('notices')}
        </button>
        {onOpenInbox && (
          <button type="button" role="menuitem" onClick={() => { setMenu(''); onOpenInbox() }} className={menuItemClass(inboxOpen)}>
            {t('inbox')}
          </button>
        )}
      </NavMenu>
      <NavMenu
        id="more"
        label={t('adminNavMore')}
        active={moreActive}
        open={menu === 'more'}
        onToggle={() => setMenu(current => current === 'more' ? '' : 'more')}
      >
        <button type="button" role="menuitem" onClick={() => openView('openPosts')} className={menuItemClass(view === 'openPosts')}>
          {t('openPosts')}
        </button>
        <button type="button" role="menuitem" onClick={() => openView('guides')} className={menuItemClass(view === 'guides')}>
          {t('guides')}
        </button>
        <button type="button" role="menuitem" onClick={() => openView('history')} className={menuItemClass(view === 'history')}>
          {t('history')}
        </button>
        <button type="button" role="menuitem" onClick={() => openView('pontaj')} className={menuItemClass(adminViews.includes(view))}>
          {t('adminMenu')}
        </button>
      </NavMenu>
    </nav>
  )
}
