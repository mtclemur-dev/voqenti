import { useEffect, useRef, useState } from 'react'
import { IconCheck, IconChevron, IconClose } from '../plan/icons'
import { fillText } from '../plan/planUtils'
import { GuideArt } from './GuideArt'
import { lessonScreens, lessonSources, markSafetyShoeLessonDone } from './safetyShoesContent'

function LessonButton({ children, onClick, variant = 'primary', disabled = false, ...props }) {
  const look = variant === 'primary'
    ? 'bg-cyan-500 text-slate-950 hover:bg-cyan-400'
    : variant === 'danger'
      ? 'bg-rose-500/20 text-rose-100 ring-1 ring-rose-300/40'
      : 'bg-slate-800 text-slate-100 hover:bg-slate-700'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-11 w-full items-center justify-center rounded-xl px-4 text-sm font-semibold transition duration-150 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-50 ${look}`}
      {...props}
    >
      {children}
    </button>
  )
}

function Nav({ t, onBack, onNext, nextDisabled = false, nextLabel }) {
  return (
    <div className="mt-5 grid grid-cols-2 gap-2">
      <LessonButton variant="ghost" onClick={onBack}>{t('back')}</LessonButton>
      <LessonButton onClick={onNext} disabled={nextDisabled}>{nextLabel || t('continue')}</LessonButton>
    </div>
  )
}

function Feedback({ ok, text }) {
  return (
    <p
      className={`mt-3 flex items-start gap-2 text-sm ${ok ? 'text-emerald-100' : 'text-rose-100'}`}
      role="status"
      aria-live="polite"
    >
      <span
        className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${ok ? 'bg-emerald-400 text-slate-950' : 'bg-rose-400 text-slate-950'}`}
        aria-hidden="true"
      >
        {ok ? <IconCheck className="h-4 w-4" /> : <IconClose className="h-4 w-4" />}
      </span>
      <span>
        <span className="font-semibold">{ok ? '✓ ' : '✕ '}</span>
        {text}
      </span>
    </p>
  )
}

function CardShell({ children }) {
  return (
    <div className="rounded-[1.75rem] border border-white/10 bg-slate-900/80 p-5">
      {children}
    </div>
  )
}

export default function SafetyShoeLesson({ t, onClose, onOpenPlan, objects = [] }) {
  const screens = lessonScreens
  const [section, setSection] = useState(0)
  const [example, setExample] = useState(0)
  const [marksOpen, setMarksOpen] = useState(false)
  const [inspectId, setInspectId] = useState('')
  const [quizIndex, setQuizIndex] = useState(0)
  const [answers, setAnswers] = useState({})
  const [objectOpen, setObjectOpen] = useState(false)
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const headingRef = useRef(null)
  const screen = screens[section]
  const total = screens.length
  const why = screens.find(item => item.type === 'why')
  const who = screens.find(item => item.type === 'who')
  const marks = screens.find(item => item.type === 'marks')
  const examples = screens.find(item => item.type === 'examples')
  const inspect = screens.find(item => item.type === 'inspect')
  const care = screens.find(item => item.type === 'care')
  const unfit = screens.find(item => item.type === 'unfit')
  const quiz = screens.find(item => item.type === 'quiz')
  const summary = screens.find(item => item.type === 'summary')
  const question = quiz.questions[quizIndex]
  const selected = answers[question.id]
  const inspectOption = inspect.options.find(item => item.id === inspectId)
  const quizScore = quiz.questions.filter(item => answers[item.id] === item.correctId).length
  const objectHints = objects.filter(item => item?.name || item?.address || item?.phone || item?.manager)

  useEffect(() => {
    headingRef.current?.focus()
  }, [section])

  useEffect(() => {
    if (screen.type === 'summary') markSafetyShoeLessonDone()
  }, [screen.type])

  const go = (next) => {
    setSection(Math.min(Math.max(next, 0), total - 1))
    setExample(0)
    setInspectId('')
    if (next !== screens.findIndex(item => item.type === 'quiz')) {
      setQuizIndex(0)
    }
  }

  const resetLesson = () => {
    setSection(0)
    setExample(0)
    setMarksOpen(false)
    setInspectId('')
    setQuizIndex(0)
    setAnswers({})
    setObjectOpen(false)
    setSourcesOpen(false)
  }

  const title = screen.type === 'intro'
    ? t('shoeLessonTitle')
    : screen.type === 'why'
      ? t('shoeWhyTitle')
      : screen.type === 'who'
        ? t('shoeWhoTitle')
        : screen.type === 'marks'
          ? t('shoeMarkTitle')
          : screen.type === 'examples'
            ? t('shoeExTitle')
            : screen.type === 'inspect'
              ? t('shoeLookTitle')
              : screen.type === 'care'
                ? t('shoeCareTitle')
                : screen.type === 'unfit'
                  ? t('shoeUnfitTitle')
                  : screen.type === 'quiz'
                    ? t('shoeQuizTitle')
                    : t('shoeSummaryTitle')

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-cyan-200" aria-live="polite">
            {fillText(t('shoeLessonSection'), { current: String(section + 1), total: String(total) })}
          </p>
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="mt-2 text-2xl font-black text-white focus:outline-none"
          >
            {title}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-slate-800 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          aria-label={t('close')}
        >
          <IconClose />
        </button>
      </div>

      {screen.type === 'intro' && (
        <CardShell>
          <GuideArt name="introShoe" className="mx-auto h-32 w-full max-w-sm text-cyan-200" title={t('shoeIntroArt')} decorative={false} />
          <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-100">
            <li>{t('shoeIntro1')}</li>
            <li>{t('shoeIntro2')}</li>
            <li>{t('shoeIntro3')}</li>
          </ul>
          <div className="mt-5">
            <LessonButton onClick={() => go(1)}>{t('continue')}</LessonButton>
          </div>
        </CardShell>
      )}

      {screen.type === 'why' && (
        <div className="grid gap-3 sm:grid-cols-2">
          {why.cards.map(card => (
            <article key={card.id} className="rounded-2xl border border-white/10 bg-slate-900/80 p-4">
              <GuideArt name={card.art} className="h-24 w-full text-cyan-200" />
              <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-amber-200">{t('shoeWhyHazard')}</p>
              <h3 className="mt-1 text-base font-bold text-white">{t(card.titleKey)}</h3>
              <p className="mt-2 text-sm text-slate-200"><span className="font-semibold">{t('shoeWhyExample')}: </span>{t(card.exampleKey)}</p>
              <p className="mt-1 text-sm text-cyan-100"><span className="font-semibold">{t('shoeWhyProtect')}: </span>{t(card.protectKey)}</p>
            </article>
          ))}
          <div className="sm:col-span-2">
            <Nav t={t} onBack={() => go(0)} onNext={() => go(2)} />
          </div>
        </div>
      )}

      {screen.type === 'who' && (
        <div className="space-y-3">
          {who.cards.map(card => (
            <article key={card.id} className="rounded-[1.5rem] border border-white/10 bg-slate-900/80 p-4">
              <GuideArt name={card.art} className="h-20 w-full text-cyan-200" />
              <h3 className="mt-2 text-base font-bold text-white">{t(card.titleKey)}</h3>
              <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-200">
                {card.points.map(key => (
                  <li key={key}>{t(key)}</li>
                ))}
              </ul>
            </article>
          ))}
          <Nav t={t} onBack={() => go(1)} onNext={() => go(3)} />
        </div>
      )}

      {screen.type === 'marks' && (
        <CardShell>
          <div className="space-y-3">
            {marks.basics.map(item => (
              <p key={item.code} className="rounded-xl bg-slate-950/50 px-3 py-3 text-sm leading-6 text-slate-100">
                <span className="font-bold text-cyan-200">{item.code}</span>
                {' — '}
                {t(item.key)}
              </p>
            ))}
          </div>
          <p className="mt-4 text-sm font-semibold text-white">{t('shoeMarkDepends')}</p>
          <button
            type="button"
            aria-expanded={marksOpen}
            aria-controls="shoe-mark-extra"
            onClick={() => setMarksOpen(current => !current)}
            className="mt-4 inline-flex min-h-11 w-full items-center justify-between rounded-xl bg-slate-800 px-4 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            {marksOpen ? t('shoeMarkLess') : t('shoeMarkMore')}
            <IconChevron className={`h-5 w-5 transition-transform duration-150 motion-reduce:transition-none ${marksOpen ? 'rotate-180' : ''}`} />
          </button>
          <div id="shoe-mark-extra" hidden={!marksOpen} className="mt-3 space-y-2">
            {marks.extra.map(item => (
              <p key={item.code} className="rounded-xl border border-white/10 px-3 py-3 text-sm leading-6 text-slate-200">
                <span className="font-bold text-cyan-100">{item.code}</span>
                {' — '}
                {t(item.key)}
              </p>
            ))}
          </div>
          <Nav t={t} onBack={() => go(2)} onNext={() => go(4)} />
        </CardShell>
      )}

      {screen.type === 'examples' && (
        <CardShell>
          <p className="text-xs font-semibold text-cyan-100" aria-live="polite">
            {fillText(t('shoeLessonExample'), { current: String(example + 1), total: String(examples.cards.length) })}
          </p>
          {examples.cards.map((card, index) => (
            <div key={card.id} hidden={index !== example}>
              <GuideArt name={card.art} className="mt-3 h-28 w-full text-cyan-200" />
              <h3 className="mt-3 text-lg font-bold text-white">{t(card.titleKey)}</h3>
              <p className="mt-2 text-sm leading-6 text-amber-100">{t(card.riskKey)}</p>
              <p className="mt-2 text-sm leading-6 text-slate-200">{t(card.pointKey)}</p>
            </div>
          ))}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <LessonButton variant="ghost" onClick={() => setExample(example - 1)} disabled={example === 0}>{t('back')}</LessonButton>
            <LessonButton variant="ghost" onClick={() => setExample(example + 1)} disabled={example === examples.cards.length - 1}>{t('continue')}</LessonButton>
          </div>
          <div className="mt-2">
            <LessonButton onClick={() => go(5)}>{t('shoeLessonNextSection')}</LessonButton>
          </div>
          <button type="button" onClick={() => go(3)} className="mt-2 min-h-11 w-full text-sm font-semibold text-slate-300 underline-offset-2 hover:underline">
            {t('back')}
          </button>
        </CardShell>
      )}

      {screen.type === 'inspect' && (
        <CardShell>
          <p className="text-sm leading-6 text-slate-100">{t('shoeLookLead')}</p>
          <ol className="mt-3 space-y-2 text-sm text-slate-200">
            {inspect.checks.map((key, index) => (
              <li key={key} className="flex gap-3">
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-cyan-200">{index + 1}</span>
                <span>{t(key)}</span>
              </li>
            ))}
          </ol>
          <p className="mt-5 text-sm font-semibold text-white">{t('shoeLookPrompt')}</p>
          <div role="radiogroup" aria-label={t('shoeLookPrompt')} className="mt-3 grid gap-2 sm:grid-cols-3">
            {inspect.options.map(item => {
              const on = inspectId === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setInspectId(item.id)}
                  className={`min-h-11 rounded-2xl border p-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
                    on ? 'border-cyan-300 bg-cyan-500/15' : 'border-white/10 bg-slate-950/40'
                  }`}
                >
                  <GuideArt name={item.art} className="mx-auto h-16 w-28 text-cyan-200" decorative={false} title={t(item.labelKey)} />
                  <span className="mt-2 block text-sm font-semibold text-white">{t(item.labelKey)}</span>
                </button>
              )
            })}
          </div>
          {inspectOption && (
            <Feedback ok={inspectOption.ok} text={t(inspectOption.explainKey)} />
          )}
          {inspectId && (
            <div className="mt-3">
              <LessonButton variant="ghost" onClick={() => setInspectId('')}>{t('shoeLessonTryAgain')}</LessonButton>
            </div>
          )}
          <Nav t={t} onBack={() => go(4)} onNext={() => go(6)} nextDisabled={!inspectId} />
        </CardShell>
      )}

      {screen.type === 'care' && (
        <CardShell>
          <ol className="space-y-3">
            {care.rules.map((key, index) => (
              <li key={key} className="flex gap-3 text-sm leading-6 text-slate-100">
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-cyan-200">{index + 1}</span>
                <span>{t(key)}</span>
              </li>
            ))}
          </ol>
          <Nav t={t} onBack={() => go(5)} onNext={() => go(7)} />
        </CardShell>
      )}

      {screen.type === 'unfit' && (
        <CardShell>
          <div className="grid gap-2 sm:grid-cols-2">
            {unfit.cases.map(key => (
              <p key={key} className="rounded-2xl border border-amber-300/20 bg-amber-400/10 px-3 py-3 text-sm leading-6 text-amber-50">
                {t(key)}
              </p>
            ))}
          </div>
          <p className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-500/10 px-4 py-3 text-sm font-semibold leading-6 text-cyan-50">
            {t('shoeUnfitAnswer')}
          </p>
          <div className="mt-4 space-y-2">
            {objectHints.length > 0 && (
              <>
                <LessonButton
                  variant="ghost"
                  aria-expanded={objectOpen}
                  onClick={() => setObjectOpen(current => !current)}
                >
                  {t('shoeUnfitObject')}
                </LessonButton>
                {objectOpen && (
                  <ul className="space-y-2 rounded-2xl border border-white/10 p-3 text-sm text-slate-200">
                    {objectHints.map(item => (
                      <li key={item.id || item.name}>
                        <p className="font-semibold text-white">{item.name}</p>
                        {item.address && <p>{item.address}</p>}
                        {item.manager && <p>{item.manager}</p>}
                        {item.phone && (
                          <a href={`tel:${item.phone}`} className="inline-flex min-h-11 items-center font-semibold text-cyan-200 underline">
                            {item.phone}
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            {onOpenPlan && (
              <LessonButton variant="ghost" onClick={onOpenPlan}>{t('shoeUnfitPlan')}</LessonButton>
            )}
          </div>
          <Nav t={t} onBack={() => go(6)} onNext={() => go(8)} />
        </CardShell>
      )}

      {screen.type === 'quiz' && (
        <CardShell>
          <p className="text-xs font-semibold text-cyan-100" aria-live="polite">
            {fillText(t('shoeLessonQuestion'), { current: String(quizIndex + 1), total: String(quiz.questions.length) })}
          </p>
          <h3 className="mt-2 text-lg font-bold text-white">{t(question.promptKey)}</h3>
          <div role="radiogroup" aria-label={t(question.promptKey)} className="mt-4 space-y-2">
            {question.options.map(option => {
              const on = selected === option.id
              const revealed = Boolean(selected)
              const correct = option.id === question.correctId
              const tone = !revealed || !on
                ? on
                  ? 'bg-cyan-500/20 text-white ring-1 ring-cyan-300'
                  : 'bg-slate-800 text-slate-100'
                : correct
                  ? 'bg-emerald-400/20 text-emerald-50 ring-1 ring-emerald-300'
                  : on
                    ? 'bg-rose-400/20 text-rose-50 ring-1 ring-rose-300'
                    : 'bg-slate-800 text-slate-100'
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setAnswers(current => ({ ...current, [question.id]: option.id }))}
                  className={`min-h-11 w-full rounded-xl px-4 py-3 text-left text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${tone}`}
                >
                  {t(option.labelKey)}
                </button>
              )
            })}
          </div>
          {selected && (
            <Feedback ok={selected === question.correctId} text={t(question.explainKey)} />
          )}
          {selected && selected !== question.correctId && (
            <div className="mt-3">
              <LessonButton variant="ghost" onClick={() => setAnswers(current => ({ ...current, [question.id]: '' }))}>
                {t('shoeLessonTryAgain')}
              </LessonButton>
            </div>
          )}
          <div className="mt-5 grid grid-cols-2 gap-2">
            <LessonButton
              variant="ghost"
              onClick={() => {
                if (quizIndex === 0) {
                  go(7)
                  return
                }
                setQuizIndex(quizIndex - 1)
              }}
            >
              {t('back')}
            </LessonButton>
            <LessonButton
              onClick={() => {
                if (quizIndex < quiz.questions.length - 1) {
                  setQuizIndex(quizIndex + 1)
                  return
                }
                go(9)
              }}
              disabled={!selected}
            >
              {t('continue')}
            </LessonButton>
          </div>
        </CardShell>
      )}

      {screen.type === 'summary' && (
        <CardShell>
          <ol className="space-y-3">
            {summary.rules.map((key, index) => (
              <li key={key} className="flex gap-3 text-sm leading-6 text-slate-100">
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-500 text-xs font-bold text-slate-950">{index + 1}</span>
                <span>{t(key)}</span>
              </li>
            ))}
          </ol>
          <p className="mt-5 text-lg font-bold text-white">
            {fillText(t('shoeLessonScore'), { score: String(quizScore), total: String(quiz.questions.length) })}
          </p>
          <div className="mt-4 space-y-2">
            <LessonButton variant="ghost" onClick={resetLesson}>{t('shoeLessonRepeat')}</LessonButton>
            <LessonButton
              variant="ghost"
              aria-expanded={sourcesOpen}
              onClick={() => setSourcesOpen(current => !current)}
            >
              {t('shoeSourcesOpen')}
            </LessonButton>
          </div>
          {sourcesOpen && (
            <div className="mt-4 rounded-2xl border border-white/10 p-4">
              <h3 className="text-sm font-bold text-white">{t('shoeSourcesTitle')}</h3>
              <ul className="mt-3 space-y-2">
                {lessonSources.map(item => (
                  <li key={item.id}>
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center text-sm font-semibold text-cyan-200 underline decoration-cyan-200/40"
                    >
                      {t(item.labelKey)}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-4 text-xs leading-5 text-slate-400">{t('shoeLessonDisclaimer')}</p>
          <div className="mt-4">
            <LessonButton variant="ghost" onClick={onClose}>{t('close')}</LessonButton>
          </div>
        </CardShell>
      )}
    </section>
  )
}
