import { useEffect, useMemo, useState } from 'react'
import { DateTime } from 'luxon'
import { supabase } from '../supabaseClient'
import { fillText, firstName, isoDate, minutesLabel } from './planUtils'
import { DEPOT_ADDRESS, ensureTravel, formatKm, travelBetweenSync } from './travel'

const TUV_WARN_DAYS = 30

function emptyVehicle() {
  return {
    plate: '',
    name: '',
    driver_id: '',
    home_address: '',
    tuv_last: '',
    tuv_next: '',
    notes: '',
    needs: [],
  }
}

function parseNeeds(value) {
  const list = Array.isArray(value) ? value : []
  return list
    .map(item => ({
      id: String(item?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
      text: String(item?.text || '').trim(),
      done: Boolean(item?.done),
    }))
    .filter(item => item.text)
}

function workDaysFor(jobs, workerId, from, to) {
  const days = new Set()
  if (!workerId) return days
  for (const job of jobs || []) {
    const day = isoDate(job.work_date)
    if (!day || day < from || day > to) continue
    if (job.status === 'cancelled' || job.status === 'canceled') continue
    const assigned = (job.work_job_assignees ?? []).some(row => (
      row.worker_id === workerId && (!row.status || ['assigned', 'approved'].includes(row.status))
    ))
    if (assigned) days.add(day)
  }
  return days
}

function tuvInfo(next, today) {
  const due = isoDate(next)
  if (!due) return { kind: 'none', days: null }
  const left = DateTime.fromISO(due, { zone: 'Europe/Berlin' }).diff(
    DateTime.fromISO(today, { zone: 'Europe/Berlin' }),
    'days',
  ).days
  const days = Math.round(left)
  if (days < 0) return { kind: 'over', days }
  if (days <= TUV_WARN_DAYS) return { kind: 'soon', days }
  return { kind: 'ok', days }
}

function roundTrip(home) {
  const out = travelBetweenSync(home, DEPOT_ADDRESS)
  const back = travelBetweenSync(DEPOT_ADDRESS, home)
  return {
    minutes: (out.minutes || 0) + (back.minutes || 0),
    meters: (out.meters || 0) + (back.meters || 0),
  }
}

export default function FleetPanel({ t, workers = [], jobs = [], today }) {
  const [vehicles, setVehicles] = useState([])
  const [form, setForm] = useState(emptyVehicle)
  const [editingId, setEditingId] = useState('')
  const [needText, setNeedText] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [travelTick, setTravelTick] = useState(0)
  const monthStart = DateTime.fromISO(today, { zone: 'Europe/Berlin' }).startOf('month').toISODate()
  const monthEnd = DateTime.fromISO(today, { zone: 'Europe/Berlin' }).endOf('month').toISODate()

  const load = async () => {
    const { data, error } = await supabase
      .from('vehicles')
      .select('id, plate, name, driver_id, home_address, tuv_last, tuv_next, notes, needs_json')
      .order('plate')
    if (error) {
      if (/schema cache|does not exist|relation|column/i.test(error.message || '')) {
        setMessage(t('fleetSetup'))
        return
      }
      setMessage(error.message)
      return
    }
    setMessage('')
    setVehicles((data || []).map(item => ({
      ...item,
      needs: parseNeeds(item.needs_json),
    })))
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    const homes = [...new Set(
      vehicles
        .filter(item => item.driver_id && String(item.home_address || '').trim())
        .map(item => String(item.home_address).trim()),
    )]
    if (!homes.length) return undefined
    let cancelled = false
    Promise.all(homes.flatMap(home => [ensureTravel(home, DEPOT_ADDRESS), ensureTravel(DEPOT_ADDRESS, home)]))
      .then(() => {
        if (!cancelled) setTravelTick(current => current + 1)
      })
    return () => { cancelled = true }
  }, [vehicles])

  const people = useMemo(
    () => [...workers].filter(item => item?.id && item.active !== false).sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [workers],
  )
  const nameOf = (id) => people.find(item => item.id === id)?.name || ''

  const rows = useMemo(() => vehicles.map((item) => {
    const days = item.driver_id ? workDaysFor(jobs, item.driver_id, monthStart, monthEnd) : new Set()
    const trip = item.driver_id && item.home_address ? roundTrip(item.home_address) : { minutes: 0, meters: 0 }
    const todayOn = Boolean(item.driver_id && days.has(today))
    return {
      ...item,
      driverName: firstName(nameOf(item.driver_id)) || nameOf(item.driver_id),
      tuv: tuvInfo(item.tuv_next, today),
      dayCount: days.size,
      todayTrip: todayOn ? trip : { minutes: 0, meters: 0 },
      monthTrip: {
        minutes: trip.minutes * days.size,
        meters: trip.meters * days.size,
      },
    }
  }), [jobs, monthEnd, monthStart, nameOf, today, travelTick, vehicles])

  const alerts = rows.filter(item => item.tuv.kind === 'over' || item.tuv.kind === 'soon')

  const startEdit = (item) => {
    setEditingId(item.id)
    setForm({
      plate: item.plate || '',
      name: item.name || '',
      driver_id: item.driver_id || '',
      home_address: item.home_address || '',
      tuv_last: isoDate(item.tuv_last),
      tuv_next: isoDate(item.tuv_next),
      notes: item.notes || '',
      needs: parseNeeds(item.needs),
    })
    setNeedText('')
  }

  const resetForm = () => {
    setEditingId('')
    setForm(emptyVehicle())
    setNeedText('')
  }

  const addNeed = () => {
    const text = needText.trim()
    if (!text) return
    setForm(current => ({
      ...current,
      needs: [...current.needs, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, text, done: false }],
    }))
    setNeedText('')
  }

  const handleSave = async (event) => {
    event.preventDefault()
    if (!form.plate.trim()) return
    setBusy(true)
    const payload = {
      plate: form.plate.trim(),
      name: form.name.trim() || null,
      driver_id: form.driver_id || null,
      home_address: form.home_address.trim() || null,
      tuv_last: form.tuv_last || null,
      tuv_next: form.tuv_next || null,
      notes: form.notes.trim() || null,
      needs_json: form.needs,
      updated_at: new Date().toISOString(),
    }
    const result = editingId
      ? await supabase.from('vehicles').update(payload).eq('id', editingId)
      : await supabase.from('vehicles').insert(payload)
    setBusy(false)
    if (result.error) {
      if (/schema cache|does not exist|relation|column/i.test(result.error.message || '')) {
        setMessage(t('fleetSetup'))
        return
      }
      setMessage(result.error.message)
      return
    }
    resetForm()
    await load()
  }

  const handleDelete = async (item) => {
    if (!item?.id) return
    if (!window.confirm(t('delete'))) return
    const { error } = await supabase.from('vehicles').delete().eq('id', item.id)
    if (error) {
      setMessage(error.message)
      return
    }
    if (editingId === item.id) resetForm()
    await load()
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[1.75rem] bg-slate-900/85 p-5 ring-1 ring-slate-700">
        <p className="text-[11px] uppercase tracking-[0.25em] text-cyan-200">{t('adminTabFleet')}</p>
        <h2 className="mt-1 text-lg font-bold text-white">{t('fleetTitle')}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t('fleetHint')}</p>
        {message ? <p className="mt-3 text-sm text-amber-100">{message}</p> : null}

        {alerts.length > 0 && (
          <div className="mt-4 rounded-2xl border border-amber-300/25 bg-amber-400/10 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-200">{t('fleetAlertTitle')}</p>
            <ul className="mt-2 space-y-1 text-sm text-amber-50">
              {alerts.map(item => (
                <li key={item.id}>
                  {item.plate}
                  {item.name ? ` · ${item.name}` : ''}
                  {' · '}
                  {item.tuv.kind === 'over'
                    ? t('fleetTuvOver')
                    : fillText(t('fleetTuvSoon'), { days: String(item.tuv.days) })}
                </li>
              ))}
            </ul>
          </div>
        )}

        <form onSubmit={handleSave} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-400">
            {t('fleetPlate')}
            <input
              value={form.plate}
              onChange={e => setForm(current => ({ ...current, plate: e.target.value }))}
              className="mt-1 w-full rounded-md bg-slate-950 px-3 py-2 text-sm text-slate-100"
              required
            />
          </label>
          <label className="text-xs text-slate-400">
            {t('fleetName')}
            <input
              value={form.name}
              onChange={e => setForm(current => ({ ...current, name: e.target.value }))}
              className="mt-1 w-full rounded-md bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <label className="text-xs text-slate-400">
            {t('fleetDriver')}
            <select
              value={form.driver_id}
              onChange={e => setForm(current => ({ ...current, driver_id: e.target.value }))}
              className="mt-1 w-full rounded-md bg-slate-950 px-3 py-2 text-sm text-slate-100"
            >
              <option value="">{t('fleetDriverNone')}</option>
              {people.map(person => (
                <option key={person.id} value={person.id}>{person.name}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-400 sm:col-span-2">
            {t('fleetHome')}
            <input
              value={form.home_address}
              onChange={e => setForm(current => ({ ...current, home_address: e.target.value }))}
              placeholder={t('fleetHomeHint')}
              className="mt-1 w-full rounded-md bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <label className="text-xs text-slate-400">
            {t('fleetTuvLast')}
            <input
              type="date"
              value={form.tuv_last}
              onChange={e => setForm(current => ({ ...current, tuv_last: isoDate(e.target.value) }))}
              className="mt-1 w-full rounded-md bg-slate-950 px-3 py-2 text-sm text-slate-100 [color-scheme:dark]"
            />
          </label>
          <label className="text-xs text-slate-400">
            {t('fleetTuvNext')}
            <input
              type="date"
              value={form.tuv_next}
              onChange={e => setForm(current => ({ ...current, tuv_next: isoDate(e.target.value) }))}
              className="mt-1 w-full rounded-md bg-slate-950 px-3 py-2 text-sm text-slate-100 [color-scheme:dark]"
            />
          </label>
          <label className="text-xs text-slate-400 sm:col-span-2">
            {t('fleetNotes')}
            <textarea
              value={form.notes}
              onChange={e => setForm(current => ({ ...current, notes: e.target.value }))}
              rows={2}
              className="mt-1 w-full rounded-md bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <div className="sm:col-span-2">
            <p className="text-xs text-slate-400">{t('fleetNeeds')}</p>
            <div className="mt-2 flex gap-2">
              <input
                value={needText}
                onChange={e => setNeedText(e.target.value)}
                placeholder={t('fleetNeedPlaceholder')}
                className="min-h-11 w-full rounded-md bg-slate-950 px-3 text-sm text-slate-100"
              />
              <button
                type="button"
                onClick={addNeed}
                className="shrink-0 rounded-xl bg-slate-800 px-3 text-sm text-white"
              >
                {t('fleetNeedAdd')}
              </button>
            </div>
            {form.needs.length > 0 && (
              <ul className="mt-2 space-y-1">
                {form.needs.map(need => (
                  <li key={need.id} className="flex items-center gap-2 text-sm text-slate-200">
                    <label className="flex min-h-11 flex-1 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={need.done}
                        onChange={() => setForm(current => ({
                          ...current,
                          needs: current.needs.map(item => (item.id === need.id ? { ...item, done: !item.done } : item)),
                        }))}
                      />
                      <span className={need.done ? 'text-slate-500 line-through' : ''}>{need.text}</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setForm(current => ({ ...current, needs: current.needs.filter(item => item.id !== need.id) }))}
                      className="text-xs text-slate-400 underline"
                    >
                      {t('delete')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={busy}
              className="min-h-11 rounded-2xl bg-cyan-600 px-5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {editingId ? t('fleetSave') : t('fleetAdd')}
            </button>
            {editingId ? (
              <button type="button" onClick={resetForm} className="min-h-11 rounded-2xl bg-slate-800 px-4 text-sm text-slate-100">
                {t('cancel')}
              </button>
            ) : null}
          </div>
        </form>
      </section>

      {!rows.length ? (
        <p className="px-1 text-sm text-slate-400">{t('fleetEmpty')}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map(item => (
            <li key={item.id} className="rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">
                    {item.plate}
                    {item.name ? ` · ${item.name}` : ''}
                  </p>
                  <p className="mt-1 text-sm text-slate-300">
                    {item.driverName || t('fleetNoDriver')}
                    {item.home_address ? ` · ${item.home_address}` : ` · ${t('fleetNoHome')}`}
                  </p>
                  <p className={`mt-1 text-sm ${
                    item.tuv.kind === 'over' ? 'text-rose-100' : item.tuv.kind === 'soon' ? 'text-amber-100' : 'text-slate-400'
                  }`}>
                    {item.tuv.kind === 'over'
                      ? t('fleetTuvOver')
                      : item.tuv.kind === 'soon'
                        ? fillText(t('fleetTuvSoon'), { days: String(item.tuv.days) })
                        : item.tuv.kind === 'ok'
                          ? t('fleetTuvOk')
                          : t('fleetTuvNone')}
                    {item.tuv_next ? ` · ${item.tuv_next}` : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => startEdit(item)} className="min-h-11 rounded-xl bg-slate-800 px-3 text-sm text-white">
                    {t('edit')}
                  </button>
                  <button type="button" onClick={() => handleDelete(item)} className="min-h-11 rounded-xl px-3 text-sm text-slate-300 underline">
                    {t('delete')}
                  </button>
                </div>
              </div>

              {item.driver_id && item.home_address ? (
                <>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-xl bg-slate-950/70 px-3 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{t('fleetToday')}</p>
                      <p className="mt-1 text-lg font-semibold tabular-nums text-white">
                        {item.todayTrip.meters
                          ? fillText(t('fleetKm'), { km: formatKm(item.todayTrip.meters) || '0' })
                          : '—'}
                      </p>
                      {item.todayTrip.minutes ? (
                        <p className="text-xs text-slate-400">{minutesLabel(item.todayTrip.minutes, t)}</p>
                      ) : null}
                    </div>
                    <div className="rounded-xl bg-slate-950/70 px-3 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{t('fleetMonth')}</p>
                      <p className="mt-1 text-lg font-semibold tabular-nums text-white">
                        {item.monthTrip.meters
                          ? fillText(t('fleetKm'), { km: formatKm(item.monthTrip.meters) || '0' })
                          : '—'}
                      </p>
                      <p className="text-xs text-slate-400">
                        {fillText(t('fleetDays'), { count: String(item.dayCount) })}
                        {item.monthTrip.minutes ? ` · ${minutesLabel(item.monthTrip.minutes, t)}` : ''}
                      </p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{t('fleetRound')}</p>
                </>
              ) : item.driver_id ? (
                <p className="mt-3 text-sm text-slate-400">{t('fleetNeedHome')}</p>
              ) : null}
              {item.needs?.length ? (
                <ul className="mt-3 space-y-1 text-sm text-slate-200">
                  {item.needs.map(need => (
                    <li key={need.id} className={need.done ? 'text-slate-500 line-through' : ''}>{need.text}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
