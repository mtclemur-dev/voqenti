import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { DateTime } from 'luxon'
import { supabase } from '../supabaseClient'
import OfficeRequestHistory from './OfficeRequestHistory'
import {
  MATERIAL_OTHER,
  MATERIAL_QTY_PRESETS,
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
  items: [],
  otherName: '',
  qtyCustom: '',
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

  const loadHistory = useCallback(async () => {
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
  }, [objectId, t, workerId])

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
  }, [jobId, loadHistory, objectId, onClose, open, workerId])

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
            <MaterialPicker t={t} form={form} setForm={setForm} />
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

          <div className={`grid gap-3 ${form.category === 'material' ? '' : 'sm:grid-cols-2'}`}>
            {form.category !== 'material' && (
            <label className="text-xs text-slate-400">
              {t('requestQuantity')}
              <input
                value={form.quantity}
                onChange={e => setForm(current => ({ ...current, quantity: e.target.value }))}
                className="mt-1 min-h-11 w-full rounded-xl bg-slate-950 px-3 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
              />
            </label>
            )}
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

function itemId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

function composeMaterials(items) {
  const lines = (items || [])
    .map(item => {
      const name = String(item?.name || '').trim()
      if (!name) return ''
      return item.qty ? `${item.qty} ${name}` : name
    })
    .filter(Boolean)
  return {
    message: lines.join('\n'),
    quantity: lines.join(', '),
  }
}

function withMaterials(current, items, extra = {}) {
  const nextItems = items || []
  return {
    ...current,
    ...extra,
    items: nextItems,
    ...composeMaterials(nextItems),
  }
}

function MaterialPicker({ t, form, setForm }) {
  const active = (form.items || []).find(item => item.id === form.template)
  const addMaterial = (name) => {
    const label = String(name || '').trim()
    if (!label) return
    setForm((current) => {
      const existing = (current.items || []).find(item => item.name.toLowerCase() === label.toLowerCase())
      if (existing) {
        return { ...current, template: existing.id, otherName: '' }
      }
      const next = { id: itemId(), name: label, qty: '' }
      return withMaterials(current, [...(current.items || []), next], {
        template: next.id,
        otherName: '',
        qtyCustom: '',
      })
    })
  }
  const setQty = (qty) => {
    const value = String(qty || '').trim()
    setForm((current) => {
      const items = (current.items || []).map(item => (
        item.id === current.template ? { ...item, qty: value } : item
      ))
      return withMaterials(current, items, { qtyCustom: '' })
    })
  }

  return (
    <div>
      <p className="text-xs text-slate-400">{t('requestMaterialHint')}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {materialRequestTemplates.map(item => (
          <button
            key={item}
            type="button"
            onClick={() => addMaterial(item)}
            className={`min-h-11 rounded-xl px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
              active?.name === item ? 'bg-cyan-700 text-white' : 'bg-slate-800 text-slate-100'
            }`}
          >
            {item}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setForm(current => ({ ...current, template: MATERIAL_OTHER }))}
          className={`min-h-11 rounded-xl px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
            form.template === MATERIAL_OTHER ? 'bg-cyan-700 text-white' : 'bg-slate-800 text-slate-100'
          }`}
        >
          {t('requestMaterialOther')}
        </button>
      </div>

      {form.template === MATERIAL_OTHER && (
        <div className="mt-3 flex gap-2">
          <input
            value={form.otherName}
            onChange={e => setForm(current => ({ ...current, otherName: e.target.value }))}
            placeholder={t('requestMaterialOtherName')}
            className="min-h-11 w-full rounded-xl bg-slate-950 px-3 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          />
          <button
            type="button"
            onClick={() => addMaterial(form.otherName)}
            className="min-h-11 shrink-0 rounded-xl bg-cyan-600 px-3 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
          >
            {t('requestMaterialAdd')}
          </button>
        </div>
      )}

      {active && (
        <div className="mt-3 rounded-2xl border border-cyan-400/20 bg-slate-950/80 px-3 py-3">
          <p className="text-sm font-semibold text-white">{active.name}</p>
          <p className="mt-1 text-xs text-slate-400">{t('requestPieces')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {MATERIAL_QTY_PRESETS.map(qty => (
              <button
                key={qty}
                type="button"
                onClick={() => setQty(qty)}
                className={`min-h-11 min-w-11 rounded-xl px-3 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
                  String(active.qty) === qty ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-100'
                }`}
              >
                {qty}
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              inputMode="numeric"
              value={form.qtyCustom}
              onChange={e => setForm(current => ({ ...current, qtyCustom: e.target.value }))}
              placeholder={t('requestQtyCustom')}
              className="min-h-11 w-full rounded-xl bg-slate-900 px-3 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
            />
            <button
              type="button"
              disabled={!String(form.qtyCustom || '').trim()}
              onClick={() => setQty(form.qtyCustom)}
              className="min-h-11 shrink-0 rounded-xl bg-slate-800 px-3 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-50"
            >
              {t('requestMaterialAdd')}
            </button>
          </div>
        </div>
      )}

      {(form.items || []).length > 0 && (
        <ul className="mt-3 space-y-2" aria-label={t('requestMaterialsPicked')}>
          {form.items.map(item => (
            <li key={item.id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-950 px-3 py-2">
              <button
                type="button"
                onClick={() => setForm(current => ({ ...current, template: item.id }))}
                className="min-h-11 flex-1 text-left text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
              >
                {item.qty ? `${item.qty} × ${item.name}` : item.name}
              </button>
              <button
                type="button"
                onClick={() => setForm(current => withMaterials(
                  current,
                  current.items.filter(row => row.id !== item.id),
                  { template: current.template === item.id ? '' : current.template },
                ))}
                className="min-h-11 px-2 text-xs text-slate-400 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
              >
                {t('requestRemoveMaterial')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
