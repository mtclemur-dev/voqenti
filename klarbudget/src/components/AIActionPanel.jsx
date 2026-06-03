import { useMemo, useState } from 'react'
import { buildChatGptBudgetSummary } from '../lib/chatGptExport'

export function AIActionPanel({ currency, debts, expenses, incomes, language, paymentStatuses, settings, summary, t }) {
  const [copyStatus, setCopyStatus] = useState('')
  const [syncedAt, setSyncedAt] = useState(() => new Date())
  const exportText = useMemo(
    () => buildChatGptBudgetSummary({
      currency,
      debts,
      expenses,
      incomes,
      language,
      paymentStatuses,
      settings,
      summary,
      syncedAt,
    }),
    [currency, debts, expenses, incomes, language, paymentStatuses, settings, summary, syncedAt],
  )

  const syncSummary = () => {
    setSyncedAt(new Date())
    setCopyStatus(t('chatGptExportSynced'))
  }

  const copyForChatGpt = async () => {
    try {
      await navigator.clipboard.writeText(exportText)
      setCopyStatus(t('chatGptExportCopied'))
    } catch {
      setCopyStatus(t('chatGptExportCopyFailed'))
    }
  }

  return (
    <section className="section ai-actions">
      <div className="section-title">
        <h2>{t('aiActions')}</h2>
        <span>{t('aiActionsPaused')}</span>
      </div>
      <div className="notice">{t('aiApiDisabled')}</div>

      <section className="ai-box">
        <div className="section-title">
          <h3>{t('chatGptExportTitle')}</h3>
          <div className="button-pair">
            <button type="button" className="secondary" onClick={syncSummary}>{t('syncSummary')}</button>
            <button type="button" onClick={copyForChatGpt}>{t('copyForChatGpt')}</button>
          </div>
        </div>
        <p className="muted">{t('chatGptExportHint')}</p>
        {copyStatus && <div className="notice">{copyStatus}</div>}
        <textarea className="export-textarea" rows="18" value={exportText} readOnly />
      </section>
    </section>
  )
}
