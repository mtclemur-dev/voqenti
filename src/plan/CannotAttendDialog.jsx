import { useEffect, useId, useRef, useState } from 'react'
import { IconClose } from './icons'

const REASON_KEYS = [
  'declineReasonSick',
  'declineReasonFamily',
  'declineReasonTransport',
  'declineReasonLate',
  'declineReasonOtherJob',
  'declineReasonOther',
]

export default function CannotAttendDialog({
  t,
  open,
  busy = false,
  errorMessage = '',
  onClose,
  onConfirm,
}) {
  const titleId = useId()
  const [reasonKey, setReasonKey] = useState('declineReasonSick')
  const [note, setNote] = useState('')
  const [confirming, setConfirming] = useState(false)
  const dialogRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    setReasonKey('declineReasonSick')
    setNote('')
    setConfirming(false)
    const id = window.setTimeout(() => {
      dialogRef.current?.querySelector('button, textarea')?.focus()
    }, 0)
    return () => window.clearTimeout(id)
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, onClose, open])

  if (!open) return null

  const other = reasonKey === 'declineReasonOther'
  const canSubmit = !busy && (!other || note.trim())

  const submit = () => {
    if (!canSubmit) return
    if (!confirming) {
      setConfirming(true)
      return
    }
    const label = t(reasonKey)
    const extra = note.trim()
    onConfirm(extra ? `${label}: ${extra}` : label)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-0 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0 z-0" aria-label={t('cancel')} onClick={() => !busy && onClose()} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-md rounded-t-3xl border border-slate-700 bg-slate-900 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-lg font-bold text-white">{t('cannotComeTitle')}</h2>
            <p className="mt-1 text-sm text-slate-300">{confirming ? t('cannotComeConfirmAsk') : t('cannotComeHelp')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-slate-800 text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
            aria-label={t('close')}
          >
            <IconClose />
          </button>
        </div>

        <div className="space-y-2" role="radiogroup" aria-label={t('cannotComeReason')}>
          {REASON_KEYS.map(key => {
            const selected = reasonKey === key
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={busy || confirming}
                onClick={() => setReasonKey(key)}
                className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-60 ${selected ? 'bg-cyan-500/15 text-white ring-1 ring-cyan-300/40' : 'bg-slate-800 text-slate-200'}`}
              >
                <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selected ? 'border-cyan-300' : 'border-slate-500'}`}>
                  {selected && <span className="h-2.5 w-2.5 rounded-full bg-cyan-300" />}
                </span>
                {t(key)}
              </button>
            )
          })}
        </div>

        <label className="mt-4 block text-sm text-slate-300">
          {t('cannotComeNote')}
          <textarea
            value={note}
            onChange={event => setNote(event.target.value)}
            rows={3}
            disabled={busy || confirming}
            placeholder={other ? t('cannotComeNoteRequired') : t('cannotComeNoteOptional')}
            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-base text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          />
        </label>

        {errorMessage && (
          <p className="mt-3 rounded-xl bg-rose-500/15 px-3 py-2 text-sm text-rose-100" role="alert">{errorMessage}</p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => (confirming ? setConfirming(false) : onClose())}
            disabled={busy}
            className="min-h-12 rounded-xl bg-slate-800 px-4 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            {confirming ? t('back') : t('cancel')}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="min-h-12 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white disabled:bg-slate-700 disabled:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
          >
            {busy ? t('sending') : confirming ? t('cannotComeSend') : t('continue')}
          </button>
        </div>
      </div>
    </div>
  )
}
