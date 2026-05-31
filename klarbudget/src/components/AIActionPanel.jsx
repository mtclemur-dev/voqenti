import { useState } from 'react'
import { isRiskyAiAction, localAiActionPreview, requestAiActionPreview, safeActionTypes } from '../lib/aiActions'

export function AIActionPanel({ t, onConfirm }) {
  const [prompt, setPrompt] = useState('')
  const [preview, setPreview] = useState(null)
  const [editableJson, setEditableJson] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [extraConfirmed, setExtraConfirmed] = useState(false)

  const buildPreview = async () => {
    if (!prompt.trim()) return
    setStatus('loading')
    setError('')
    setExtraConfirmed(false)
    try {
      const action = await requestAiActionPreview(prompt)
      setPreview(action)
      setEditableJson(JSON.stringify(action.data, null, 2))
      setStatus('ready')
    } catch {
      const action = localAiActionPreview(prompt)
      setPreview(action)
      setEditableJson(JSON.stringify(action.data, null, 2))
      setStatus('local')
    }
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
      if (isRiskyAiAction(nextAction) && !extraConfirmed) {
        setError(t('aiExtraConfirmationRequired'))
        return
      }
      await onConfirm(nextAction)
      setPrompt('')
      setPreview(null)
      setEditableJson('')
      setStatus('saved')
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
      <label>
        {t('aiPromptLabel')}
        <textarea rows="3" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={t('aiPromptPlaceholder')} />
      </label>
      <div className="form-actions">
        <button type="button" onClick={buildPreview} disabled={status === 'loading'}>{status === 'loading' ? t('aiPreparing') : t('aiPrepareAction')}</button>
      </div>
      {status === 'local' && <div className="notice">{t('aiLocalFallback')}</div>}
      {status === 'saved' && <div className="notice">{t('aiActionExecuted')}</div>}
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
            <textarea rows="10" value={editableJson} onChange={(event) => setEditableJson(event.target.value)} />
          </label>
          {isRiskyAiAction(preview) && (
            <label className="checkbox ai-risk-check">
              <input type="checkbox" checked={extraConfirmed} onChange={(event) => setExtraConfirmed(event.target.checked)} />
              {t('aiRiskConfirm')}
            </label>
          )}
          <div className="form-actions">
            <button type="button" onClick={confirmAction}>{t('confirm')}</button>
            <button type="button" className="secondary" onClick={() => setPreview(null)}>{t('edit')}</button>
            <button type="button" className="ghost danger-text" onClick={() => {
              setPreview(null)
              setEditableJson('')
              setExtraConfirmed(false)
            }}>{t('cancel')}</button>
          </div>
        </article>
      )}
    </section>
  )
}
