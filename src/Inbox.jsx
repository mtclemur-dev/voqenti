import { useCallback, useEffect, useRef, useState } from 'react'
import { DateTime } from 'luxon'
import { supabase } from './supabaseClient'
import { debounce } from './plan/planUtils'
import { scheduleJobReminders, showJobNotice } from './plan/jobReminders'

function notificationJobDate(item) {
  const match = String(item?.work_jobs?.work_date || '').match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : ''
}

function isPastJobNotification(item, today) {
  const date = notificationJobDate(item)
  return Boolean(date && today && date < today)
}

function isMissingTable(error) {
  const message = error?.message?.toLowerCase() ?? ''
  return error?.code === '42P01' || message.includes('does not exist') || message.includes('schema cache')
}

function labelFor(item, t) {
  const translated = t(item.title)
  return {
    title: translated === item.title && item.title?.startsWith('notify') ? t('inbox') : translated,
    body: item.body || '',
  }
}

export default function Inbox({
  t,
  isAdmin,
  currentWorker,
  onOpenView,
  open,
  onOpenChange,
  hideTrigger = false,
  onUnreadChange,
}) {
  const [internalOpen, setInternalOpen] = useState(false)
  const [items, setItems] = useState([])
  const [available, setAvailable] = useState(true)
  const seenIds = useRef(new Set())
  const ready = useRef(false)
  const tRef = useRef(t)
  const workerId = currentWorker?.id
  const isOpen = open ?? internalOpen
  const setIsOpen = onOpenChange ?? setInternalOpen

  useEffect(() => {
    tRef.current = t
  }, [t])

  const loadItems = useCallback(async () => {
    let query = supabase
      .from('work_notifications')
      .select('*, work_jobs(id, status, work_date)')
      .order('created_at', { ascending: false })
      .limit(40)

    if (isAdmin && workerId) {
      query = query.or(`audience.eq.planner,worker_id.eq.${workerId}`)
    } else if (isAdmin) {
      query = query.eq('audience', 'planner')
    } else if (workerId) {
      query = query.eq('worker_id', workerId).eq('audience', 'worker')
    } else {
      setItems([])
      onUnreadChange?.(0)
      return
    }

    let { data, error } = await query
    if (error && !isMissingTable(error)) {
      query = supabase.from('work_notifications').select('*').order('created_at', { ascending: false }).limit(40)
      if (isAdmin && workerId) {
        query = query.or(`audience.eq.planner,worker_id.eq.${workerId}`)
      } else if (isAdmin) {
        query = query.eq('audience', 'planner')
      } else if (workerId) {
        query = query.eq('worker_id', workerId).eq('audience', 'worker')
      }
      const fallback = await query
      data = fallback.data
      error = fallback.error
    }
    if (error) {
      if (isMissingTable(error)) setAvailable(false)
      return
    }
    setAvailable(true)
    const today = DateTime.now().setZone('Europe/Berlin').toISODate()
    const rows = (data ?? []).filter(item => {
      if (!item.job_id) return true
      const status = item.work_jobs?.status
      return Boolean(status) && status !== 'cancelled' && status !== 'canceled'
    })
    const staleIds = rows.filter(item => isPastJobNotification(item, today) && !item.read_at).map(item => item.id)
    const live = rows.filter(item => !isPastJobNotification(item, today))
    for (const row of live) {
      const isNew = !seenIds.current.has(row.id)
      if (!row.read_at && isNew) {
        const copy = labelFor(row, tRef.current)
        if (ready.current) showJobNotice(copy.title, copy.body, row.id)
        if (!isAdmin && row.job_id) {
          scheduleJobReminders({
            jobId: row.job_id,
            title: tRef.current('notifyReminder'),
            body: copy.body || copy.title,
            workDate: row.work_jobs?.work_date,
          })
        }
      }
      seenIds.current.add(row.id)
    }
    ready.current = true
    setItems(live)
    onUnreadChange?.(live.filter(item => !item.read_at).length)
    if (staleIds.length) {
      await supabase
        .from('work_notifications')
        .update({ read_at: new Date().toISOString() })
        .in('id', staleIds)
    }
  }, [isAdmin, onUnreadChange, workerId])

  useEffect(() => {
    loadItems()
    const refresh = debounce(loadItems, 500)
    const channel = supabase
      .channel(`work-inbox-${workerId || 'anon'}-${isAdmin ? 'admin' : 'worker'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_notifications' }, refresh)
      .subscribe()
    return () => {
      refresh.cancel()
      supabase.removeChannel(channel)
    }
  }, [isAdmin, loadItems, workerId])

  const unread = items.filter(item => !item.read_at).length

  const markRead = async (ids) => {
    if (!ids.length) return
    await supabase
      .from('work_notifications')
      .update({ read_at: new Date().toISOString() })
      .in('id', ids)
    loadItems()
  }

  const openItem = async (item) => {
    await markRead([item.id])
    setIsOpen(false)
    if (item.kind === 'open_post') onOpenView('openPosts')
    else onOpenView('plan')
  }

  if (!available) return null

  return (
    <div className={`relative ${hideTrigger ? '' : ''}`}>
      {!hideTrigger && (
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`relative min-h-11 rounded-md px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${isOpen ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-200'}`}
        >
          {t('inbox')}
          {unread > 0 && (
            <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-black text-slate-950">
              {unread}
            </span>
          )}
        </button>
      )}
      {isOpen && (
        <div className={`z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-slate-700 bg-slate-950 p-3 shadow-2xl ${hideTrigger ? 'fixed right-4 top-20' : 'absolute right-0'}`}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-white">{t('inbox')}</p>
            <div className="flex items-center gap-2">
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markRead(items.filter(item => !item.read_at).map(item => item.id))}
                className="min-h-11 text-xs font-semibold text-cyan-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
              >
                {t('inboxMarkRead')}
              </button>
            )}
            <button type="button" onClick={() => setIsOpen(false)} className="min-h-11 px-2 text-sm text-slate-300">{t('close')}</button>
            </div>
          </div>
          {items.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-slate-400">{t('inboxEmpty')}</p>
          ) : (
            <div className="max-h-80 space-y-2 overflow-auto">
              {items.map(item => {
                const copy = labelFor(item, t)
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openItem(item)}
                    className={`w-full rounded-xl px-3 py-2 text-left ${item.read_at ? 'bg-slate-900 text-slate-300' : 'bg-cyan-500/15 text-white'}`}
                  >
                    <p className="text-sm font-semibold">{copy.title}</p>
                    {copy.body && <p className="mt-1 text-xs text-slate-300">{copy.body}</p>}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
