import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconMore } from './icons'

function clampMenu(x, y, width = 240, height = 220) {
  const maxX = Math.max(8, window.innerWidth - width - 8)
  const maxY = Math.max(8, window.innerHeight - height - 8)
  return {
    x: Math.min(Math.max(8, x), maxX),
    y: Math.min(Math.max(8, y), maxY),
  }
}

function Overlay({ children, onClose }) {
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/70 p-3 sm:items-center" role="presentation" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900 p-4 shadow-2xl"
        onMouseDown={event => event.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}

export default function WorkerShortcutRow({
  t,
  person,
  jobs = [],
  canAssign = true,
  onMessage,
  onAddToJobs,
  onStartJob,
  busy = false,
  children,
}) {
  const [menu, setMenu] = useState(null)
  const [mode, setMode] = useState('')
  const [text, setText] = useState('')
  const [picked, setPicked] = useState([])
  const holdRef = useRef(0)
  const openedAt = useRef(0)

  useEffect(() => {
    if (!menu) return undefined
    const close = () => {
      if (Date.now() - openedAt.current < 400) return
      setMenu(null)
    }
    const onKey = (event) => {
      if (event.key === 'Escape') setMenu(null)
    }
    window.addEventListener('click', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  const openMenu = (event, x, y) => {
    event.preventDefault()
    event.stopPropagation()
    openedAt.current = Date.now()
    setMenu(clampMenu(x, y))
  }

  const startHold = (event) => {
    if (event.pointerType !== 'touch') return
    window.clearTimeout(holdRef.current)
    holdRef.current = window.setTimeout(() => {
      openMenu(event, event.clientX, event.clientY)
    }, 450)
  }

  const cancelHold = () => {
    window.clearTimeout(holdRef.current)
  }

  const closeAll = () => {
    setMenu(null)
    setMode('')
    setText('')
    setPicked([])
  }

  const choose = (next) => {
    setMenu(null)
    if (next === 'new') {
      onStartJob?.(person.id)
      return
    }
    setMode(next)
    setText('')
    setPicked([])
  }

  const sendMessage = async () => {
    const ok = await onMessage?.(person.id, text)
    if (ok !== false) closeAll()
  }

  const addToJobs = async () => {
    const ok = await onAddToJobs?.(person.id, picked)
    if (ok !== false) closeAll()
  }

  const toggleJob = (jobId, disabled) => {
    if (disabled) return
    setPicked(current => (current.includes(jobId) ? current.filter(id => id !== jobId) : [...current, jobId]))
  }

  return (
    <div
      className="flex items-stretch gap-1"
      onContextMenu={event => openMenu(event, event.clientX, event.clientY)}
      onPointerDown={startHold}
      onPointerUp={cancelHold}
      onPointerCancel={cancelHold}
      onPointerLeave={cancelHold}
    >
      <div className="min-w-0 flex-1">{children}</div>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={Boolean(menu)}
        aria-label={t('workerShortcuts')}
        onClick={event => openMenu(event, event.clientX, event.clientY)}
        className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-slate-300 hover:bg-slate-800 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
      >
        <IconMore />
      </button>

      {menu && createPortal(
        <div
          role="menu"
          className="fixed z-[80] min-w-[15rem] rounded-2xl border border-slate-700 bg-slate-900 p-1 shadow-2xl"
          style={{ left: menu.x, top: menu.y }}
          onClick={event => event.stopPropagation()}
        >
          <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {person.name}
          </p>
          <button
            type="button"
            role="menuitem"
            onClick={() => choose('message')}
            className="block min-h-11 w-full rounded-xl px-3 text-left text-sm text-white hover:bg-slate-800"
          >
            {t('workerShortcutMessage')}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!canAssign}
            onClick={() => choose('add')}
            className="block min-h-11 w-full rounded-xl px-3 text-left text-sm text-white hover:bg-slate-800 disabled:opacity-40"
          >
            {t('workerShortcutAdd')}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!canAssign}
            onClick={() => choose('new')}
            className="block min-h-11 w-full rounded-xl px-3 text-left text-sm text-white hover:bg-slate-800 disabled:opacity-40"
          >
            {t('workerShortcutNew')}
          </button>
        </div>,
        document.body,
      )}

      {mode === 'message' && (
        <Overlay onClose={closeAll}>
          <p className="text-sm font-semibold text-white">{t('workerMessageTitle').replace('{name}', person.name)}</p>
          <textarea
            value={text}
            onChange={event => setText(event.target.value)}
            placeholder={t('workerMessagePlaceholder')}
            rows={4}
            className="mt-3 min-h-28 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          />
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={closeAll} className="min-h-11 flex-1 rounded-xl bg-slate-800 text-sm font-semibold text-white">
              {t('cancel')}
            </button>
            <button
              type="button"
              disabled={busy || !text.trim()}
              onClick={sendMessage}
              className="min-h-11 flex-1 rounded-xl bg-cyan-600 text-sm font-semibold text-white disabled:bg-slate-700"
            >
              {busy ? t('saving') : t('workerMessageSend')}
            </button>
          </div>
        </Overlay>
      )}

      {mode === 'add' && (
        <Overlay onClose={closeAll}>
          <p className="text-sm font-semibold text-white">{t('workerAddJobTitle').replace('{name}', person.name)}</p>
          {jobs.length === 0 ? (
            <p className="mt-3 text-sm text-slate-300">{t('workerAddJobEmpty')}</p>
          ) : (
            <ul className="mt-3 max-h-64 space-y-1 overflow-auto">
              {jobs.map(job => {
                const blocked = job.overlap
                const on = picked.includes(job.id)
                return (
                  <li key={job.id}>
                    <button
                      type="button"
                      disabled={blocked}
                      onClick={() => toggleJob(job.id, blocked)}
                      className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-xl px-3 text-left text-sm ${
                        blocked
                          ? 'cursor-not-allowed bg-slate-950/40 text-slate-500'
                          : on
                            ? 'bg-cyan-500/15 text-white ring-1 ring-cyan-300/40'
                            : 'bg-slate-950/60 text-slate-100 hover:bg-slate-800'
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{job.place}</span>
                        <span className="block text-xs text-slate-400">
                          {[job.start, job.end].filter(Boolean).join(' – ') || '—'}
                          {job.declined ? ` · ${t('planDeclined')}` : ''}
                          {blocked ? ` · ${t('workerAddJobOverlap')}` : ''}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={closeAll} className="min-h-11 flex-1 rounded-xl bg-slate-800 text-sm font-semibold text-white">
              {t('cancel')}
            </button>
            <button
              type="button"
              disabled={busy || !picked.length}
              onClick={addToJobs}
              className="min-h-11 flex-1 rounded-xl bg-cyan-600 text-sm font-semibold text-white disabled:bg-slate-700"
            >
              {busy ? t('saving') : t('workerAddJobConfirm')}
            </button>
          </div>
        </Overlay>
      )}
    </div>
  )
}
