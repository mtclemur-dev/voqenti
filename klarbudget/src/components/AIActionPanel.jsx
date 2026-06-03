import { useState } from 'react'
import { isRiskyAiAction, requestAiActionPreview, requestAiQuestion, safeActionTypes } from '../lib/aiActions'

export function AIActionPanel({ t, language, summary, onConfirm }) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [questionStatus, setQuestionStatus] = useState('')
  const [actionPrompt, setActionPrompt] = useState('')
  const [preview, setPreview] = useState(null)
  const [editableJson, setEditableJson] = useState('')
  const [jsonEdited, setJsonEdited] = useState(false)
  const [actionStatus, setActionStatus] = useState('')
  const [error, setError] = useState('')
  const [extraConfirmed, setExtraConfirmed] = useState(false)

  const askQuestion = async () => {
    if (!question.trim()) return
    setQuestionStatus('loading')
    setAnswer('')
    setError('')
    const response = await requestAiQuestion(question, { language, summary, t })
    setAnswer(response.answer)
    setQuestionStatus(response.unavailable ? 'unavailable' : 'answered')
  }

  const buildPreview = async () => {
    if (!actionPrompt.trim()) return
    setActionStatus('loading')
    setError('')
    setPreview(null)
    setEditableJson('')
    setJsonEdited(false)
    setExtraConfirmed(false)

    const result = await requestAiActionPreview(actionPrompt, language)
    if (result.kind === 'answer') {
      setAnswer(t('aiUseQuestionBox'))
      setActionStatus('')
      return
    }
    if (result.kind === 'clarification') {
      if (result.message === 'openai_unavailable') setError(t('aiOpenAiUnavailable'))
      else if (['openai_key_missing', 'edge_function_failed'].includes(result.message)) setError(t('aiEdgeNoAction'))
      else setError(result.message === 'blocked_delete' || result.intent === 'blocked_delete' ? t('aiUnsafeActionBlocked') : t('aiClarifyIntent'))
      setActionStatus('')
      return
    }
    if (result.kind === 'error') {
      setError(t('aiEdgeNoAction'))
      setActionStatus('error')
      return
    }

    setPreview(result)
    setEditableJson(JSON.stringify(result.data, null, 2))
    setActionStatus('ready')
  }

  const confirmAction = async () => {
    if (!preview) return
    setError('')
    try {
      const data = JSON.parse(editableJson)
      const nextAction = { ...preview, data, requires_confirmation: true }
      if (!safeActionTypes.includes(nextAction.action_type)) {
        setError(t('aiUnsafeActionBlocked'))
        return
      }
      if ((nextAction.confidence || 0) < 0.8 && !jsonEdited) {
        setError(t('aiLowConfidence'))
        return
      }
      if (isRiskyAiAction(nextAction) && !extraConfirmed) {
        setError(t('aiExtraConfirmationRequired'))
        return
      }
      await onConfirm(nextAction)
      setActionPrompt('')
      setPreview(null)
      setEditableJson('')
      setJsonEdited(false)
      setActionStatus('saved')
      setExtraConfirmed(false)
    } catch (confirmError) {
      setError(confirmError.message || t('saveError'))
    }
  }

  return (
    <section className="section ai-actions">
      <div className="section-title">
        <h2>{t('aiActions')}</h2>
        <span>{t('aiPreviewOnly')}</span>
      </div>
      <div className="notice">{t('aiSafetyRule')}</div>

      <div className="ai-split">
        <section className="ai-box">
          <h3>{t('askAi')}</h3>
          <label>
            {t('aiQuestionLabel')}
            <textarea rows="3" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={t('aiQuestionPlaceholder')} />
          </label>
          <div className="form-actions">
            <button type="button" onClick={askQuestion} disabled={questionStatus === 'loading'}>{questionStatus === 'loading' ? t('aiPreparing') : t('ask')}</button>
          </div>
          {answer && (
            <article className="ai-answer-card">
              <strong>{t('aiAnswer')}</strong>
              <p>{answer}</p>
            </article>
          )}
        </section>

        <section className="ai-box">
          <h3>{t('prepareAction')}</h3>
          <label>
            {t('aiPromptLabel')}
            <textarea rows="3" value={actionPrompt} onChange={(event) => setActionPrompt(event.target.value)} placeholder={t('aiPromptPlaceholder')} />
          </label>
          <div className="form-actions">
            <button type="button" onClick={buildPreview} disabled={actionStatus === 'loading'}>{actionStatus === 'loading' ? t('aiPreparing') : t('aiPrepareAction')}</button>
          </div>
          {actionStatus === 'saved' && <div className="notice">{t('aiActionExecuted')}</div>}
        </section>
      </div>

      {error && <div className="notice danger">{error}</div>}
      {preview && (
        <article className={`ai-preview-card ${isRiskyAiAction(preview) ? 'risk' : ''}`}>
          <div>
            <strong>{t('aiActionPreview')}</strong>
            <span>{t('actionType')}: {t(preview.action_type) || preview.action_type}</span>
            <span>{t('confidence')}: {Math.round((preview.confidence || 0) * 100)}%</span>
            <span>{t('requiresConfirmation')}: {preview.requires_confirmation ? t('yes') : t('no')}</span>
          </div>
          <label>
            {t('aiDataToSave')}
            <textarea rows="10" value={editableJson} onChange={(event) => {
              setEditableJson(event.target.value)
              setJsonEdited(true)
            }} />
          </label>
          {(preview.confidence || 0) < 0.8 && <div className="notice">{t('aiLowConfidence')}</div>}
          {isRiskyAiAction(preview) && (
            <label className="checkbox ai-risk-check">
              <input type="checkbox" checked={extraConfirmed} onChange={(event) => setExtraConfirmed(event.target.checked)} />
              {t('aiRiskConfirm')}
            </label>
          )}
          <div className="form-actions">
            <button type="button" onClick={confirmAction}>{t('confirm')}</button>
            <button type="button" className="secondary" onClick={() => setJsonEdited(true)}>{t('edit')}</button>
            <button type="button" className="ghost danger-text" onClick={() => {
              setPreview(null)
              setEditableJson('')
              setExtraConfirmed(false)
              setJsonEdited(false)
            }}>{t('cancel')}</button>
          </div>
        </article>
      )}
    </section>
  )
}
