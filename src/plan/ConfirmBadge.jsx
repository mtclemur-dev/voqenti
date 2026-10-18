const TONE = {
  open: 'bg-slate-600/50 text-slate-200 ring-slate-400/35',
  seen: 'bg-emerald-400/15 text-emerald-200 ring-emerald-300/40',
  missing: 'bg-orange-400/15 text-orange-100 ring-orange-300/50',
}

const KEY = {
  open: 'confirmOpen',
  seen: 'confirmSeen',
  missing: 'confirmMissing',
}

export default function ConfirmBadge({ kind, t }) {
  const labelKey = KEY[kind]
  if (!labelKey) return null
  return (
    <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none ring-1 ${TONE[kind]}`}>
      {t(labelKey)}
    </span>
  )
}
