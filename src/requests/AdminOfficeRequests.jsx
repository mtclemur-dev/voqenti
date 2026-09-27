import { useEffect, useMemo, useState } from 'react'
import { DateTime } from 'luxon'
import { supabase } from '../supabaseClient'
import { fillText, firstName, formatDisplayDate, isoDate } from '../plan/planUtils'
import {
  OPEN_REQUEST_STATUSES,
  REQUEST_COLUMNS,
  REQUEST_STATUSES,
  isMissingTable,
  requestCategoryKey,
  requestStatusKey,
} from './requestTemplates'

function whenLabel(value, language, t) {
  const dt = DateTime.fromISO(value, { zone: 'Europe/Berlin' })
  if (!dt.isValid) return ''
  const today = DateTime.now().setZone('Europe/Berlin').startOf('day')
  const day = dt.startOf('day')
  const clock = dt.toFormat('HH:mm')
  if (day.equals(today)) return fillText(t('requestWhenToday'), { time: clock })
  if (day.equals(today.minus({ days: 1 }))) return fillText(t('requestWhenYesterday'), { time: clock })
  return `${dt.setLocale(language).toFormat('dd.MM.yyyy')} · ${clock}`
}

export default function AdminOfficeRequests({
  t,
  language = 'de',
  workers = [],
  objects = [],
}) {
  const [items, setItems] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [setupNeeded, setSetupNeeded] = useState(false)
  const [showClosed, setShowClosed] = useState(false)
  const [openId, setOpenId] = useState('')
  const [reply, setReply] = useState('')
  const [savingId, setSavingId] = useState('')

  const nameOf = (id) => workers.find(item => item.id === id)?.name || ''
  const objectName = (id) => objects.find(item => item.id === id)?.name || ''
  const vehiclePlate = (id) => vehicles.find(item => item.id === id)?.plate || ''

  const load = async () => {
    setLoading(true)
    let query = supabase
      .from('office_requests')
      .select(REQUEST_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(40)
    if (!showClosed) query = query.in('status', OPEN_REQUEST_STATUSES)
    const { data, error } = await query
    setLoading(false)
    if (error) {
      if (isMissingTable(error)) {
        setSetupNeeded(true)
        setMessage(t('requestSetup'))
        setItems([])
        return
      }
      setMessage(error.message)
      return
    }
    setSetupNeeded(false)
    setMessage('')
    setItems(data || [])
    const vehicleIds = [...new Set((data || []).map(item => item.vehicle_id).filter(Boolean))]
    if (vehicleIds.length) {
      const plates = await supabase.from('vehicles').select('id, plate').in('id', vehicleIds)
      if (!plates.error) setVehicles(plates.data || [])
    } else {
      setVehicles([])
    }
  }

  useEffect(() => {
    load()
  }, [showClosed])

  const rows = useMemo(() => items.map(item => ({
    ...item,
    workerName: nameOf(item.worker_id),
    place: objectName(item.object_id),
    plate: vehiclePlate(item.vehicle_id),
  })), [items, objects, vehicles, workers])

  const save = async (item, patch) => {
    if (!item?.id || setupNeeded) return
    setSavingId(item.id)
    const payload = {
      ...patch,
      updated_at: new Date().toISOString(),
    }
    if (patch.office_reply != null) {
      payload.replied_at = new Date().toISOString()
    }
    if (patch.status === 'resolved' || patch.status === 'rejected') {
      payload.resolved_at = new Date().toISOString()
    }
    const { data, error } = await supabase
      .from('office_requests')
      .update(payload)
      .eq('id', item.id)
      .select(REQUEST_COLUMNS)
      .single()
    setSavingId('')
    if (error) {
      if (isMissingTable(error)) {
        setSetupNeeded(true)
        setMessage(t('requestSetup'))
        return
      }
      setMessage(error.message || t('requestSaveError'))
      return
    }
    setMessage(t('requestSaved'))
    setItems(current => current.map(row => (row.id === item.id ? data : row)))
    if (!showClosed && !OPEN_REQUEST_STATUSES.includes(data.status)) {
      setItems(current => current.filter(row => row.id !== item.id))
      setOpenId('')
    }
  }

  return (
    <section className="space-y-4">
      <div className="rounded-[1.75rem] bg-slate-900/85 p-5 ring-1 ring-slate-700">
        <p className="text-[11px] uppercase tracking-[0.25em] text-cyan-200">{t('adminTabRequests')}</p>
        <h2 className="mt-1 text-lg font-bold text-white">{t('requestAdminTitle')}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t('requestAdminHint')}</p>
        {message ? <p className="mt-3 text-sm text-amber-100" role="status">{message}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowClosed(false)}
            className={`min-h-11 rounded-xl px-3 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
              !showClosed ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-100'
            }`}
          >
            {t('requestOpenOnly')}
          </button>
          <button
            type="button"
            onClick={() => setShowClosed(true)}
            className={`min-h-11 rounded-xl px-3 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
              showClosed ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-100'
            }`}
          >
            {t('requestShowAll')}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="px-1 text-sm text-slate-400" aria-live="polite">{t('loading')}</p>
      ) : !rows.length ? (
        <p className="px-1 text-sm text-slate-400">{showClosed ? t('requestEmptyAll') : t('requestEmptyOpen')}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map(item => {
            const open = openId === item.id
            return (
              <li key={item.id} className="rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3">
                <button
                  type="button"
                  onClick={() => {
                    setOpenId(open ? '' : item.id)
                    setReply(item.office_reply || '')
                  }}
                  className="flex w-full flex-col items-start text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                >
                  <p className="text-sm font-semibold text-white">
                    {t(requestCategoryKey(item.category))}
                    {item.place ? ` · ${item.place}` : ''}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {firstName(item.workerName) || item.workerName || t('requestWorker')}
                    {item.created_at ? ` · ${whenLabel(item.created_at, language, t)}` : ''}
                  </p>
                  <p className="mt-1 text-sm text-slate-200">
                    {item.quantity ? `${item.quantity} · ` : ''}
                    {item.message}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-cyan-100">
                    {t('requestStatus')}: {t(requestStatusKey(item.status))}
                  </p>
                </button>

                {open && (
                  <div className="mt-3 space-y-3 border-t border-slate-800 pt-3">
                    {item.needed_by ? (
                      <p className="text-sm text-slate-300">
                        {t('requestNeededBy')}: {formatDisplayDate(isoDate(item.needed_by))}
                      </p>
                    ) : null}
                    {item.plate ? (
                      <p className="text-sm text-slate-300">{t('requestVehicle')}: {item.plate}</p>
                    ) : null}
                    {item.resolved_at ? (
                      <p className="text-xs text-slate-400">
                        {t('requestResolvedAt')}: {whenLabel(item.resolved_at, language, t)}
                      </p>
                    ) : null}
                    <label className="block text-xs text-slate-400">
                      {t('requestOfficeReply')}
                      <textarea
                        value={reply}
                        onChange={e => setReply(e.target.value)}
                        rows={2}
                        className="mt-1 w-full rounded-xl bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={savingId === item.id || setupNeeded}
                        onClick={() => save(item, { office_reply: reply.trim() || null, status: item.status === 'new' ? 'seen' : item.status })}
                        className="min-h-11 rounded-xl bg-slate-800 px-3 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-60"
                      >
                        {t('requestSaveReply')}
                      </button>
                      {REQUEST_STATUSES.map(status => (
                        <button
                          key={status}
                          type="button"
                          disabled={savingId === item.id || setupNeeded}
                          onClick={() => save(item, {
                            status,
                            office_reply: reply.trim() || item.office_reply || null,
                          })}
                          className={`min-h-11 rounded-xl px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-60 ${
                            item.status === status ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-100'
                          }`}
                        >
                          {t(requestStatusKey(status))}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
