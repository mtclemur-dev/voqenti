import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabaseClient'
import { isoDate } from './planUtils'
import OfficeRequestHistory from '../requests/OfficeRequestHistory'
import {
  NEED_CATEGORIES,
  NEED_PRIORITIES,
  NEED_STATUSES,
  REQUEST_COLUMNS,
  emptyNeed,
  isMissingTable,
  needCategoryKey,
  needStatusKey,
} from '../requests/requestTemplates'

export default function FleetVehicleDialog({
  t,
  language = 'de',
  open,
  onClose,
  form,
  setForm,
  editingId,
  people = [],
  busy = false,
  onSave,
  extrasReady = true,
}) {
  const [requests, setRequests] = useState([])
  const [requestState, setRequestState] = useState('')

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, open])

  useEffect(() => {
    if (!open || !editingId) {
      setRequests([])
      setRequestState('')
      return undefined
    }
    let cancelled = false
    supabase
      .from('office_requests')
      .select(REQUEST_COLUMNS)
      .eq('vehicle_id', editingId)
      .order('created_at', { ascending: false })
      .limit(8)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          if (isMissingTable(error)) setRequestState('setup')
          else setRequestState(error.message)
          setRequests([])
          return
        }
        setRequestState('')
        setRequests(data || [])
      })
    return () => { cancelled = true }
  }, [editingId, open])

  if (!open) return null

  const addNeed = () => {
    setForm(current => ({ ...current, needs: [...current.needs, emptyNeed()] }))
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/75 md:items-stretch md:justify-end"
      role="presentation"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="fleet-vehicle-title"
        className="max-h-[94dvh] w-full overflow-y-auto rounded-t-3xl border border-slate-700 bg-slate-900 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl motion-reduce:transition-none md:h-full md:max-h-none md:max-w-lg md:rounded-none md:border-y-0 md:border-l md:border-r-0"
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-cyan-200">{t('adminTabFleet')}</p>
            <h2 id="fleet-vehicle-title" className="mt-1 text-lg font-bold text-white">
              {editingId ? t('fleetSave') : t('fleetAdd')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-slate-800 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            {t('close')}
          </button>
        </div>

        <form onSubmit={onSave} className="grid gap-3">
          <label className="text-xs text-slate-400">
            {t('fleetPlate')}
            <input
              value={form.plate}
              onChange={e => setForm(current => ({ ...current, plate: e.target.value }))}
              className="mt-1 min-h-11 w-full rounded-xl bg-slate-950 px-3 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
              required
            />
          </label>
          <label className="text-xs text-slate-400">
            {t('fleetName')}
            <input
              value={form.name}
              onChange={e => setForm(current => ({ ...current, name: e.target.value }))}
              className="mt-1 min-h-11 w-full rounded-xl bg-slate-950 px-3 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
            />
          </label>
          <label className="text-xs text-slate-400">
            {t('fleetDriver')}
            <select
              value={form.driver_id}
              onChange={e => setForm(current => ({ ...current, driver_id: e.target.value }))}
              className="mt-1 min-h-11 w-full rounded-xl bg-slate-950 px-3 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
            >
              <option value="">{t('fleetDriverNone')}</option>
              {people.map(person => (
                <option key={person.id} value={person.id}>{person.name}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-400">
            {t('fleetHome')}
            <input
              value={form.home_address}
              onChange={e => setForm(current => ({ ...current, home_address: e.target.value }))}
              placeholder={t('fleetHomeHint')}
              className="mt-1 min-h-11 w-full rounded-xl bg-slate-950 px-3 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
            />
          </label>
          <label className="text-xs text-slate-400">
            {t('fleetTuvNext')}
            <input
              type="date"
              value={form.tuv_next}
              onChange={e => setForm(current => ({ ...current, tuv_next: isoDate(e.target.value) }))}
              className="mt-1 min-h-11 w-full rounded-xl bg-slate-950 px-3 text-sm text-white [color-scheme:dark] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
            />
          </label>
          {extrasReady ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-slate-400">
                  {t('fleetOdometer')}
                  <input
                    type="number"
                    min="0"
                    value={form.odometer}
                    onChange={e => setForm(current => ({ ...current, odometer: e.target.value }))}
                    className="mt-1 min-h-11 w-full rounded-xl bg-slate-950 px-3 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                  />
                </label>
                <label className="text-xs text-slate-400">
                  {t('fleetOdometerDate')}
                  <input
                    type="date"
                    value={form.odometer_date}
                    onChange={e => setForm(current => ({ ...current, odometer_date: isoDate(e.target.value) }))}
                    className="mt-1 min-h-11 w-full rounded-xl bg-slate-950 px-3 text-sm text-white [color-scheme:dark] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                  />
                </label>
              </div>
              <label className="text-xs text-slate-400">
                {t('fleetServiceKm')}
                <input
                  type="number"
                  min="0"
                  value={form.service_km}
                  onChange={e => setForm(current => ({ ...current, service_km: e.target.value }))}
                  className="mt-1 min-h-11 w-full rounded-xl bg-slate-950 px-3 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                />
              </label>
              <label className="flex min-h-11 items-center gap-2 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={e => setForm(current => ({ ...current, active: e.target.checked }))}
                />
                {t('fleetActive')}
              </label>
            </>
          ) : (
            <p className="text-sm text-amber-100">{t('fleetExtrasSetup')}</p>
          )}
          <label className="text-xs text-slate-400">
            {t('fleetNotes')}
            <textarea
              value={form.notes}
              onChange={e => setForm(current => ({ ...current, notes: e.target.value }))}
              rows={2}
              className="mt-1 w-full rounded-xl bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
            />
          </label>

          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-slate-400">{t('fleetNeeds')}</p>
              <button
                type="button"
                onClick={addNeed}
                className="min-h-11 rounded-xl bg-slate-800 px-3 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
              >
                {t('fleetNeedAdd')}
              </button>
            </div>
            <ul className="mt-2 space-y-2">
              {form.needs.map(need => (
                <li key={need.id} className="rounded-xl border border-white/10 bg-slate-950/70 p-3">
                  <input
                    value={need.description}
                    onChange={e => setForm(current => ({
                      ...current,
                      needs: current.needs.map(item => (item.id === need.id ? { ...item, description: e.target.value } : item)),
                    }))}
                    placeholder={t('fleetNeedPlaceholder')}
                    className="min-h-11 w-full rounded-lg bg-slate-900 px-3 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                  />
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <select
                      value={need.category}
                      onChange={e => setForm(current => ({
                        ...current,
                        needs: current.needs.map(item => (item.id === need.id ? { ...item, category: e.target.value } : item)),
                      }))}
                      className="min-h-11 rounded-lg bg-slate-900 px-2 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                    >
                      {NEED_CATEGORIES.map(category => (
                        <option key={category} value={category}>{t(needCategoryKey(category))}</option>
                      ))}
                    </select>
                    <select
                      value={need.status}
                      onChange={e => setForm(current => ({
                        ...current,
                        needs: current.needs.map(item => (item.id === need.id ? { ...item, status: e.target.value } : item)),
                      }))}
                      className="min-h-11 rounded-lg bg-slate-900 px-2 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                    >
                      {NEED_STATUSES.map(status => (
                        <option key={status} value={status}>{t(needStatusKey(status))}</option>
                      ))}
                    </select>
                    <select
                      value={need.priority}
                      onChange={e => setForm(current => ({
                        ...current,
                        needs: current.needs.map(item => (item.id === need.id ? { ...item, priority: e.target.value } : item)),
                      }))}
                      className="min-h-11 rounded-lg bg-slate-900 px-2 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                    >
                      {NEED_PRIORITIES.map(priority => (
                        <option key={priority} value={priority}>
                          {priority === 'high' ? t('fleetNeedHigh') : t('fleetNeedNormal')}
                        </option>
                      ))}
                    </select>
                    <input
                      type="date"
                      value={need.due}
                      onChange={e => setForm(current => ({
                        ...current,
                        needs: current.needs.map(item => (item.id === need.id ? { ...item, due: isoDate(e.target.value) } : item)),
                      }))}
                      className="min-h-11 rounded-lg bg-slate-900 px-2 text-sm text-white [color-scheme:dark] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                    />
                    <input
                      type="number"
                      min="0"
                      value={need.km}
                      onChange={e => setForm(current => ({
                        ...current,
                        needs: current.needs.map(item => (item.id === need.id ? { ...item, km: e.target.value } : item)),
                      }))}
                      placeholder={t('fleetNeedKm')}
                      className="min-h-11 rounded-lg bg-slate-900 px-2 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 sm:col-span-2"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm(current => ({ ...current, needs: current.needs.filter(item => item.id !== need.id) }))}
                    className="mt-2 min-h-11 text-xs text-slate-400 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                  >
                    {t('delete')}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy}
              className="min-h-11 rounded-2xl bg-cyan-600 px-5 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 disabled:opacity-60"
            >
              {editingId ? t('fleetSave') : t('fleetAdd')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-2xl bg-slate-800 px-4 text-sm text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
            >
              {t('cancel')}
            </button>
          </div>
        </form>

        {editingId ? (
          <div className="mt-6 border-t border-slate-800 pt-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              {t('requestAdminTitle')}
            </p>
            {requestState === 'setup' ? (
              <p className="text-sm text-amber-100">{t('requestSetup')}</p>
            ) : requestState ? (
              <p className="text-sm text-amber-100">{requestState}</p>
            ) : (
              <OfficeRequestHistory t={t} language={language} items={requests} compact />
            )}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
