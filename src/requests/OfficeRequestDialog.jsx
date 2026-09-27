import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { DateTime } from 'luxon'
import { supabase } from '../supabaseClient'
import OfficeRequestHistory from './OfficeRequestHistory'
import {
  REQUEST_CATEGORIES,
  REQUEST_COLUMNS,
  isMissingTable,
  materialRequestTemplates,
  requestCategoryKey,
} from './requestTemplates'

const EMPTY = {
  category: '',
  message: '',
  quantity: '',
  needed_by: '',
  template: '',
}

export default function OfficeRequestDialog({
  t,
  language = 'de',
  open,
  onClose,
  object = null,
  job = null,
  currentWorker = null,
}) {
  const [form, setForm] = useState(EMPTY)
  const [history, setHistory] = useState([])
  const [vehicle, setVehicle] = useState(null)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')
  const [setupNeeded, setSetupNeeded] = useState(false)
  const [sent, setSent] = useState(false)

  const objectId = object?.id || job?.object_id || ''
  const jobId = job?.id || ''
  const workerId = currentWorker?.id || ''
  const place = object?.name || job?.object_name || t('planNoPlace')

  const title = useMemo(() => {
    if (!form.category) return t('requestTitle')
    return `${t(requestCategoryKey(form.category))} · ${place}`
  }, [form.category, place, t])

  const loadHistory = async () => {
    if (!workerId || !objectId) {
      setHistory([])
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('office_requests')
      .select(REQUEST_COLUMNS)
      .eq('worker_id', workerId)
      .eq('object_id', objectId)
      .order('created_at', { ascending: false })
      .limit(5)
    setLoading(false)
    if (error) {
      if (isMissingTable(error)) {
        setSetupNeeded(true)
        setMessage(t('requestSetup'))
        return
      }
      setMessage(error.message)
      return
    }
    setSetupNeeded(false)
    setHistory(data || [])
  }

  useEffect(() => {
    if (!open) return undefined
    setForm(EMPTY)
    setSent(false)
    setMessage('')
    loadHistory()
    let cancelled = false
    if (workerId) {
      supabase
        .from('vehicles')
        .select('id, plate, name')
        .eq('driver_id', workerId)
        .limit(1)
        .maybeSingle()
        .then(({ data }) => {
          if (!cancelled) setVehicle(data || null)
        })
    }
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      cancelled = true
      window.removeEventListener('keydown', onKey)
    }
  }, [jobId, objectId, open, workerId])

  if (!open) return null

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!form.category || !form.message.trim() || !workerId || sending || setupNeeded) return
    setSending(true)
    setSent(false)
    const { data: sessionData } = await supabase.auth.getUser()
    const userId = sessionData?.user?.id
    if (!userId) {
      setSending(false)
      setMessage(t('requestSendError'))
      return
    }
    const payload = {
      object_id: objectId || null,
      work_job_id: jobId || null,
      vehicle_id: form.category === 'vehicle' && vehicle?.id ? vehicle.id : null,
      worker_id: workerId,
      created_by_user_id: userId,
      category: form.category,
      message: form.message.trim(),
      quantity: form.quantity.trim() || null,
      needed_by: form.needed_by || null,
      priority: 'normal',
      status: 'new',
    }
    const { data, error } = await supabase
      .from('office_requests')
      .insert(payload)
      .select(REQUEST_COLUMNS)
      .single()
    setSending(false)
    if (error) {
      if (isMissingTable(error)) {
        setSetupNeeded(true)
        setMessage(t('requestSetup'))
        return
      }
      setMessage(error.message || t('requestSendError'))
      return
    }
    setSent(true)
    setMessage(t('requestSent'))
    setForm(EMPTY)
    if (data) setHistory(current => [data, ...current].slice(0, 5))
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/75 p-0 sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="office-request-title"
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border border-slate-700 bg-slate-900 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl motion-reduce:transition-none sm:max-w-lg sm:rounded-3xl"
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-cyan-200">{t('requestTitle')}</p>
            <h2 id="office-request-title" className="mt-1 text-lg font-bold text-white">{title}</h2>
            <p className="mt-1 text-sm text-slate-300">
              {currentWorker?.name || t('requestWorker')}
              {' · '}
              {place}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-slate-800 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            {t('close')}
          </button>
        </div>

        {message ? (
          <p className={`mb-3 text-sm ${sent ? 'text-cyan-100' : 'text-amber-100'}`} role="status">{message}</p>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-3">
          <fieldset>
            <legend className="text-xs text-slate-400">{t('requestCategory')}</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {REQUEST_CATEGORIES.map(category => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setForm(current => ({ ...current, category }))}
                  className={`min-h-11 rounded-xl px-3 text-left text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
                    form.category === category
                      ? 'bg-cyan-600 text-white'
                      : 'bg-slate-800 text-slate-100'
                  }`}
                >
                  {t(requestCategoryKey(category))}
                </button>
              ))}
            </div>
          </fieldset>

          {form.category === 'material' && (
            <div>
              <p className="text-xs text-slate-400">{t('requestMaterialHint')}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {materialRequestTemplates.map(item => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setForm(current => ({
                      ...current,
                      template: item,
                      quantity: current.quantity || '',
                      message: current.message || fillMaterial(t, item),
                    }))}
                    className={`min-h-11 rounded-xl px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
                      form.template === item ? 'bg-cyan-700 text-white' : 'bg-slate-800 text-slate-100'
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          )}

          {form.category === 'vehicle' && (
            <p className="rounded-xl bg-slate-950 px-3 py-2 text-sm text-slate-200">
              {t('requestVehicle')}: {vehicle?.plate || t('requestNoVehicle')}
              {vehicle?.name ? ` · ${vehicle.name}` : ''}
            </p>
          )}

          <label className="block text-xs text-slate-400">
            {t('requestMessage')}
            <textarea
              value={form.message}
              onChange={e => setForm(current => ({ ...current, message: e.target.value }))}
              rows={3}
              required
              className="mt-1 w-full rounded-xl bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-slate-400">
              {t('requestQuantity')}
              <input
                value={form.quantity}
                onChange={e => setForm(current => ({ ...current, quantity: e.target.value }))}
                className="mt-1 min-h-11 w-full rounded-xl bg-slate-950 px-3 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
              />
            </label>
            <label className="text-xs text-slate-400">
              {t('requestNeededBy')}
              <input
                type="date"
                value={form.needed_by}
                min={DateTime.now().setZone('Europe/Berlin').toISODate()}
                onChange={e => setForm(current => ({ ...current, needed_by: e.target.value }))}
                className="mt-1 min-h-11 w-full rounded-xl bg-slate-950 px-3 text-sm text-white [color-scheme:dark] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={sending || setupNeeded || !form.category || !form.message.trim()}
            className="min-h-12 w-full rounded-2xl bg-cyan-600 px-4 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 disabled:opacity-60"
          >
            {sending ? t('sending') : t('requestSend')}
          </button>
        </form>

        <div className="mt-5 border-t border-slate-800 pt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            {t('requestHistory')}
          </p>
          <OfficeRequestHistory t={t} language={language} items={history} loading={loading} compact />
        </div>
      </div>
    </div>,
    document.body,
  )
}

function fillMaterial(t, item) {
  return `${t('requestCatMaterial')}: ${item}`
}
