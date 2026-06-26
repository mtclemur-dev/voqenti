import '../styles/kids-play.css'
import {
  computeKidLevel,
  computeStreak,
  computeTotalEarned,
  countOpenMissions,
  getClosestReward,
  getKidGreeting,
  getKidTheme,
} from '../lib/kidPlayHelpers'

const QUICK_MESSAGES = [
  { label: '✅ Am terminat!', text: 'Am terminat sarcina!' },
  { label: '🆘 Am nevoie de ajutor', text: 'Am nevoie de ajutor, poate cineva să vină?' },
  { label: '🙏 Te rog aprobă', text: 'Te rog aprobă cererea mea!' },
  { label: '🏠 Sunt acasă', text: 'Sunt acasă!' },
  { label: '📞 Sună-mă', text: 'Te rog sună-mă!' },
  { label: '🎁 Pot cere recompensa?', text: 'Pot cere o recompensă?' },
]

function fmtEur(coins, coinValue = 0.1) {
  return (coins * coinValue).toFixed(2) + ' EUR'
}

function safeIcon(icon, fallback = '⭐') {
  const s = String(icon || '').trim()
  if (!s || s.includes('?') || s === 'undefined') return fallback
  return s
}

function formatDate(isoStr) {
  if (!isoStr) return ''
  try {
    return new Date(isoStr).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  } catch {
    return isoStr
  }
}

function childAvatar(name = '') {
  const n = String(name).trim()
  if (n.toLowerCase().includes('veronica')) return '🌸'
  if (n.toLowerCase().includes('robert')) return '🚀'
  return '⭐'
}

export function KidsPlayView({
  wallet,
  childrenNames,
  tasks,
  rewards,
  requests,
  messages,
  transactions,
  isChildAccount,
  showChildEur,
  coinValue,
  schemaReady,
  kidViewTab,
  setKidViewTab,
  celebration,
  kidChatText,
  setKidChatText,
  kidExitConfirm,
  setKidExitConfirm,
  onSubmitTask,
  onRequestReward,
  onSendMessage,
  onSignOut,
  onSwitchChild,
  onExitParent,
  tasksForWallet,
}) {
  if (!wallet) {
    return (
      <div className="kid-mode-overlay kid-play-mode" style={{ display: 'grid', placeItems: 'center', padding: '2rem' }}>
        <p style={{ color: '#9ca3af', textAlign: 'center' }}>Nu există portofele. Reîncarcă pagina.</p>
      </div>
    )
  }

  const balance = Number(wallet.balance || 0)
  const avatar = childAvatar(wallet.member_name)
  const theme = getKidTheme(wallet.member_name)
  const kidTasks = tasksForWallet(wallet.id)
  const kidRewards = rewards.filter((r) => r.is_available !== false)
  const kidRequests = requests.filter((r) => r.child_id === wallet.id).slice(0, 10)
  const openMissions = countOpenMissions(kidTasks, wallet.id, requests)
  const totalEarned = computeTotalEarned(transactions, wallet.id)
  const levelInfo = computeKidLevel(totalEarned)
  const streak = computeStreak(transactions, wallet.id)
  const nextReward = getClosestReward(kidRewards, balance)
  const pendingCount = requests.filter((r) => r.child_id === wallet.id && r.status === 'pending').length

  const navItems = [
    { id: 'home', icon: '🏠', label: 'Acasă' },
    { id: 'missions', icon: '⚡', label: 'Misiuni', badge: openMissions || null },
    { id: 'shop', icon: '🎁', label: 'Magazin' },
    { id: 'chat', icon: '💬', label: 'Chat', badge: pendingCount || null },
  ]

  return (
    <div className={`kid-mode-overlay kid-play-mode ${theme.className}`}>
      {celebration && (
        <div className="kid-celebration" aria-live="polite">
          <div className="kid-celebration-stars" aria-hidden="true">
            {Array.from({ length: 8 }, (_, i) => (
              <span
                key={i}
                style={{
                  left: `${8 + i * 11}%`,
                  top: `${18 + (i % 3) * 22}%`,
                  ['--tx']: `${(i - 4) * 14}px`,
                  ['--ty']: `${-28 - i * 6}px`,
                  animationDelay: `${i * 0.06}s`,
                }}
              >
                ✨
              </span>
            ))}
          </div>
          <div className="kid-celebration-card">
            <div className="kid-celebration-emoji">{celebration.emoji}</div>
            <div className="kid-celebration-title">{celebration.title}</div>
            <div className="kid-celebration-sub">{celebration.sub}</div>
          </div>
        </div>
      )}

      <header className="kid-play-header">
        <div className="kid-play-header-top">
          <div>
            <p className="kid-play-greeting">{getKidGreeting(wallet.member_name)}</p>
            <p className="kid-play-name">{avatar} {wallet.member_name}</p>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {isChildAccount ? (
              onSignOut && (
                <button type="button" className="kid-play-chip" onClick={onSignOut}>🚪 Ieșire</button>
              )
            ) : (
              <>
                {childrenNames.filter((n) => n !== wallet.member_name).map((name) => (
                  <button key={name} type="button" className="kid-play-chip" onClick={() => onSwitchChild(name)}>
                    {childAvatar(name)} {name}
                  </button>
                ))}
                <button type="button" className="kid-play-chip" onClick={() => setKidExitConfirm(true)}>🔐</button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="kid-play-main">
        {kidViewTab === 'home' && (
          <>
            <div className="kid-play-hero">
              <div className="kid-play-hero-emoji">{theme.emoji}</div>
              <div className="kid-play-balance-label">Monedele tale</div>
              <div className="kid-play-balance">{balance} 🪙</div>
              {showChildEur && (
                <div style={{ fontSize: '0.88rem', color: '#9ca3af', fontWeight: 600 }}>≈ {fmtEur(balance, coinValue)}</div>
              )}
              <div style={{ fontSize: '0.82rem', color: '#6b7280', marginTop: '0.5rem', fontWeight: 600 }}>{theme.tagline}</div>
            </div>

            <div className="kid-play-stats">
              <div className="kid-play-stat">
                <div className="kid-play-stat-icon">🔥</div>
                <div className="kid-play-stat-value">{streak}</div>
                <div className="kid-play-stat-label">Zile streak</div>
              </div>
              <div className="kid-play-stat">
                <div className="kid-play-stat-icon">⭐</div>
                <div className="kid-play-stat-value">Niv. {levelInfo.level}</div>
                <div className="kid-play-stat-label">{levelInfo.title}</div>
              </div>
              <div className="kid-play-stat">
                <div className="kid-play-stat-icon">⚡</div>
                <div className="kid-play-stat-value">{openMissions}</div>
                <div className="kid-play-stat-label">Misiuni</div>
              </div>
            </div>

            <div className="kid-play-level">
              <div className="kid-play-level-head">
                <span className="kid-play-level-title">Progres nivel {levelInfo.level}</span>
                <span className="kid-play-level-badge">{levelInfo.title}</span>
              </div>
              <div className="kid-play-level-bar">
                <div className="kid-play-level-fill" style={{ width: `${levelInfo.progress}%` }} />
              </div>
              <div className="kid-play-level-hint">
                {levelInfo.coinsToNext > 0
                  ? `Încă ${levelInfo.coinsToNext} monede până la nivelul următor 🚀`
                  : 'Nivel maxim atins! Ești legendă! 🏆'}
              </div>
            </div>

            {nextReward && (
              <button
                type="button"
                className="kid-play-next-reward"
                onClick={() => setKidViewTab('shop')}
              >
                <div className="kid-play-next-reward-icon">{safeIcon(nextReward.reward.icon, '🎁')}</div>
                <div className="kid-play-next-reward-body">
                  <div className="kid-play-next-reward-label">
                    {nextReward.canAfford ? 'Poți cere acum!' : 'Următoarea recompensă'}
                  </div>
                  <div className="kid-play-next-reward-title">{nextReward.reward.title}</div>
                  <div className="kid-play-level-bar" style={{ marginTop: '0.45rem' }}>
                    <div className="kid-play-level-fill" style={{ width: `${nextReward.pct}%` }} />
                  </div>
                  {!nextReward.canAfford && (
                    <div className="kid-play-level-hint">Mai trebuie {nextReward.missing} 🪙</div>
                  )}
                </div>
              </button>
            )}

            <div className="kid-play-quick-actions">
              <button type="button" className="kid-play-quick-btn primary" onClick={() => setKidViewTab('missions')}>
                ⚡ Misiuni ({openMissions})
              </button>
              <button type="button" className="kid-play-quick-btn" onClick={() => setKidViewTab('shop')}>
                🎁 Magazin
              </button>
            </div>
          </>
        )}

        {kidViewTab === 'missions' && (
          <div className="kid-tasks-section">
            <h2 className="kid-play-section-title">⚡ Misiunile mele</h2>
            {kidTasks.length === 0 ? (
              <div style={{ color: '#9ca3af', fontSize: '0.88rem', textAlign: 'center', padding: '2rem', background: '#fff', borderRadius: '16px', border: '2px dashed #e5e7eb' }}>
                Nicio misiune acum. Revino curând! 🎉
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {kidTasks.map((task) => {
                  const alreadyPending = requests.some((r) => r.task_id === task.id && r.child_id === wallet.id && r.status === 'pending')
                  return (
                    <div key={task.id} className="kid-task-card" style={{ background: '#fff', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ fontSize: '2rem', flexShrink: 0 }}>{safeIcon(task.icon)}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, color: '#15231f', fontSize: '0.95rem' }}>{task.title}</div>
                        <div style={{ fontWeight: 700, color: '#b45309', fontSize: '0.82rem', marginTop: '0.15rem' }}>
                          +{task.coins} 🪙
                        </div>
                        {alreadyPending && (
                          <div style={{ fontSize: '0.75rem', color: '#0369a1', fontWeight: 600, marginTop: '0.2rem' }}>⏳ Aștept aprobare...</div>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={alreadyPending}
                        onClick={() => onSubmitTask(task, wallet.id)}
                        className={`kid-task-btn ${alreadyPending ? 'disabled' : ''}`}
                        style={{
                          minHeight: 'auto',
                          padding: '0.55rem 0.95rem',
                          border: 'none',
                          fontWeight: 800,
                          fontSize: '0.85rem',
                          cursor: alreadyPending ? 'not-allowed' : 'pointer',
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                        }}
                      >
                        {alreadyPending ? '⏳' : '✅ Am făcut!'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {kidViewTab === 'shop' && (
          <div className="kid-rewards-section">
            <h2 className="kid-play-section-title">🎁 Magazin de recompense</h2>
            <div className="kid-rewards-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(145px, 1fr))', gap: '0.75rem' }}>
              {kidRewards.map((r) => {
                const cost = Number(r.cost || 0)
                const canAfford = balance >= cost
                const pct = cost > 0 ? Math.min(100, Math.round((balance / cost) * 100)) : 100
                const alreadyPending = requests.some((req) => req.reward_id === r.id && req.child_id === wallet.id && req.status === 'pending')

                return (
                  <div key={r.id} className={`kid-reward-card ${canAfford ? 'can-afford' : ''}`} style={{
                    background: canAfford ? 'linear-gradient(135deg, #f0fdf4, #dcfce7)' : '#fff',
                    padding: '1rem',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.45rem',
                  }}>
                    <div style={{ fontSize: '2.25rem' }}>{safeIcon(r.icon, '🎁')}</div>
                    <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#15231f' }}>{r.title}</div>
                    <div style={{ fontWeight: 900, fontSize: '0.95rem', color: '#7c3aed' }}>{cost} 🪙</div>
                    <div style={{ height: '6px', background: '#e5e7eb', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: canAfford ? '#16a34a' : '#f97316', borderRadius: '3px', transition: 'width 0.4s ease' }} />
                    </div>
                    {!canAfford && <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>−{cost - balance} 🪙</div>}
                    <button
                      type="button"
                      disabled={!canAfford || alreadyPending}
                      onClick={() => onRequestReward(r, wallet.id)}
                      className={`kid-reward-btn ${(!canAfford || alreadyPending) ? 'disabled' : ''}`}
                      style={{
                        minHeight: 'auto',
                        padding: '0.45rem 0.6rem',
                        border: 'none',
                        borderRadius: '10px',
                        fontWeight: 800,
                        fontSize: '0.78rem',
                        cursor: (!canAfford || alreadyPending) ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {alreadyPending ? '⏳ Trimis' : canAfford ? '🎁 Cere!' : 'Strânge 🪙'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {kidViewTab === 'chat' && (
          <>
            <div className="kid-chat-section">
              <h2 className="kid-play-section-title">💬 Chat familie</h2>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                {QUICK_MESSAGES.map((qm) => (
                  <button
                    key={qm.text}
                    type="button"
                    onClick={() => onSendMessage(qm.text, wallet.member_name, 'child')}
                    className="kid-chat-quick-btn"
                  >
                    {qm.label}
                  </button>
                ))}
              </div>
              <div className="kid-chat-messages-container">
                {messages.slice(-12).map((msg) => {
                  const isSystem = msg.message_type !== 'normal'
                  const isKid = msg.sender_name === wallet.member_name
                  if (isSystem) {
                    return (
                      <div key={msg.id} style={{ fontSize: '0.75rem', color: '#0369a1', textAlign: 'center', padding: '0.25rem 0' }}>
                        {msg.message_text}
                      </div>
                    )
                  }
                  return (
                    <div key={msg.id} className={`kid-chat-msg-row ${isKid ? 'is-kid-sender' : 'is-other-sender'}`} style={{ display: 'flex', flexDirection: 'column', alignItems: isKid ? 'flex-end' : 'flex-start' }}>
                      <div style={{ fontSize: '0.65rem', color: '#9ca3af', marginBottom: '0.1rem', padding: '0 0.4rem' }}>{msg.sender_name}</div>
                      <div className="kid-chat-bubble" style={{
                        maxWidth: '85%',
                        background: isKid ? 'linear-gradient(135deg, #f97316, #ea580c)' : '#fff',
                        color: isKid ? '#fff' : '#15231f',
                        padding: '0.55rem 0.8rem',
                        borderRadius: '12px',
                        fontSize: '0.85rem',
                        border: isKid ? 'none' : '1px solid #e5e7eb',
                        wordBreak: 'break-word',
                      }}>
                        {msg.message_text}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="family-chat-input-wrapper" style={{ marginTop: '0.75rem' }}>
                <input
                  value={kidChatText}
                  onChange={(e) => setKidChatText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onSendMessage(kidChatText, wallet.member_name, 'child') } }}
                  placeholder="Scrie un mesaj..."
                  disabled={!schemaReady.chat}
                  className="kid-chat-input"
                />
                <button
                  type="button"
                  onClick={() => onSendMessage(kidChatText, wallet.member_name, 'child')}
                  disabled={!kidChatText.trim() || !schemaReady.chat}
                  className="kid-chat-send-btn"
                >
                  ➤
                </button>
              </div>
            </div>

            {kidRequests.length > 0 && (
              <div className="kid-requests-section" style={{ marginTop: '1.25rem' }}>
                <h2 className="kid-play-section-title">📬 Cererile mele</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {kidRequests.map((r) => {
                    const task = tasks.find((t) => t.id === r.task_id)
                    const reward = rewards.find((rw) => rw.id === r.reward_id)
                    const statusLabel = r.status === 'approved' ? '✅ Aprobat' : r.status === 'rejected' ? '❌ Respins' : '⏳ În așteptare'
                    const statusColor = r.status === 'approved' ? '#15803d' : r.status === 'rejected' ? '#991b1b' : '#b45309'
                    return (
                      <div key={r.id} className={`kid-request-card kid-request-${r.status}`} style={{
                        background: '#fff',
                        borderRadius: '12px',
                        border: '1px solid #e5e7eb',
                        padding: '0.75rem 1rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                      }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                            {task ? `${safeIcon(task.icon)} ${task.title}` : (reward ? `${safeIcon(reward.icon)} ${reward.title}` : '—')}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{formatDate(r.created_at)}</div>
                        </div>
                        <div style={{ fontWeight: 800, fontSize: '0.82rem', color: statusColor }}>{statusLabel}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <nav className="kid-play-nav" aria-label="Navigare copil">
        {navItems.map((item) => (
          <div key={item.id} className="kid-play-nav-btn-wrap">
            <button
              type="button"
              className={`kid-play-nav-btn ${kidViewTab === item.id ? 'active' : ''}`}
              onClick={() => setKidViewTab(item.id)}
              aria-current={kidViewTab === item.id ? 'page' : undefined}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </button>
            {item.badge ? <span className="kid-play-nav-badge">{item.badge}</span> : null}
          </div>
        ))}
      </nav>

      {kidExitConfirm && (
        <div className="kid-exit-confirm-overlay">
          <div className="kid-exit-confirm-box">
            <h3>🔐 Ieșire Mod Copil</h3>
            <p>Ești sigur că vrei să ieși?</p>
            <div className="kid-exit-confirm-btns">
              <button type="button" onClick={() => setKidExitConfirm(false)} style={{ background: '#f3f4f6', color: '#374151' }}>
                Rămân
              </button>
              <button type="button" onClick={onExitParent} style={{ background: '#17463c', color: '#fff' }}>
                Ieșire
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
