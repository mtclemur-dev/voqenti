export default function OpenPostActions({ t, answer = '', onChoose, busy = false }) {
  if (answer === 'go') {
    return <p className="rounded-md bg-emerald-500/20 px-3 py-2 text-center text-sm font-semibold text-emerald-50">{t('planJoined')}</p>
  }
  if (answer === 'no') {
    return <p className="rounded-md bg-slate-800 px-3 py-2 text-center text-sm font-semibold text-slate-200">{t('openPostNoMarked')}</p>
  }
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <button
        type="button"
        disabled={busy}
        onClick={() => onChoose('go')}
        className="min-h-11 rounded-xl bg-amber-400 px-3 text-sm font-semibold text-slate-950 disabled:opacity-50"
      >
        {t('openPostGo')}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => onChoose('no')}
        className="min-h-11 rounded-xl bg-slate-800 px-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        {t('openPostNo')}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => onChoose('think')}
        className={`min-h-11 rounded-xl px-3 text-sm font-semibold disabled:opacity-50 ${
          answer === 'think' ? 'bg-cyan-500 text-slate-950' : 'bg-slate-800 text-white'
        }`}
      >
        {answer === 'think' ? t('openPostThinkMarked') : t('openPostThink')}
      </button>
    </div>
  )
}
