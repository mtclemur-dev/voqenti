import { useMemo, useState, useEffect, useRef } from 'react'
import { buildChatGptBudgetSummary } from '../lib/chatGptExport'

export function AIActionPanel({ currency, debts, expenses, incomes, journalEntries = [], language, paymentStatuses, settings, summary, t, utilityReadings = [] }) {
  const [activeTab, setActiveTab] = useState('chat')
  const [copyStatus, setCopyStatus] = useState('')
  const [syncedAt, setSyncedAt] = useState(() => new Date())
  
  // Local storage keys for API key and messages
  const API_KEY_LS_KEY = 'klarbudget_gemini_api_key'
  const MESSAGES_LS_KEY = `klarbudget_ai_messages_${settings?.user_id || 'default'}`

  const [apiKey, setApiKey] = useState(() => {
    return localStorage.getItem(API_KEY_LS_KEY) || import.meta.env.VITE_GEMINI_API_KEY || ''
  })
  
  const [messages, setMessages] = useState(() => {
    const saved = localStorage.getItem(MESSAGES_LS_KEY)
    return saved ? JSON.parse(saved) : []
  })
  
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [showKeyConfig, setShowKeyConfig] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  const messagesEndRef = useRef(null)

  // Save messages to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(MESSAGES_LS_KEY, JSON.stringify(messages))
  }, [MESSAGES_LS_KEY, messages])

  // Scroll to bottom of chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    if (activeTab === 'chat') {
      scrollToBottom()
    }
  }, [messages, activeTab])

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
      journalEntries,
      utilityReadings,
    }),
    [currency, debts, expenses, incomes, journalEntries, language, paymentStatuses, settings, summary, syncedAt, utilityReadings],
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

  const handleSaveApiKey = (e) => {
    e.preventDefault()
    if (!apiKeyInput.trim()) return
    localStorage.setItem(API_KEY_LS_KEY, apiKeyInput.trim())
    setApiKey(apiKeyInput.trim())
    setApiKeyInput('')
    setShowKeyConfig(false)
  }

  const handleDeleteApiKey = () => {
    if (window.confirm('Ești sigur că vrei să ștergi cheia API?')) {
      localStorage.removeItem(API_KEY_LS_KEY)
      setApiKey('')
      setShowKeyConfig(true)
    }
  }

  const handleClearChat = () => {
    if (window.confirm(t('clearConfirm') || 'Ștergi istoricul chat-ului?')) {
      setMessages([])
    }
  }

  const handleSend = async (forcedText = null) => {
    const query = forcedText || input
    if (!query.trim()) return
    if (!apiKey) return

    const newMessages = [...messages, { role: 'user', content: query }]
    setMessages(newMessages)
    if (!forcedText) setInput('')
    setLoading(true)

    try {
      const budgetContext = exportText

      // Map messages history to Gemini schema (user / model), filtering out error messages
      const history = messages
        .filter(msg => !msg.isError)
        .map(msg => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }]
        }))

      history.push({
        role: 'user',
        parts: [{ text: query }]
      })

      const systemInstructionText = `Ești KlarBudget AI, un asistent financiar personal inteligent. Răspunzi în limba în care ți se adresează utilizatorul (Română, Germană sau Engleză) și îl ajuți să își gestioneze finanțele.
Iată datele financiare actuale ale utilizatorului pentru context:
${budgetContext}

Folosește aceste date pentru a răspunde cu calcule exacte la întrebări (cum ar fi sume totale de cheltuieli, venituri, datorii, economii, utilități). Fii clar, oferă exemple structurate sau tabele dacă este util și folosește un ton constructiv și prietenos.`

      const payloadBody = {
        contents: history,
        system_instruction: {
          parts: [{ text: systemInstructionText }]
        },
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 2048,
        }
      }

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payloadBody)
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        console.error('Gemini API Error:', errData)
        throw new Error(errData.error?.message || `HTTP ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      const textAnswer = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Niciun răspuns primit.'

      setMessages([...newMessages, { role: 'model', content: textAnswer }])
    } catch (error) {
      console.error(error)
      const details = error instanceof Error ? error.message : String(error)
      setMessages([...newMessages, { role: 'model', content: `${t('aiChatError')} (${details})`, isError: true }])
    } finally {
      setLoading(false)
    }
  }

  const renderMarkdown = (text) => {
    if (!text) return null
    // Escape HTML first to be safe
    let escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

    // Format bold, italic, code
    escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    escaped = escaped.replace(/\*(.*?)\*/g, '<em>$1</em>')
    escaped = escaped.replace(/`(.*?)`/g, '<code>$1</code>')

    const lines = escaped.split('\n')
    return lines.map((line, idx) => {
      let cleanLine = line
      
      // Headers
      if (cleanLine.startsWith('### ')) {
        return <h4 key={idx} style={{ marginTop: '0.6rem', marginBottom: '0.4rem', color: '#17463c', fontWeight: 'bold' }} dangerouslySetInnerHTML={{ __html: cleanLine.replace('### ', '') }} />
      }
      if (cleanLine.startsWith('## ')) {
        return <h3 key={idx} style={{ marginTop: '0.8rem', marginBottom: '0.4rem', color: '#17463c', fontWeight: 'bold' }} dangerouslySetInnerHTML={{ __html: cleanLine.replace('## ', '') }} />
      }
      if (cleanLine.startsWith('# ')) {
        return <h2 key={idx} style={{ marginTop: '1rem', marginBottom: '0.5rem', color: '#17463c', fontWeight: 'bold' }} dangerouslySetInnerHTML={{ __html: cleanLine.replace('# ', '') }} />
      }
      // Lists
      if (cleanLine.trim().startsWith('- ') || cleanLine.trim().startsWith('* ')) {
        const itemText = cleanLine.trim().replace(/^[-*]\s+/, '')
        return <li key={idx} style={{ marginLeft: '1.2rem', marginBottom: '0.2rem', listStyleType: 'disc' }} dangerouslySetInnerHTML={{ __html: itemText }} />
      }
      
      return <p key={idx} style={{ margin: '0 0 0.4rem 0', minHeight: '1em', lineHeight: '1.4' }} dangerouslySetInnerHTML={{ __html: cleanLine }} />
    })
  }

  const quickPrompts = [
    { label: '📊 ' + (t('aiPromptTotalExpenses') || 'Total Cheltuieli'), prompt: t('aiPromptTotalExpenses') || 'Care este totalul cheltuielilor mele?' },
    { label: '💸 ' + (t('aiPromptTotalDebts') || 'Total Datorii'), prompt: t('aiPromptTotalDebts') || 'Fă-mi un total al datoriilor active.' },
    { label: '💡 ' + (t('aiPromptSavingsPlan') || 'Sfaturi Economisire'), prompt: t('aiPromptSavingsPlan') || 'Ce idei de economisire ai bazat pe bugetul meu?' },
    { label: '⚡ ' + (t('aiPromptAnalyzeUtilities') || 'Utilități'), prompt: t('aiPromptAnalyzeUtilities') || 'Analizează citirile mele de utilități.' }
  ]

  return (
    <section className="section ai-actions">
      <div className="section-title">
        <h2>{t('aiActions')}</h2>
      </div>

      <div className="tabbar inline-tabs" style={{ marginBottom: '1.2rem' }}>
        <button
          type="button"
          className={activeTab === 'chat' ? 'active' : ''}
          onClick={() => setActiveTab('chat')}
        >
          🤖 Asistent Chat
        </button>
        <button
          type="button"
          className={activeTab === 'export' ? 'active' : ''}
          onClick={() => setActiveTab('export')}
        >
          📋 {t('chatGptExportTitle')}
        </button>
      </div>

      {activeTab === 'export' ? (
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
      ) : (
        <section className="ai-box">
          {/* API Key Status / Configuration Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid rgba(23, 70, 60, 0.1)', paddingBottom: '0.6rem' }}>
            <div style={{ fontSize: '0.86rem' }}>
              {apiKey ? (
                <span style={{ color: '#17463c', fontWeight: 'bold' }}>
                  ⚡ Gemini API conectat
                </span>
              ) : (
                <span style={{ color: '#d9534f', fontWeight: 'bold' }}>
                  🔑 Gemini API lipsă
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              {apiKey && (
                <button type="button" className="ghost" style={{ fontSize: '0.76rem', padding: '0.15rem 0.4rem', minHeight: 'auto' }} onClick={() => setShowKeyConfig(!showKeyConfig)}>
                  {showKeyConfig ? 'Ascunde Config' : 'Schimbă Cheia'}
                </button>
              )}
              {apiKey && (
                <button type="button" className="ghost danger" style={{ fontSize: '0.76rem', padding: '0.15rem 0.4rem', minHeight: 'auto', color: '#d9534f' }} onClick={handleDeleteApiKey}>
                  Șterge Cheia
                </button>
              )}
              {messages.length > 0 && (
                <button type="button" className="ghost" style={{ fontSize: '0.76rem', padding: '0.15rem 0.4rem', minHeight: 'auto' }} onClick={handleClearChat}>
                  {t('aiClearChat')}
                </button>
              )}
            </div>
          </div>

          {/* API Key Form */}
          {(!apiKey || showKeyConfig) && (
            <form onSubmit={handleSaveApiKey} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.8rem', background: '#f8faf9', border: '1px solid rgba(23, 70, 60, 0.1)', borderRadius: '6px', marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#17463c' }}>{t('aiApiKeyLabel')}</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder={t('aiApiKeyPlaceholder')}
                  style={{ flex: 1, minHeight: '34px', fontSize: '0.84rem' }}
                  required
                />
                <button type="submit" style={{ minHeight: '34px', padding: '0 0.8rem', fontSize: '0.84rem' }}>{t('aiApiKeySave')}</button>
              </div>
              <p style={{ fontSize: '0.72rem', color: '#63746e', margin: 0 }}>
                {t('aiApiKeyHint')}{' '}
                <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline', color: '#17463c', fontWeight: 'bold' }}>
                  Google AI Studio (Gratuit)
                </a>
              </p>
            </form>
          )}

          {/* Main Chat Area */}
          {!apiKey ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem', textAlign: 'center', border: '1px dashed rgba(23, 70, 60, 0.2)', borderRadius: '8px', background: '#f8faf9' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🤖</div>
              <h4 style={{ margin: '0 0 0.5rem 0', color: '#17463c' }}>{t('aiChatTitle')}</h4>
              <p style={{ fontSize: '0.8rem', color: '#63746e', maxWidth: '320px', margin: '0 0 1rem 0' }}>
                {t('aiApiKeyMissing')}
              </p>
            </div>
          ) : (
            <>
              {/* Messages viewport */}
              <div
                style={{
                  border: '1px solid rgba(23, 70, 60, 0.1)',
                  borderRadius: '8px',
                  backgroundColor: '#fafbfc',
                  padding: '1rem',
                  maxHeight: '400px',
                  overflowY: 'auto',
                  marginBottom: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.8rem'
                }}
              >
                {messages.length === 0 ? (
                  <div style={{ display: 'flex', gap: '0.6rem', padding: '0.5rem' }}>
                    <div style={{ fontSize: '1.2rem' }}>🤖</div>
                    <div style={{ background: '#eef2f1', color: '#17463c', padding: '0.6rem 0.9rem', borderRadius: '12px 12px 12px 0', fontSize: '0.86rem', maxWidth: '80%', alignSelf: 'flex-start' }}>
                      <p style={{ margin: 0, fontWeight: 'bold', marginBottom: '0.2rem' }}>KlarBudget AI</p>
                      <p style={{ margin: 0 }}>Salut! Sunt asistentul tău financiar KlarBudget AI. Întreabă-mă orice despre veniturile, cheltuielile sau datoriile tale de mai jos, sau folosește întrebările rapide.</p>
                    </div>
                  </div>
                ) : (
                  messages.map((msg, index) => {
                    const isUser = msg.role === 'user'
                    return (
                      <div key={index} style={{ display: 'flex', gap: '0.5rem', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
                        {!isUser && <div style={{ fontSize: '1.2rem', marginTop: '2px' }}>🤖</div>}
                        <div
                          style={{
                            background: isUser ? '#17463c' : msg.isError ? '#fde8e8' : '#eef2f1',
                            color: isUser ? '#ffffff' : msg.isError ? '#9b1c1c' : '#17463c',
                            padding: '0.6rem 0.9rem',
                            borderRadius: isUser ? '12px 12px 0 12px' : '12px 12px 12px 0',
                            fontSize: '0.84rem',
                            maxWidth: '85%',
                            border: msg.isError ? '1px solid #f8b4b4' : 'none',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                          }}
                        >
                          {!isUser && <div style={{ fontWeight: 'bold', fontSize: '0.74rem', marginBottom: '0.2rem', color: msg.isError ? '#9b1c1c' : '#56716a' }}>KlarBudget AI</div>}
                          {isUser ? <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{msg.content}</p> : renderMarkdown(msg.content)}
                        </div>
                      </div>
                    )
                  })
                )}

                {loading && (
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-start' }}>
                    <div style={{ fontSize: '1.2rem' }}>🤖</div>
                    <div style={{ background: '#eef2f1', color: '#63746e', padding: '0.6rem 0.9rem', borderRadius: '12px 12px 12px 0', fontSize: '0.84rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span className="ai-pulse" style={{ display: 'inline-block', width: '6px', height: '6px', backgroundColor: '#17463c', borderRadius: '50%' }}></span>
                      <span style={{ fontSize: '0.78rem' }}>{t('aiThinking')}</span>
                    </div>
                  </div>
                )}
                
                <div ref={messagesEndRef} />
              </div>

              {/* Quick Prompt Chips */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.8rem' }}>
                <span style={{ fontSize: '0.76rem', color: '#63746e', fontWeight: 'bold' }}>{t('aiQuickPrompts')}</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {quickPrompts.map((qp, index) => (
                    <button
                      key={index}
                      type="button"
                      className="ghost"
                      style={{
                        fontSize: '0.78rem',
                        padding: '0.25rem 0.6rem',
                        minHeight: 'auto',
                        border: '1px solid rgba(23, 70, 60, 0.2)',
                        borderRadius: '20px',
                        background: '#f1f5f3',
                        color: '#17463c'
                      }}
                      onClick={() => handleSend(qp.prompt)}
                      disabled={loading}
                    >
                      {qp.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Input Message Form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  handleSend()
                }}
                style={{ display: 'flex', gap: '0.4rem' }}
              >
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={t('aiInputPlaceholder')}
                  disabled={loading}
                  style={{ flex: 1, minHeight: '38px', fontSize: '0.86rem' }}
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  style={{ minHeight: '38px', padding: '0 1rem', fontSize: '0.86rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  🚀
                </button>
              </form>
            </>
          )}
        </section>
      )}
    </section>
  )
}
