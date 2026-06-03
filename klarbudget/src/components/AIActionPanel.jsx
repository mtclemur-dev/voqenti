import { useMemo, useState } from 'react'
import { buildChatGptBudgetSummary } from '../lib/chatGptExport'

export function AIActionPanel({ currency, debts, expenses, incomes, language, paymentStatuses, settings, summary, t }) {
  const [copyStatus, setCopyStatus] = useState('')
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
    }),
    [currency, debts, expenses, incomes, language, paymentStatuses, settings, summary],
  )

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
          <button type="button" onClick={copyForChatGpt}>{t('copyForChatGpt')}</button>
        </div>
        <p className="muted">{t('chatGptExportHint')}</p>
        {copyStatus && <div className="notice">{copyStatus}</div>}
        <textarea className="export-textarea" rows="18" value={exportText} readOnly />
      </section>
    </section>
  )
}
