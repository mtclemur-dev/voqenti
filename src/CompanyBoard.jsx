import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DateTime } from 'luxon'
import { supabase } from './supabaseClient'
import SafetyShoeLesson from './guides/SafetyShoeLesson'
import { isSafetyShoeLessonDone } from './guides/safetyShoesContent'
import { debounce } from './plan/planUtils'

function isMissingTable(error) {
  const message = error?.message?.toLowerCase() ?? ''
  return error?.code === '42P01' || message.includes('does not exist') || message.includes('schema cache')
}

function youtubeId(url) {
  if (!url) return null
  const match = String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/)
  return match?.[1] ?? null
}

function berlinToday() {
  return DateTime.now().setZone('Europe/Berlin').toISODate()
}

function pickDaily(items) {
  if (!items.length) return null
  const day = DateTime.now().setZone('Europe/Berlin').ordinal
  return items[day % items.length]
}

function coverEmoji(item) {
  if (item.topic === 'attention') return '⚠️'
  const emojis = ['✨', '🧼', '🔑', '💧', '🧰', '🌟', '🏡', '🧤']
  let hash = 0
  for (const char of item.title || '') hash = (hash + char.charCodeAt(0)) % emojis.length
  return emojis[hash]
}

function readStoreKey(userId) {
  return `voqenti-guide-days-${userId || 'guest'}`
}

function loadReadDays(userId) {
  try {
    const parsed = JSON.parse(localStorage.getItem(readStoreKey(userId)) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function countStreak(days) {
  const set = new Set(days)
  let streak = 0
  let cursor = DateTime.now().setZone('Europe/Berlin').startOf('day')
  while (set.has(cursor.toISODate())) {
    streak += 1
    cursor = cursor.minus({ days: 1 })
  }
  return streak
}

const emptyNotice = () => ({ title: '', body: '' })
const emptyGuide = () => ({ title: '', body: '', topic: 'method', pinned: true, cover_url: '', video_url: '' })

function GuideCard({ item, featured = false, t, isAdmin, onEdit, onDelete, onOpen }) {
  const [open, setOpen] = useState(featured)
  const video = youtubeId(item.video_url)
  const isAttention = item.topic === 'attention'
  const toggle = () => {
    setOpen(current => {
      const next = !current
      if (next && onOpen) onOpen(item)
      return next
    })
  }
  return (
    <article className={`overflow-hidden rounded-[1.75rem] border shadow-xl ${
      featured
        ? 'border-cyan-300/35 bg-gradient-to-br from-cyan-400/20 via-slate-900 to-fuchsia-500/20'
        : isAttention
          ? 'border-amber-300/25 bg-gradient-to-br from-amber-400/15 to-slate-900'
          : 'border-emerald-300/20 bg-gradient-to-br from-emerald-400/10 to-slate-900'
    }`}>
      {item.cover_url ? (
        <img src={item.cover_url} alt="" className={`w-full object-cover ${featured ? 'h-44 sm:h-56' : 'h-36 sm:h-44'}`} />
      ) : (
        <div className={`flex items-center justify-center text-6xl ${featured ? 'h-36' : 'h-24'}`}>
          {coverEmoji(item)}
        </div>
      )}
      <div className="p-5">
        <div className="flex items-center justify-between gap-2">
          <p className={`text-[11px] font-black uppercase tracking-[0.28em] ${isAttention ? 'text-amber-200' : 'text-cyan-200'}`}>
            {featured ? t('guideToday') : (isAttention ? t('guideAttention') : t('guideMethod'))}
          </p>
          {item.pinned && <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white">{t('guidePinned')}</span>}
        </div>
        <h3 className={`${featured ? 'text-2xl' : 'text-lg'} mt-2 font-black text-white`}>{item.title}</h3>
        {open ? (
          <>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-100">{item.body}</p>
            {video && (
              <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
                <iframe
                  title={item.title}
                  src={`https://www.youtube.com/embed/${video}`}
                  className="aspect-video w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            )}
          </>
        ) : (
          <p className="mt-3 text-sm leading-6 text-slate-300">
            {(item.body || '').slice(0, 110)}{(item.body || '').length > 110 ? '…' : ''}
          </p>
        )}
        <button
          type="button"
          onClick={toggle}
          className="mt-4 w-full rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold text-white hover:bg-white/15"
        >
          {open ? t('guideClose') : t('guideOpen')}
        </button>
        {isAdmin && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => onEdit(item)} className="rounded-md bg-slate-800 px-3 py-2 text-sm font-semibold text-white">{t('edit')}</button>
            <button type="button" onClick={() => onDelete(item)} className="rounded-md bg-rose-500/20 px-3 py-2 text-sm font-semibold text-rose-100">{t('delete')}</button>
          </div>
        )}
      </div>
    </article>
  )
}

export default function CompanyBoard({ t, view, isAdmin, displayName, userId, workers = [], currentWorker, objects = [], onOpenPlan }) {
  const [notices, setNotices] = useState([])
  const [replies, setReplies] = useState([])
  const [noticeForm, setNoticeForm] = useState(emptyNotice)
  const [guideForm, setGuideForm] = useState(emptyGuide)
  const [editingId, setEditingId] = useState(null)
  const [replyDrafts, setReplyDrafts] = useState({})
  const [saving, setSaving] = useState(false)
  const [setupNeeded, setSetupNeeded] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [readDays, setReadDays] = useState(() => loadReadDays(userId))
  const [todayReads, setTodayReads] = useState([])
  const [lessonOpen, setLessonOpen] = useState(false)
  const [lessonDone, setLessonDone] = useState(() => isSafetyShoeLessonDone())
  const migratedReads = useRef(false)
  const today = berlinToday()
  const readToday = readDays.includes(today)
  const streak = countStreak(readDays)
  const activeWorkers = workers.filter(worker => worker.active !== false)

  const board = view === 'guides' ? 'guide' : 'hiring'
  const boardVisible = view === 'notices' || view === 'guides'

  const loadData = useCallback(async () => {
    setErrorMessage('')
    const { data, error } = await supabase
      .from('company_notices')
      .select('*')
      .eq('board', board)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      if (isMissingTable(error)) setSetupNeeded(true)
      setErrorMessage(error.message)
      setNotices([])
      setReplies([])
      return
    }

    setSetupNeeded(false)
    setNotices(data ?? [])

    if (board === 'hiring') {
      const noticeIds = (data ?? []).map(item => item.id)
      if (!noticeIds.length) {
        setReplies([])
      } else {
        const { data: replyData } = await supabase
          .from('company_notice_replies')
          .select('*')
          .in('notice_id', noticeIds)
          .order('created_at', { ascending: true })
        setReplies(replyData ?? [])
      }
    } else {
      setReplies([])
    }
  }, [board])

  const loadReads = useCallback(async () => {
    if (!userId) return
    const todayDate = berlinToday()
    const [{ data: mine, error }, { data: todayRows }] = await Promise.all([
      supabase
        .from('guide_reads')
        .select('id, user_id, worker_id, read_date')
        .eq('user_id', userId)
        .order('read_date', { ascending: false }),
      supabase
        .from('guide_reads')
        .select('id, user_id, worker_id, read_date')
        .eq('read_date', todayDate),
    ])
    if (error) return
    const dates = [...new Set((mine ?? []).map(row => row.read_date))]
    if (dates.length) {
      setReadDays(dates)
      localStorage.setItem(readStoreKey(userId), JSON.stringify(dates))
    } else {
      const local = loadReadDays(userId)
      if (local.length && !migratedReads.current) {
        migratedReads.current = true
        await supabase.from('guide_reads').insert(
          local.map(read_date => ({
            user_id: userId,
            worker_id: currentWorker?.id || null,
            read_date,
          })),
        )
      }
    }
    setTodayReads(todayRows ?? [])
  }, [currentWorker?.id, userId])

  useEffect(() => {
    if (!boardVisible) return undefined
    loadData()
    loadReads()
    const refreshNotices = debounce(loadData, 500)
    const refreshReads = debounce(loadReads, 500)
    const channel = supabase
      .channel(`company-board-${board}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'company_notices' }, refreshNotices)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'company_notice_replies' }, refreshNotices)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guide_reads' }, refreshReads)
      .subscribe()
    return () => {
      refreshNotices.cancel()
      refreshReads.cancel()
      supabase.removeChannel(channel)
    }
  }, [board, boardVisible, loadData, loadReads])

  const repliesByNotice = useMemo(() => {
    return replies.reduce((map, reply) => {
      const list = map[reply.notice_id] ?? []
      list.push(reply)
      map[reply.notice_id] = list
      return map
    }, {})
  }, [replies])

  const resetForms = () => {
    setEditingId(null)
    setNoticeForm(emptyNotice())
    setGuideForm(emptyGuide())
  }

  const handleSaveNotice = async (event) => {
    event.preventDefault()
    if (!isAdmin) return
    const title = noticeForm.title.trim()
    const body = noticeForm.body.trim()
    if (!title || !body) return alert(t('boardFieldsRequired'))

    setSaving(true)
    const payload = {
      board: 'hiring',
      title,
      body,
      author_name: displayName,
      updated_at: new Date().toISOString(),
    }
    const result = editingId
      ? await supabase.from('company_notices').update(payload).eq('id', editingId)
      : await supabase.from('company_notices').insert([payload])
    setSaving(false)
    if (result.error) {
      alert(`${t('boardSaveError')} ${result.error.message}`)
      return
    }
    resetForms()
    loadData()
  }

  const handleSaveGuide = async (event) => {
    event.preventDefault()
    if (!isAdmin) return
    const title = guideForm.title.trim()
    const body = guideForm.body.trim()
    if (!title || !body) return alert(t('boardFieldsRequired'))

    setSaving(true)
    const payload = {
      board: 'guide',
      topic: guideForm.topic,
      title,
      body,
      pinned: Boolean(guideForm.pinned),
      cover_url: guideForm.cover_url.trim() || null,
      video_url: guideForm.video_url.trim() || null,
      author_name: displayName,
      updated_at: new Date().toISOString(),
    }
    let result = editingId
      ? await supabase.from('company_notices').update(payload).eq('id', editingId)
      : await supabase.from('company_notices').insert([payload])
    if (result.error && /cover_url|video_url|schema cache/i.test(result.error.message)) {
      const basic = { ...payload }
      delete basic.cover_url
      delete basic.video_url
      result = editingId
        ? await supabase.from('company_notices').update(basic).eq('id', editingId)
        : await supabase.from('company_notices').insert([basic])
    }
    setSaving(false)
    if (result.error) {
      alert(`${t('boardSaveError')} ${result.error.message}`)
      return
    }
    resetForms()
    loadData()
  }

  const startEdit = (item) => {
    setEditingId(item.id)
    if (item.board === 'guide') {
      setGuideForm({
        title: item.title,
        body: item.body,
        topic: item.topic || 'method',
        pinned: Boolean(item.pinned),
        cover_url: item.cover_url ?? '',
        video_url: item.video_url ?? '',
      })
    } else {
      setNoticeForm({ title: item.title, body: item.body })
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = async (item) => {
    if (!isAdmin) return
    if (!confirm(t('boardDeleteConfirm'))) return
    const { error } = await supabase.from('company_notices').delete().eq('id', item.id)
    if (error) {
      alert(`${t('boardSaveError')} ${error.message}`)
      return
    }
    if (editingId === item.id) resetForms()
    loadData()
  }

  const handleReply = async (noticeId) => {
    const body = (replyDrafts[noticeId] ?? '').trim()
    if (!body) return
    const { error } = await supabase.from('company_notice_replies').insert([{
      notice_id: noticeId,
      body,
      author_name: displayName,
    }])
    if (error) {
      alert(`${t('boardSaveError')} ${error.message}`)
      return
    }
    setReplyDrafts(current => ({ ...current, [noticeId]: '' }))
    loadData()
  }

  const markReadToday = async (notice) => {
    if (readToday && !notice) return
    const next = [...new Set([...readDays, today])]
    setReadDays(next)
    localStorage.setItem(readStoreKey(userId), JSON.stringify(next))
    const { error } = await supabase.from('guide_reads').upsert({
      user_id: userId,
      worker_id: currentWorker?.id || null,
      notice_id: notice?.id || null,
      read_date: today,
    }, { onConflict: 'user_id,read_date' })
    if (!error) loadReads()
  }

  if (setupNeeded) {
    return (
      <div className="rounded-[1.75rem] border border-amber-300/30 bg-amber-400/10 p-6 text-amber-50">
        <p className="text-sm font-semibold">{t('boardSetupTitle')}</p>
        <p className="mt-2 text-sm text-amber-100/90">{t('boardSetupBody')}</p>
      </div>
    )
  }

  if (view === 'guides') {
    const methods = notices.filter(item => item.topic !== 'attention')
    const attention = notices.filter(item => item.topic === 'attention')
    const daily = pickDaily(notices)
    const restMethods = methods.filter(item => item.id !== daily?.id)
    const restAttention = attention.filter(item => item.id !== daily?.id)

    if (lessonOpen) {
      return (
        <SafetyShoeLesson
          t={t}
          objects={objects}
          onOpenPlan={onOpenPlan}
          onClose={() => {
            setLessonOpen(false)
            setLessonDone(isSafetyShoeLessonDone())
          }}
        />
      )
    }

    return (
      <div className="space-y-5">
        <button
          type="button"
          onClick={() => setLessonOpen(true)}
          className="w-full rounded-[1.75rem] border border-cyan-300/25 bg-slate-900/80 p-5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          <p className="text-[11px] font-black uppercase tracking-[0.28em] text-cyan-200">{t('guides')}</p>
          <h3 className="mt-2 text-xl font-black text-white">{t('shoeLessonTitle')}</h3>
          <p className="mt-2 text-sm text-slate-300">{t('shoeLessonLead')}</p>
          {lessonDone && <p className="mt-3 text-xs font-semibold text-cyan-100">{t('shoeLessonDoneBadge')}</p>}
          <span className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-cyan-500 px-4 text-sm font-semibold text-slate-950">
            {t('shoeLessonOpen')}
          </span>
        </button>
        <div className="relative overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-gradient-to-br from-cyan-500/25 via-indigo-600/20 to-fuchsia-500/25 p-6">
          <div className="pointer-events-none absolute -right-6 -top-8 text-8xl opacity-20">✨</div>
          <p className="text-[11px] font-black uppercase tracking-[0.35em] text-cyan-100">{t('guides')}</p>
          <h3 className="mt-2 text-3xl font-black text-white">{t('guidesTitleAttractive')}</h3>
          {t('guidesHintAttractive') && <p className="mt-2 max-w-xl text-sm text-cyan-50/90">{t('guidesHintAttractive')}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white">{t('guideStreak')}: {streak}</span>
            <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white">
              {readToday ? t('guideReadDone') : t('guideReadOpen')}
            </span>
          </div>
          {!readToday && notices.length > 0 && (
            <button
              type="button"
              onClick={() => markReadToday(daily)}
              className="mt-4 w-full rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-black text-slate-950 sm:w-auto"
            >
              {t('guideMarkRead')}
            </button>
          )}
        {isAdmin && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-slate-950/40 p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-200">{t('guideReadBy')}</p>
              <p className="mt-2 text-sm text-white">
                {activeWorkers.filter(worker => todayReads.some(row => row.worker_id === worker.id)).map(worker => worker.name).join(', ') || '—'}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-950/40 p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-200">{t('guideNotReadBy')}</p>
              <p className="mt-2 text-sm text-white">
                {activeWorkers.filter(worker => !todayReads.some(row => row.worker_id === worker.id)).map(worker => worker.name).join(', ') || '—'}
              </p>
            </div>
          </div>
        )}
        </div>

        {isAdmin && (
          <form onSubmit={handleSaveGuide} className="rounded-[1.75rem] bg-slate-900/85 p-5 ring-1 ring-slate-700">
            <p className="text-sm font-semibold text-white">{editingId ? t('guideUpdate') : t('guideCreate')}</p>
            {t('guideMediaHint') && <p className="mt-1 text-xs text-slate-400">{t('guideMediaHint')}</p>}
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => setGuideForm(current => ({ ...current, topic: 'method' }))} className={`rounded-md px-3 py-2 text-sm font-semibold ${guideForm.topic === 'method' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-200'}`}>
                {t('guideMethod')}
              </button>
              <button type="button" onClick={() => setGuideForm(current => ({ ...current, topic: 'attention' }))} className={`rounded-md px-3 py-2 text-sm font-semibold ${guideForm.topic === 'attention' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-200'}`}>
                {t('guideAttention')}
              </button>
            </div>
            <input
              value={guideForm.title}
              onChange={e => setGuideForm(current => ({ ...current, title: e.target.value }))}
              placeholder={t('guideTitlePlaceholder')}
              className="mt-3 w-full rounded-md bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
            <textarea
              value={guideForm.body}
              onChange={e => setGuideForm(current => ({ ...current, body: e.target.value }))}
              rows={6}
              placeholder={t('guideBodyPlaceholder')}
              className="mt-3 w-full rounded-md bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
            <input
              value={guideForm.cover_url}
              onChange={e => setGuideForm(current => ({ ...current, cover_url: e.target.value }))}
              placeholder={t('guideCoverPlaceholder')}
              className="mt-3 w-full rounded-md bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
            <input
              value={guideForm.video_url}
              onChange={e => setGuideForm(current => ({ ...current, video_url: e.target.value }))}
              placeholder={t('guideVideoPlaceholder')}
              className="mt-3 w-full rounded-md bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
            <label className="mt-3 flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={guideForm.pinned} onChange={e => setGuideForm(current => ({ ...current, pinned: e.target.checked }))} />
              {t('guidePinned')}
            </label>
            <button type="submit" disabled={saving} className="mt-4 w-full rounded-xl bg-cyan-600 px-4 py-3 font-semibold text-white disabled:bg-slate-700">
              {saving ? '...' : (editingId ? t('guideUpdate') : t('guideCreate'))}
            </button>
            {editingId && (
              <button type="button" onClick={resetForms} className="mt-2 w-full rounded-xl bg-slate-800 px-4 py-3 font-semibold text-slate-100">
                {t('cancel')}
              </button>
            )}
          </form>
        )}
        {errorMessage && <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{errorMessage}</div>}
        {daily ? (
          <GuideCard item={daily} featured t={t} isAdmin={isAdmin} onEdit={startEdit} onDelete={handleDelete} onOpen={markReadToday} />
        ) : (
          <div className="rounded-[1.75rem] border border-cyan-300/20 bg-slate-900/70 p-6 text-center text-slate-300">{t('guidesEmptyAttractive')}</div>
        )}
        {restMethods.length > 0 && (
          <div className="space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-cyan-200">{t('guideMethod')}</p>
            {restMethods.map(item => (
              <GuideCard key={item.id} item={item} t={t} isAdmin={isAdmin} onEdit={startEdit} onDelete={handleDelete} onOpen={markReadToday} />
            ))}
          </div>
        )}
        {restAttention.length > 0 && (
          <div className="space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-amber-200">{t('guideAttention')}</p>
            {restAttention.map(item => (
              <GuideCard key={item.id} item={item} t={t} isAdmin={isAdmin} onEdit={startEdit} onDelete={handleDelete} onOpen={markReadToday} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] uppercase tracking-[0.25em] text-amber-200">{t('notices')}</p>
        <h3 className="mt-1 text-xl font-black text-white">{t('noticesTitle')}</h3>
        {t('noticesHint') && <p className="mt-2 text-sm text-slate-400">{t('noticesHint')}</p>}
      </div>

      {isAdmin && (
      <form onSubmit={handleSaveNotice} className="rounded-[1.75rem] bg-slate-900/85 p-5 ring-1 ring-slate-700">
        <p className="text-sm font-semibold text-white">{editingId ? t('noticeUpdate') : t('noticeCreate')}</p>
        <input
          value={noticeForm.title}
          onChange={e => setNoticeForm(current => ({ ...current, title: e.target.value }))}
          placeholder={t('noticeTitlePlaceholder')}
          className="mt-3 w-full rounded-md bg-slate-950 px-3 py-2 text-sm text-slate-100"
        />
        <textarea
          value={noticeForm.body}
          onChange={e => setNoticeForm(current => ({ ...current, body: e.target.value }))}
          rows={4}
          placeholder={t('noticeBodyPlaceholder')}
          className="mt-3 w-full rounded-md bg-slate-950 px-3 py-2 text-sm text-slate-100"
        />
        <button type="submit" disabled={saving} className="mt-4 w-full rounded-xl bg-amber-500 px-4 py-3 font-semibold text-slate-950 disabled:bg-slate-700 disabled:text-slate-200">
          {saving ? '...' : (editingId ? t('noticeUpdate') : t('noticeCreate'))}
        </button>
        {editingId && (
          <button type="button" onClick={resetForms} className="mt-2 w-full rounded-xl bg-slate-800 px-4 py-3 font-semibold text-slate-100">
            {t('cancel')}
          </button>
        )}
      </form>
      )}

      {errorMessage && <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{errorMessage}</div>}

      {notices.length === 0 ? (
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 text-center text-slate-400">{t('noticesEmpty')}</div>
      ) : notices.map(item => (
        <article key={item.id} className="rounded-3xl border border-amber-300/20 bg-amber-400/10 p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-amber-200">{t('noticeBadge')}</p>
          <h3 className="mt-2 text-lg font-black text-white">{item.title}</h3>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-amber-50">{item.body}</p>
          <p className="mt-3 text-xs text-amber-100/70">{item.author_name} · {DateTime.fromISO(item.created_at).setZone('Europe/Berlin').toFormat('dd.MM.yyyy')}</p>
          {isAdmin && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => startEdit(item)} className="rounded-md bg-slate-800 px-3 py-2 text-sm font-semibold text-white">{t('edit')}</button>
              <button type="button" onClick={() => handleDelete(item)} className="rounded-md bg-rose-500/20 px-3 py-2 text-sm font-semibold text-rose-100">{t('delete')}</button>
            </div>
          )}
          <div className="mt-4 space-y-2">
            {(repliesByNotice[item.id] ?? []).map(reply => (
              <div key={reply.id} className="rounded-xl bg-slate-950/50 px-3 py-2 text-sm text-slate-200">
                <span className="font-semibold text-white">{reply.author_name}: </span>
                {reply.body}
              </div>
            ))}
            <div className="flex gap-2">
              <input
                value={replyDrafts[item.id] ?? ''}
                onChange={e => setReplyDrafts(current => ({ ...current, [item.id]: e.target.value }))}
                placeholder={t('noticeReplyPlaceholder')}
                className="flex-1 rounded-md bg-slate-950 px-3 py-2 text-sm text-slate-100"
              />
              <button type="button" onClick={() => handleReply(item.id)} className="rounded-md bg-slate-800 px-3 py-2 text-sm font-semibold text-white">
                {t('noticeReply')}
              </button>
            </div>
          </div>
        </article>
      ))}
    </div>
  )
}
