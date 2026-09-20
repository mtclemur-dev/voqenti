import { useEffect, useRef, useState } from 'react'
import { IconCheck, IconClose } from '../plan/icons'
import { GuideArt } from './GuideArt'
import { isSafetyShoeLessonDone, lessonScreens, markSafetyShoeLessonDone } from './safetyShoesContent'

function fill(text, vars) {
  return Object.entries(vars).reduce((acc, [key, value]) => acc.split(`{${key}}`).join(String(value)), text)
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduced(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])
  return reduced
}

function LessonButton({ children, onClick, variant = 'primary', disabled = false, ...props }) {
  const look = variant === 'primary'
    ? 'bg-cyan-500 text-slate-950'
    : variant === 'ghost'
      ? 'bg-slate-800 text-slate-100'
      : 'bg-white/10 text-white'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-11 w-full items-center justify-center rounded-xl px-4 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-50 ${look}`}
      {...props}
    >
      {children}
    </button>
  )
}

function Feedback({ ok, text }) {
  return (
    <p className="mt-3 flex items-start gap-2 text-sm text-slate-100" role="status">
      <span className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${ok ? 'bg-cyan-400 text-slate-950' : 'bg-amber-300 text-slate-950'}`} aria-hidden="true">
        {ok ? <IconCheck className="h-4 w-4" /> : <IconClose className="h-4 w-4" />}
      </span>
      <span>{text}</span>
    </p>
  )
}

export default function SafetyShoeLesson({ t, onClose }) {
  const screens = lessonScreens
  const reducedMotion = useReducedMotion()
  const [section, setSection] = useState(0)
  const [example, setExample] = useState(0)
  const [choice, setChoice] = useState(null)
  const [quizIndex, setQuizIndex] = useState(0)
  const [answers, setAnswers] = useState({})
  const [revealed, setRevealed] = useState(false)
  const [ackChecked, setAckChecked] = useState(false)
  const [ackState, setAckState] = useState(isSafetyShoeLessonDone() ? 'device' : '')
  const touchX = useRef(null)
  const headingRef = useRef(null)
  const screen = screens[section]
  const total = screens.length

  useEffect(() => {
    headingRef.current?.focus()
  }, [section])

  const goSection = (next) => {
    setSection(Math.min(Math.max(next, 0), total - 1))
    setExample(0)
    setChoice(null)
    setQuizIndex(0)
    setRevealed(false)
  }

  const resetLesson = () => {
    setSection(0)
    setExample(0)
    setChoice(null)
    setQuizIndex(0)
    setAnswers({})
    setRevealed(false)
    setAckChecked(false)
    setAckState(isSafetyShoeLessonDone() ? 'device' : '')
  }

  const situations = screens.find(item => item.type === 'situations')
  const compare = screens.find(item => item.type === 'compare')
  const choose = screens.find(item => item.type === 'choose')
  const checklist = screens.find(item => item.type === 'checklist')
  const quiz = screens.find(item => item.type === 'quiz')
  const card = situations.cards[example]
  const question = quiz.questions[quizIndex]
  const selected = answers[question.id]
  const chooseOption = choose.options.find(item => item.id === choice)
  const chooseOk = choice === choose.correctId

  const quizScore = quiz.questions.filter(item => answers[item.id] === item.correctId).length
  const wrongQuestions = quiz.questions.filter(item => answers[item.id] && answers[item.id] !== item.correctId)

  const onCardTouchStart = (event) => {
    if (reducedMotion) return
    touchX.current = event.changedTouches[0]?.clientX ?? null
  }
  const onCardTouchEnd = (event) => {
    if (reducedMotion || touchX.current == null) return
    const delta = event.changedTouches[0].clientX - touchX.current
    touchX.current = null
    if (delta > 48 && example > 0) setExample(example - 1)
    if (delta < -48 && example < situations.cards.length - 1) setExample(example + 1)
  }

  const confirmLocal = () => {
    if (!ackChecked) return
    setAckState(markSafetyShoeLessonDone() ? 'device' : 'done')
  }

  const sectionLabel = fill(t('shoeLessonSection'), { current: section + 1, total })

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-cyan-200" aria-live="polite">
            {sectionLabel}
          </p>
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="mt-2 text-2xl font-black text-white focus:outline-none"
          >
            {t('shoeLessonTitle')}
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
        <div className="rounded-[1.75rem] border border-cyan-300/20 bg-slate-900/80 p-5">
          <p className="text-sm leading-6 text-slate-100">{t('shoeLessonLead')}</p>
          <ul className="mt-4 space-y-2 text-sm text-slate-200">
            <li>{t('shoeLessonGoal1')}</li>
            <li>{t('shoeLessonGoal2')}</li>
            <li>{t('shoeLessonGoal3')}</li>
          </ul>
          <p className="mt-4 text-sm font-semibold text-white">{t('shoeLessonChoiceDepends')}</p>
          <p className="mt-4 text-xs leading-5 text-slate-400">{t('shoeLessonDisclaimer')}</p>
          <div className="mt-5">
            <LessonButton onClick={() => goSection(1)}>{t('continue')}</LessonButton>
          </div>
        </div>
      )}

      {screen.type === 'situations' && (
        <div className="rounded-[1.75rem] border border-cyan-300/20 bg-slate-900/80 p-5">
          <p className="text-xs font-semibold text-cyan-100" aria-live="polite">
            {fill(t('shoeLessonExample'), { current: example + 1, total: situations.cards.length })}
          </p>
          <div
            className="mt-3"
            onTouchStart={onCardTouchStart}
            onTouchEnd={onCardTouchEnd}
          >
            <GuideArt name={card.art} className="h-32 w-full text-cyan-200" />
            <h3 className="mt-3 text-lg font-bold text-white">{t(card.titleKey)}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-200">{t(card.bodyKey)}</p>
            <p className="mt-3 text-sm text-amber-100"><span className="font-semibold">{t('shoeLessonDanger')}: </span>{t(card.dangerKey)}</p>
            <p className="mt-1 text-sm text-cyan-100"><span className="font-semibold">{t('shoeLessonMeasure')}: </span>{t(card.measureKey)}</p>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <LessonButton variant="ghost" onClick={() => setExample(example - 1)} disabled={example === 0}>{t('back')}</LessonButton>
            <LessonButton variant="ghost" onClick={() => setExample(example + 1)} disabled={example === situations.cards.length - 1}>{t('continue')}</LessonButton>
          </div>
          <div className="mt-3">
            <LessonButton onClick={() => goSection(2)}>{t('shoeLessonNextSection')}</LessonButton>
          </div>
        </div>
      )}

      {screen.type === 'compare' && (
        <div className="space-y-3">
          {compare.items.map(item => (
            <article key={item.id} className="rounded-[1.5rem] border border-white/10 bg-slate-900/80 p-4">
              <GuideArt name={item.art} className="mx-auto h-20 w-32 text-cyan-200" />
              <h3 className="mt-2 text-base font-bold text-white">{t(item.titleKey)}</h3>
              <p className="mt-1 text-sm leading-6 text-slate-200">{t(item.bodyKey)}</p>
            </article>
          ))}
          <p className="text-sm font-semibold text-white">{t('shoeLessonChoiceDepends')}</p>
          <div className="grid grid-cols-2 gap-2">
            <LessonButton variant="ghost" onClick={() => goSection(1)}>{t('back')}</LessonButton>
            <LessonButton onClick={() => goSection(3)}>{t('continue')}</LessonButton>
          </div>
        </div>
      )}

      {screen.type === 'choose' && (
        <div className="rounded-[1.75rem] border border-cyan-300/20 bg-slate-900/80 p-5">
          <p className="text-sm leading-6 text-slate-100">{t('shoeChoosePrompt')}</p>
          <p className="mt-2 text-sm font-semibold text-white">{t('shoeChooseScenario')}</p>
          <div role="radiogroup" aria-label={t('shoeChoosePrompt')} className="mt-4 grid gap-2">
            {choose.options.map(item => {
              const selectedChoice = choice === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={selectedChoice}
                  onClick={() => setChoice(item.id)}
                  className={`rounded-2xl border p-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${selectedChoice ? 'border-cyan-300 bg-cyan-500/15' : 'border-white/10 bg-slate-950/40'}`}
                >
                  <GuideArt name={item.art} className="mx-auto h-16 w-28 text-cyan-200" />
                  <span className="mt-2 block text-sm font-semibold text-white">{t(item.labelKey)}</span>
                </button>
              )
            })}
          </div>
          {chooseOption && (
            <Feedback ok={chooseOk} text={t(chooseOption.explainKey)} />
          )}
          {choice && (
            <div className="mt-3">
              <LessonButton variant="ghost" onClick={() => setChoice(null)}>{t('shoeLessonTryAgain')}</LessonButton>
            </div>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <LessonButton variant="ghost" onClick={() => goSection(2)}>{t('back')}</LessonButton>
            <LessonButton onClick={() => goSection(4)} disabled={!choice}>{t('continue')}</LessonButton>
          </div>
        </div>
      )}

      {screen.type === 'checklist' && (
        <div className="rounded-[1.75rem] border border-cyan-300/20 bg-slate-900/80 p-5">
          <h3 className="text-lg font-bold text-white">{t('shoeCheckTitle')}</h3>
          <p className="mt-2 text-sm text-slate-300">{t('shoeCheckLead')}</p>
          <ol className="mt-4 space-y-3">
            {checklist.items.map((item, index) => (
              <li key={item.id} className="flex gap-3 text-sm leading-6 text-slate-100">
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-cyan-200">{index + 1}</span>
                <span>{t(item.key)}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm font-semibold text-white">{t('shoeCheckRule')}</p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <LessonButton variant="ghost" onClick={() => goSection(3)}>{t('back')}</LessonButton>
            <LessonButton onClick={() => goSection(5)}>{t('continue')}</LessonButton>
          </div>
        </div>
      )}

      {screen.type === 'quiz' && (
        <div className="rounded-[1.75rem] border border-cyan-300/20 bg-slate-900/80 p-5">
          <p className="text-xs font-semibold text-cyan-100" aria-live="polite">
            {fill(t('shoeLessonQuestion'), { current: quizIndex + 1, total: quiz.questions.length })}
          </p>
          <h3 className="mt-2 text-lg font-bold text-white">{t(question.promptKey)}</h3>
          <div role="radiogroup" aria-label={t(question.promptKey)} className="mt-4 space-y-2">
            {question.options.map(option => {
              const isSelected = selected === option.id
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => {
                    setAnswers(current => ({ ...current, [question.id]: option.id }))
                    setRevealed(true)
                  }}
                  className={`min-h-11 w-full rounded-xl px-4 py-3 text-left text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${isSelected ? 'bg-cyan-500/20 text-white ring-1 ring-cyan-300' : 'bg-slate-800 text-slate-100'}`}
                >
                  {t(option.labelKey)}
                </button>
              )
            })}
          </div>
          {revealed && selected && (
            <Feedback ok={selected === question.correctId} text={t(question.explainKey)} />
          )}
          <div className="mt-5 grid grid-cols-2 gap-2">
            <LessonButton
              variant="ghost"
              onClick={() => {
                if (quizIndex === 0) {
                  goSection(4)
                  return
                }
                setQuizIndex(quizIndex - 1)
                setRevealed(Boolean(answers[quiz.questions[quizIndex - 1].id]))
              }}
            >
              {t('back')}
            </LessonButton>
            <LessonButton
              onClick={() => {
                if (quizIndex < quiz.questions.length - 1) {
                  const next = quizIndex + 1
                  setQuizIndex(next)
                  setRevealed(Boolean(answers[quiz.questions[next].id]))
                  return
                }
                goSection(6)
              }}
              disabled={!selected}
            >
              {t('continue')}
            </LessonButton>
          </div>
        </div>
      )}

      {screen.type === 'result' && (
        <div className="rounded-[1.75rem] border border-cyan-300/20 bg-slate-900/80 p-5">
          <p className="text-lg font-bold text-white">
            {fill(t('shoeLessonScore'), { score: quizScore, total: quiz.questions.length })}
          </p>
          {wrongQuestions.length > 0 && (
            <div className="mt-4 space-y-3">
              <p className="text-sm font-semibold text-amber-100">{t('shoeLessonWrong')}</p>
              {wrongQuestions.map(item => (
                <p key={item.id} className="text-sm leading-6 text-slate-200">{t(item.explainKey)}</p>
              ))}
            </div>
          )}
          <div className="mt-5">
            <LessonButton variant="ghost" onClick={resetLesson}>{t('shoeLessonRepeat')}</LessonButton>
          </div>
          <label className="mt-5 flex items-start gap-3 text-sm text-slate-100">
            <input
              type="checkbox"
              checked={ackChecked}
              onChange={event => setAckChecked(event.target.checked)}
              className="mt-1 h-5 w-5 accent-cyan-400"
            />
            <span>{t('shoeLessonAckLabel')}</span>
          </label>
          <div className="mt-3">
            <LessonButton onClick={confirmLocal} disabled={!ackChecked || Boolean(ackState)}>
              {t('shoeLessonAckAction')}
            </LessonButton>
          </div>
          {ackState === 'device' && (
            <p className="mt-3 text-sm text-slate-300" role="status">{t('shoeLessonAckDevice')}</p>
          )}
          {ackState === 'done' && (
            <p className="mt-3 text-sm text-slate-300" role="status">{t('shoeLessonAckDone')}</p>
          )}
          <p className="mt-4 text-xs leading-5 text-slate-400">{t('shoeLessonDisclaimer')}</p>
        </div>
      )}
    </section>
  )
}
