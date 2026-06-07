import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'

// ─── Constants ───────────────────────────────────────────────────────────────

const CHILDREN = ['Veronica', 'Robert']

const CHILD_AVATARS = { Veronica: '🌸', Robert: '🚀' }
const childAvatar = (name = '') => {
  const n = String(name).trim()
  if (n.toLowerCase().includes('veronica')) return '🌸'
  if (n.toLowerCase().includes('robert')) return '🚀'
  return '⭐'
}

const DEFAULT_COIN_VALUE = 0.10

const TASK_TYPES = [
  { value: 'obligatie', label: 'Obligație normală', min: 1, max: 3, color: '#6b7280' },
  { value: 'obicei', label: 'Obicei bun', min: 2, max: 6, color: '#7c3aed' },
  { value: 'ajutor', label: 'Ajutor în casă', min: 3, max: 10, color: '#2563eb' },
  { value: 'extra', label: 'Extra / Special', min: 10, max: 25, color: '#ea580c' },
]

const TASK_CATEGORIES = ['casă', 'școală', 'igienă', 'comportament', 'sport', 'ajutor familie', 'special']

const REWARD_CATEGORIES = ['desert', 'timp ecran', 'familie', 'experiență', 'bani de buzunar', 'economisire', 'mâncare', 'special']

const EMOJI_ICONS = {
  'Curățenie / Casă': ['🧹', '🧽', '🪣', '🧺', '🛏️', '🧸', '🗑️', '🍽️', '🧼', '🧴', '🧦', '👕', '🏠'],
  'Școală': ['📚', '📖', '✏️', '📝', '🎒', '🧮', '🧠', '🏫'],
  'Igienă': ['🪥', '🚿', '🧼', '🛁', '💧', '✨'],
  'Sport / Mișcare': ['⚽', '🚲', '🏃', '🤸', '🏊', '🛴', '🏀'],
  'Ajutor familie': ['🤝', '❤️', '👨‍👩‍👧‍👦', '🏠', '⭐', '🙌'],
  'Recompense': ['🍦', '🍰', '🍕', '🍔', '🎮', '🎬', '📺', '🎁', '💶', '🎲', '🧩', '🚗'],
  'Motivație': ['⭐', '🌟', '🚀', '🌈', '🏆', '✅', '🔥', '💎', '🪙', '💶', '🐷', '💰'],
}

const DEFAULT_TASKS_DEMO = [
  { title: 'Strânge jucăriile', icon: '🧸', task_type: 'obligatie', category: 'casă', coins: 2, frequency: 'daily', requires_approval: false },
  { title: 'Citește 15 minute', icon: '📚', task_type: 'obicei', category: 'școală', coins: 3, frequency: 'daily', requires_approval: false },
  { title: 'Ajută la curățenie', icon: '🧹', task_type: 'ajutor', category: 'casă', coins: 5, frequency: 'flexible', requires_approval: true },
  { title: 'Spală dinții seara', icon: '🪥', task_type: 'obligatie', category: 'igienă', coins: 1, frequency: 'daily', requires_approval: false },
]

const DEFAULT_REWARDS_DEMO = [
  { title: 'Înghețată', icon: '🍦', cost_coins: 20, category: 'desert', is_screen_time: false, is_pocket_money: false },
  { title: '30 minute tabletă', icon: '🎮', cost_coins: 30, category: 'timp ecran', is_screen_time: true, is_pocket_money: false },
  { title: 'Film în familie', icon: '🎬', cost_coins: 25, category: 'familie', is_screen_time: false, is_pocket_money: false },
  { title: '5 EUR bani de buzunar', icon: '💶', cost_coins: 50, category: 'bani de buzunar', is_screen_time: false, is_pocket_money: true },
]

const QUICK_MESSAGES = [
  { label: '✅ Am terminat!', text: 'Am terminat sarcina!' },
  { label: '🆘 Am nevoie de ajutor', text: 'Am nevoie de ajutor, poate cineva să vină?' },
  { label: '🙏 Te rog aprobă', text: 'Te rog aprobă cererea mea!' },
  { label: '🏠 Sunt acasă', text: 'Sunt acasă!' },
  { label: '📞 Sună-mă', text: 'Te rog sună-mă!' },
  { label: '🎁 Pot cere recompensa?', text: 'Pot cere o recompensă?' },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtEur(coins, coinValue = DEFAULT_COIN_VALUE) {
  return (coins * coinValue).toFixed(2) + ' EUR'
}

function safeIcon(icon, fallback = '⭐') {
  const s = String(icon || '').trim()
  if (!s || s.includes('?') || s.includes('??') || s === 'undefined') return fallback
  return s
}

function taskTypeInfo(type) {
  return TASK_TYPES.find((t) => t.value === type) || TASK_TYPES[0]
}

function formatDate(isoStr) {
  if (!isoStr) return ''
  try {
    return new Date(isoStr).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return isoStr
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EmojiPicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [activeCategory, setActiveCategory] = useState(Object.keys(EMOJI_ICONS)[0])

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          minHeight: 'auto',
          background: '#f3f4f6',
          color: '#15231f',
          border: '1.5px solid #d1d5db',
          borderRadius: '10px',
          padding: '0.5rem 1rem',
          fontSize: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          cursor: 'pointer',
        }}
      >
        {safeIcon(value)} <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>schimbă</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          zIndex: 200,
          background: '#fff',
          border: '1px solid #d1d5db',
          borderRadius: '14px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          padding: '0.75rem',
          width: '320px',
          maxHeight: '320px',
          overflow: 'auto',
        }}>
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            {Object.keys(EMOJI_ICONS).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                style={{
                  minHeight: 'auto',
                  padding: '0.2rem 0.55rem',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  borderRadius: '20px',
                  background: activeCategory === cat ? '#17463c' : '#f3f4f6',
                  color: activeCategory === cat ? '#fff' : '#374151',
                  border: 'none',
                }}
              >
                {cat}
              </button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.3rem' }}>
            {EMOJI_ICONS[activeCategory].map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => { onChange(emoji); setOpen(false) }}
                style={{
                  minHeight: 'auto',
                  background: value === emoji ? '#e0f2fe' : 'transparent',
                  border: value === emoji ? '2px solid #0ea5e9' : '2px solid transparent',
                  borderRadius: '8px',
                  fontSize: '1.4rem',
                  padding: '0.2rem',
                  cursor: 'pointer',
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function WalletCard({ wallet, coinValue, isSelected, onClick }) {
  const name = wallet.member_name
  const balance = Number(wallet.balance || 0)
  const eur = fmtEur(balance, coinValue)
  const avatar = childAvatar(name)

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        minHeight: 'auto',
        flex: 1,
        background: isSelected
          ? 'linear-gradient(135deg, #17463c 0%, #2d7a5e 100%)'
          : '#fff',
        color: isSelected ? '#fff' : '#15231f',
        border: isSelected ? 'none' : '2px solid #dde4da',
        borderRadius: '16px',
        padding: '1.25rem',
        textAlign: 'left',
        cursor: 'pointer',
        boxShadow: isSelected ? '0 8px 24px rgba(23,70,60,0.2)' : '0 2px 8px rgba(0,0,0,0.04)',
        transition: 'all 0.2s ease',
      }}
    >
      <div style={{ fontSize: '2rem', marginBottom: '0.4rem' }}>{avatar}</div>
      <div style={{ fontWeight: 900, fontSize: '1.05rem', marginBottom: '0.2rem' }}>{name}</div>
      <div style={{ fontWeight: 900, fontSize: '1.6rem', lineHeight: 1 }}>
        {balance} <span style={{ fontSize: '0.85rem', fontWeight: 600, opacity: 0.75 }}>🪙</span>
      </div>
      <div style={{ fontSize: '0.78rem', opacity: 0.7, marginTop: '0.2rem' }}>≈ {eur}</div>
    </button>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function KidsZone({ user, familyOwnerId, isChildAccount = false, childAccountName = null, onSignOut = null }) {
  // For child accounts, resolve family owner ID independently to ensure chat goes to correct place
  const [resolvedOwnerId, setResolvedOwnerId] = useState(familyOwnerId || null)
  const dbUserId = resolvedOwnerId || familyOwnerId || user?.id
  // Tab navigation
  const [kidsTab, setKidsTab] = useState('admin')
  // Auto-activate kid mode for child accounts; parents start at false
  const [kidModeActive, setKidModeActive] = useState(isChildAccount)
  // Set child name from account metadata if available
  const [kidModeChild, setKidModeChild] = useState(() => {
    if (childAccountName) {
      // Match with known children names (case-insensitive prefix match)
      const match = CHILDREN.find((n) => n.toLowerCase().startsWith(childAccountName.toLowerCase().slice(0, 3)))
      return match || CHILDREN[0]
    }
    return CHILDREN[0]
  })

  // Data
  const [wallets, setWallets] = useState([])
  const [tasks, setTasks] = useState([])
  const [rewards, setRewards] = useState([])
  const [requests, setRequests] = useState([])
  const [transactions, setTransactions] = useState([])
  const [messages, setMessages] = useState([])
  const [coinValue, setCoinValue] = useState(DEFAULT_COIN_VALUE)
  const [showChildEur, setShowChildEur] = useState(false)
  const [familySettingsId, setFamilySettingsId] = useState(null)

  // UI state
  const [selectedWalletId, setSelectedWalletId] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [schemaReady, setSchemaReady] = useState({ wallets: true, tasks: true, chat: true, settings: true })

  // Admin state
  const [adminReason, setAdminReason] = useState('')
  const [coinValueDraft, setCoinValueDraft] = useState(DEFAULT_COIN_VALUE)
  const [showChildEurDraft, setShowChildEurDraft] = useState(false)
  const [settingsSaving, setSettingsSaving] = useState(false)

  // Task form
  const [taskForm, setTaskForm] = useState(null) // null = closed, {} = new, {id} = edit
  const emptyTask = { title: '', description: '', child_target: 'Ambii', task_type: 'ajutor', category: 'casă', coins: 5, icon: '⭐', frequency: 'flexible', requires_approval: true, active: true }

  // Reward form
  const [rewardForm, setRewardForm] = useState(null)
  const emptyReward = { title: '', description: '', child_target: 'Ambii', cost_coins: 20, icon: '🎁', category: 'special', is_screen_time: false, is_pocket_money: false, is_savings_reward: false, active: true }

  // Chat
  const [chatText, setChatText] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const chatEndRef = useRef(null)
  const senderName = user?.email?.toLowerCase().includes('doina') ? 'Doina' : 'Victor'
  const senderRole = 'parent'

  // Kid Mode
  const [kidChatText, setKidChatText] = useState('')
  const [kidExitConfirm, setKidExitConfirm] = useState(false)

  // For child accounts: resolve family owner ID from kb_family_members so
  // messages and wallet data go under the parent's user_id (not the child's own id)
  useEffect(() => {
    if (!isChildAccount || !user?.email) return
    // If we already have a valid family owner id from App.jsx, use it
    if (familyOwnerId && familyOwnerId !== user?.id) {
      setResolvedOwnerId(familyOwnerId)
      return
    }
    // Otherwise look it up directly
    supabase
      .from('kb_family_members')
      .select('family_owner_user_id')
      .eq('email', user.email)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.family_owner_user_id) {
          setResolvedOwnerId(data.family_owner_user_id)
        } else {
          // Fallback: use familyOwnerId or user.id
          setResolvedOwnerId(familyOwnerId || user.id)
        }
      })
      .catch(() => setResolvedOwnerId(familyOwnerId || user.id))
  }, [isChildAccount, user, familyOwnerId])

  // Also update resolvedOwnerId when familyOwnerId prop changes
  useEffect(() => {
    if (familyOwnerId) setResolvedOwnerId(familyOwnerId)
  }, [familyOwnerId])

  const showNotice = useCallback((msg, ms = 3000) => {
    setNotice(msg)
    setTimeout(() => setNotice(''), ms)
  }, [])

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!user || !dbUserId) return
    setLoading(true)

    const [walletRes, taskRes, rewardRes, requestRes, txRes, msgRes, settingsRes] = await Promise.all([
      supabase.from('family_wallets').select('*').eq('user_id', dbUserId).order('member_name', { ascending: true }),
      supabase.from('kb_kid_tasks').select('*').eq('user_id', dbUserId).order('created_at', { ascending: true }),
      supabase.from('family_rewards_shop').select('*').eq('user_id', dbUserId).order('cost', { ascending: true }),
      supabase.from('kb_kid_requests').select('*').eq('user_id', dbUserId).order('created_at', { ascending: false }),
      supabase.from('family_transactions').select('*, family_wallets(member_name)').eq('user_id', dbUserId).order('created_at', { ascending: false }).limit(50),
      supabase.from('kb_family_messages').select('*').eq('user_id', dbUserId).order('created_at', { ascending: true }).limit(100),
      supabase.from('kb_family_settings').select('*').eq('user_id', dbUserId).maybeSingle(),
    ])

    const ready = {
      wallets: !walletRes.error,
      tasks: !taskRes.error,
      chat: !msgRes.error,
      settings: !settingsRes.error,
    }
    setSchemaReady(ready)

    // Wallets (family_wallets always required)
    let nextWallets = walletRes.data || []
    if (ready.wallets && nextWallets.length === 0) {
      // Auto-create Veronica & Robert wallets
      const { data: created } = await supabase
        .from('family_wallets')
        .upsert(
          CHILDREN.map((name) => ({ user_id: dbUserId, member_name: name, balance: 0 })),
          { onConflict: 'user_id,member_name' }
        )
        .select('*')
      nextWallets = created || []
    }
    // Ensure both children exist
    if (ready.wallets) {
      const existingNames = new Set(nextWallets.map((w) => String(w.member_name || '').trim().toLowerCase()))
      const missing = CHILDREN.filter((n) => !existingNames.has(n.toLowerCase()))
      if (missing.length) {
        const { data: added } = await supabase
          .from('family_wallets')
          .upsert(missing.map((name) => ({ user_id: dbUserId, member_name: name, balance: 0 })), { onConflict: 'user_id,member_name' })
          .select('*')
        nextWallets = [...nextWallets, ...(added || [])]
      }
    }
    setWallets(nextWallets)
    if (nextWallets.length && !selectedWalletId) {
      setSelectedWalletId(nextWallets[0].id)
    }

    // Tasks (kb_kid_tasks — may not exist)
    if (ready.tasks) {
      let nextTasks = taskRes.data || []
      if (nextTasks.length === 0) {
        // Insert demo tasks
        const { data: inserted } = await supabase
          .from('kb_kid_tasks')
          .insert(DEFAULT_TASKS_DEMO.map((task) => ({ ...task, user_id: dbUserId, child_id: null })))
          .select('*')
        nextTasks = inserted || []
      }
      setTasks(nextTasks)
    } else {
      setTasks([])
    }

    // Rewards
    let nextRewards = rewardRes.data || []
    if (nextRewards.length === 0) {
      const { data: inserted } = await supabase
        .from('family_rewards_shop')
        .insert(DEFAULT_REWARDS_DEMO.map((r) => ({
          title: r.title,
          cost: r.cost_coins,
          icon: r.icon,
          is_available: true,
          user_id: dbUserId,
        })))
        .select('*')
      nextRewards = inserted || []
    }
    setRewards(nextRewards)

    // Requests (kb_kid_requests — may not exist)
    if (ready.tasks) {
      setRequests(requestRes.data || [])
    } else {
      setRequests([])
    }

    // Transactions
    setTransactions(txRes.data || [])

    // Chat messages
    if (ready.chat) {
      setMessages(msgRes.data || [])
    } else {
      setMessages([])
    }

    // Family settings
    if (ready.settings && settingsRes.data) {
      const s = settingsRes.data
      setCoinValue(Number(s.coin_value_eur || DEFAULT_COIN_VALUE))
      setCoinValueDraft(Number(s.coin_value_eur || DEFAULT_COIN_VALUE))
      setShowChildEur(Boolean(s.show_child_eur))
      setShowChildEurDraft(Boolean(s.show_child_eur))
      setFamilySettingsId(s.id)
    } else if (ready.settings && !settingsRes.data) {
      // Create default settings
      const { data: created } = await supabase
        .from('kb_family_settings')
        .insert({ user_id: dbUserId, coin_value_eur: DEFAULT_COIN_VALUE, show_child_eur: false })
        .select('*')
        .single()
      if (created) {
        setCoinValue(DEFAULT_COIN_VALUE)
        setCoinValueDraft(DEFAULT_COIN_VALUE)
        setFamilySettingsId(created.id)
      }
    }

    setLoading(false)
  }, [user, dbUserId, selectedWalletId])

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, dbUserId])

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  // ── Derived state ─────────────────────────────────────────────────────────

  const selectedWallet = useMemo(
    () => wallets.find((w) => w.id === selectedWalletId) || wallets[0],
    [wallets, selectedWalletId]
  )

  const kidWallet = useMemo(
    () => wallets.find((w) => w.member_name === kidModeChild),
    [wallets, kidModeChild]
  )

  const pendingRequests = useMemo(() => requests.filter((r) => r.status === 'pending'), [requests])
  const pendingCount = pendingRequests.length

  // Tasks visible for a child (null child_id = all children)
  const tasksForWallet = useCallback((walletId) => {
    const wallet = wallets.find((w) => w.id === walletId)
    if (!wallet) return tasks.filter((t) => t.active)
    return tasks.filter((t) => t.active && (t.child_id === null || t.child_id === walletId))
  }, [tasks, wallets])

  // ── Admin actions ─────────────────────────────────────────────────────────

  const addCoins = async (amount) => {
    if (!selectedWallet) return
    const balance = Number(selectedWallet.balance || 0) + amount
    const description = adminReason.trim() || `+${amount} monede (acord manual)`

    const { error: upErr } = await supabase
      .from('family_wallets')
      .update({ balance })
      .eq('id', selectedWallet.id)
      .eq('user_id', dbUserId)
    if (upErr) { showNotice('Eroare: ' + upErr.message); return }

    await supabase.from('family_transactions').insert({
      user_id: dbUserId,
      wallet_id: selectedWallet.id,
      amount,
      description,
    })

    // Chat system message
    if (schemaReady.chat) {
      await supabase.from('kb_family_messages').insert({
        user_id: dbUserId,
        sender_name: senderName,
        sender_role: 'system',
        message_text: `${senderName} a acordat +${amount} monede lui ${selectedWallet.member_name}. Motiv: ${description}`,
        message_type: 'system',
      })
    }

    showNotice(`+${amount} monede adăugate lui ${selectedWallet.member_name} ✅`)
    await loadData()
  }

  const saveSettings = async () => {
    if (!user) return
    setSettingsSaving(true)
    const val = Number(coinValueDraft)
    if (isNaN(val) || val <= 0) { showNotice('Valoare invalidă!'); setSettingsSaving(false); return }

    const payload = { coin_value_eur: val, show_child_eur: showChildEurDraft }
    if (familySettingsId) {
      await supabase.from('kb_family_settings').update(payload).eq('id', familySettingsId).eq('user_id', dbUserId)
    } else {
      await supabase.from('kb_family_settings').insert({ ...payload, user_id: dbUserId })
    }
    setCoinValue(val)
    setShowChildEur(showChildEurDraft)
    showNotice('Setări salvate ✅')
    setSettingsSaving(false)
  }

  // ── Task actions ──────────────────────────────────────────────────────────

  const saveTask = async (formData) => {
    if (!formData.title.trim()) { showNotice('Titlul este obligatoriu!'); return }
    const coins = Math.max(0, Number(formData.coins || 1))

    // Determine child_id
    let childId = null
    if (formData.child_target && formData.child_target !== 'Ambii') {
      const w = wallets.find((w) => w.member_name === formData.child_target)
      childId = w ? w.id : null
    }

    const payload = {
      title: formData.title.trim(),
      description: formData.description?.trim() || null,
      child_id: childId,
      task_type: formData.task_type,
      category: formData.category,
      coins,
      icon: safeIcon(formData.icon),
      frequency: formData.frequency,
      requires_approval: Boolean(formData.requires_approval),
      active: Boolean(formData.active),
    }

    if (formData.id) {
      const { error } = await supabase.from('kb_kid_tasks').update(payload).eq('id', formData.id).eq('user_id', dbUserId)
      if (error) { showNotice('Eroare: ' + error.message); return }
    } else {
      const { error } = await supabase.from('kb_kid_tasks').insert({ ...payload, user_id: dbUserId })
      if (error) { showNotice('Eroare: ' + error.message); return }
    }

    showNotice('Sarcină salvată ✅')
    setTaskForm(null)
    await loadData()
  }

  const deleteTask = async (task) => {
    const hasHistory = requests.some((r) => r.task_id === task.id)
    if (hasHistory) {
      if (!window.confirm('Această sarcină are istoric. Recomandat este să o dezactivezi. Vrei totuși să o ștergi?')) return
    } else {
      if (!window.confirm(`Ștergi sarcina "${task.title}"?`)) return
    }
    await supabase.from('kb_kid_tasks').delete().eq('id', task.id).eq('user_id', dbUserId)
    showNotice('Sarcină ștearsă')
    await loadData()
  }

  const toggleTaskActive = async (task) => {
    await supabase.from('kb_kid_tasks').update({ active: !task.active }).eq('id', task.id).eq('user_id', dbUserId)
    await loadData()
  }

  // ── Reward actions ────────────────────────────────────────────────────────

  const saveReward = async (formData) => {
    if (!formData.title.trim()) { showNotice('Titlul este obligatoriu!'); return }
    const cost = Math.max(1, Number(formData.cost_coins || 10))

    let childId = null
    if (formData.child_target && formData.child_target !== 'Ambii') {
      const w = wallets.find((w) => w.member_name === formData.child_target)
      childId = w ? w.id : null
    }

    const payload = {
      title: formData.title.trim(),
      cost,
      icon: safeIcon(formData.icon, '🎁'),
      is_available: Boolean(formData.active !== false),
      child_id: childId,
    }

    if (formData.id) {
      const { error } = await supabase.from('family_rewards_shop').update(payload).eq('id', formData.id).eq('user_id', dbUserId)
      if (error) { showNotice('Eroare: ' + error.message); return }
    } else {
      const { error } = await supabase.from('family_rewards_shop').insert({ ...payload, user_id: dbUserId })
      if (error) { showNotice('Eroare: ' + error.message); return }
    }

    showNotice('Recompensă salvată ✅')
    setRewardForm(null)
    await loadData()
  }

  const deleteReward = async (reward) => {
    if (!window.confirm(`Ștergi recompensa "${reward.title}"?`)) return
    await supabase.from('family_rewards_shop').update({ is_available: false }).eq('id', reward.id).eq('user_id', dbUserId)
    showNotice('Recompensă dezactivată')
    await loadData()
  }

  // ── Request actions ───────────────────────────────────────────────────────

  const childSubmitTaskRequest = async (task, walletId) => {
    if (!schemaReady.tasks) { showNotice('Funcție indisponibilă temporar.'); return }
    const wallet = wallets.find((w) => w.id === walletId)
    if (!wallet) return

    // Check if already pending
    const alreadyPending = requests.some((r) => r.task_id === task.id && r.child_id === walletId && r.status === 'pending')
    if (alreadyPending) { showNotice('Cerere deja trimisă! Așteptați aprobarea.'); return }

    if (!task.requires_approval) {
      // Auto-approve: add coins directly
      const balance = Number(wallet.balance || 0) + task.coins
      await supabase.from('family_wallets').update({ balance }).eq('id', walletId).eq('user_id', dbUserId)
      await supabase.from('family_transactions').insert({
        user_id: dbUserId,
        wallet_id: walletId,
        amount: task.coins,
        description: `${task.title} (auto-aprobat)`,
      })
      if (schemaReady.chat) {
        await supabase.from('kb_family_messages').insert({
          user_id: dbUserId,
          sender_name: 'Sistem',
          sender_role: 'system',
          message_text: `${wallet.member_name} a finalizat sarcina: ${task.title} (+${task.coins} monede) ✅`,
          message_type: 'system',
        })
      }
      showNotice(`+${task.coins} monede adăugate automat! ✅`)
      await loadData()
      return
    }

    const { error } = await supabase.from('kb_kid_requests').insert({
      user_id: dbUserId,
      child_id: walletId,
      request_type: 'task_completion',
      task_id: task.id,
      coins: task.coins,
      status: 'pending',
    })
    if (error) { showNotice('Eroare: ' + error.message); return }

    if (schemaReady.chat) {
      await supabase.from('kb_family_messages').insert({
        user_id: dbUserId,
        sender_name: 'Sistem',
        sender_role: 'system',
        message_text: `${wallet.member_name} a trimis spre aprobare: ${task.title} (+${task.coins} monede) 🙏`,
        message_type: 'task_request',
      })
    }
    showNotice('Cerere trimisă! Așteptați aprobarea. 🙏')
    await loadData()
  }

  const childRequestReward = async (reward, walletId) => {
    const wallet = wallets.find((w) => w.id === walletId)
    if (!wallet) return

    const balance = Number(wallet.balance || 0)
    const cost = Number(reward.cost || 0)
    if (balance < cost) { showNotice(`Îți mai trebuie ${cost - balance} monede!`); return }

    // Check already pending
    const alreadyPending = requests.some((r) => r.reward_id === reward.id && r.child_id === walletId && r.status === 'pending')
    if (alreadyPending) { showNotice('Cerere deja trimisă!'); return }

    if (schemaReady.tasks) {
      const { error } = await supabase.from('kb_kid_requests').insert({
        user_id: dbUserId,
        child_id: walletId,
        request_type: 'reward_redeem',
        reward_id: reward.id,
        coins: cost,
        status: 'pending',
      })
      if (error) { showNotice('Eroare: ' + error.message); return }
    }

    if (schemaReady.chat) {
      await supabase.from('kb_family_messages').insert({
        user_id: dbUserId,
        sender_name: 'Sistem',
        sender_role: 'system',
        message_text: `${wallet.member_name} a cerut recompensa: ${reward.title} (−${cost} monede) 🎁`,
        message_type: 'reward_request',
      })
    }
    showNotice('Cerere trimisă! 🎁')
    await loadData()
  }

  const approveRequest = async (req) => {
    const wallet = wallets.find((w) => w.id === req.child_id)
    if (!wallet) return

    if (req.request_type === 'task_completion') {
      const balance = Number(wallet.balance || 0) + req.coins
      await supabase.from('family_wallets').update({ balance }).eq('id', wallet.id).eq('user_id', dbUserId)
      await supabase.from('family_transactions').insert({
        user_id: dbUserId,
        wallet_id: wallet.id,
        amount: req.coins,
        description: `Sarcină aprobată (${req.coins} monede)`,
      })
      if (schemaReady.chat) {
        await supabase.from('kb_family_messages').insert({
          user_id: dbUserId,
          sender_name: senderName,
          sender_role: 'system',
          message_text: `${senderName} a aprobat cererea lui ${wallet.member_name} ✅ +${req.coins} monede adăugate!`,
          message_type: 'system',
        })
      }
    } else if (req.request_type === 'reward_redeem') {
      const balance = Number(wallet.balance || 0)
      if (balance < req.coins) { showNotice(`Nu suficiente monede pentru ${wallet.member_name}.`); return }
      await supabase.from('family_wallets').update({ balance: balance - req.coins }).eq('id', wallet.id).eq('user_id', dbUserId)
      await supabase.from('family_transactions').insert({
        user_id: dbUserId,
        wallet_id: wallet.id,
        amount: -req.coins,
        description: `Recompensă aprobată (${req.coins} monede)`,
      })
      if (schemaReady.chat) {
        await supabase.from('kb_family_messages').insert({
          user_id: dbUserId,
          sender_name: senderName,
          sender_role: 'system',
          message_text: `${senderName} a aprobat recompensa pentru ${wallet.member_name} 🎁 −${req.coins} monede scăzute.`,
          message_type: 'system',
        })
      }
    }

    if (schemaReady.tasks) {
      await supabase.from('kb_kid_requests').update({ status: 'approved', updated_at: new Date().toISOString() }).eq('id', req.id).eq('user_id', dbUserId)
    }
    showNotice(`Cererea lui ${wallet.member_name} a fost aprobată ✅`)
    await loadData()
  }

  const rejectRequest = async (req, note = '') => {
    const wallet = wallets.find((w) => w.id === req.child_id)
    if (schemaReady.tasks) {
      await supabase.from('kb_kid_requests').update({ status: 'rejected', note: note || null, updated_at: new Date().toISOString() }).eq('id', req.id).eq('user_id', dbUserId)
    }
    if (schemaReady.chat && wallet) {
      await supabase.from('kb_family_messages').insert({
        user_id: dbUserId,
        sender_name: senderName,
        sender_role: 'system',
        message_text: `${senderName} a respins cererea lui ${wallet?.member_name || 'copil'}. ${note ? 'Motiv: ' + note : ''}`,
        message_type: 'system',
      })
    }
    showNotice('Cerere respinsă.')
    await loadData()
  }

  // ── Chat actions ──────────────────────────────────────────────────────────

  const sendMessage = async (text, sender = senderName, role = senderRole) => {
    if (!schemaReady.chat || !text.trim()) return
    setChatSending(true)
    const { error } = await supabase.from('kb_family_messages').insert({
      user_id: dbUserId,
      sender_name: sender,
      sender_role: role,
      message_text: text.trim(),
      message_type: 'normal',
    })
    if (error) showNotice('Eroare chat: ' + error.message)
    else {
      setChatText('')
      setKidChatText('')
    }
    setChatSending(false)
    await loadData()
  }

  // ─── Render helpers ───────────────────────────────────────────────────────

  const renderNotice = () => notice ? (
    <div style={{
      position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)',
      background: 'linear-gradient(135deg, #17463c, #2d7a5e)',
      color: '#fff',
      padding: '0.75rem 1.5rem',
      borderRadius: '12px',
      fontWeight: 700,
      fontSize: '0.9rem',
      boxShadow: '0 4px 20px rgba(23,70,60,0.3)',
      zIndex: 9999,
      whiteSpace: 'nowrap',
    }}>
      {notice}
    </div>
  ) : null

  // ─── TAB: Administrare ────────────────────────────────────────────────────

  const renderAdmin = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header info */}
      <div style={{
        background: 'linear-gradient(135deg, #17463c 0%, #1e5945 100%)',
        borderRadius: '16px',
        padding: '1.25rem 1.5rem',
        color: '#fff',
      }}>
        <div style={{ fontWeight: 900, fontSize: '1rem', marginBottom: '0.25rem' }}>
          📐 Sistem tokeni: 10 monede = 1,00 EUR
        </div>
        <div style={{ fontSize: '0.82rem', opacity: 0.75 }}>
          1 monedă = {(coinValue).toFixed(2)} EUR · Valoare configurabilă mai jos.
        </div>
      </div>

      {/* Wallet cards */}
      <div>
        <div style={{ fontWeight: 800, fontSize: '1rem', marginBottom: '0.75rem', color: '#15231f' }}>
          🪙 Portofele copii
        </div>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {wallets.map((w) => (
            <WalletCard
              key={w.id}
              wallet={w}
              coinValue={coinValue}
              isSelected={selectedWalletId === w.id}
              onClick={() => setSelectedWalletId(w.id)}
            />
          ))}
        </div>
      </div>

      {/* Add coins */}
      {selectedWallet && (
        <div style={{
          background: '#fff',
          borderRadius: '16px',
          border: '1px solid #dde4da',
          padding: '1.25rem',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}>
          <div style={{ fontWeight: 800, marginBottom: '0.75rem', color: '#15231f' }}>
            Acordă monede → {childAvatar(selectedWallet.member_name)} {selectedWallet.member_name}
          </div>
          <label style={{ display: 'grid', gap: '0.35rem', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#63746e' }}>Motiv (opțional)</span>
            <input
              value={adminReason}
              onChange={(e) => setAdminReason(e.target.value)}
              placeholder="Ex: Ajutat la curățenie, teme făcute..."
              style={{ border: '1px solid #cdd8d2', borderRadius: '8px', padding: '0.6rem', fontSize: '0.9rem' }}
            />
          </label>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            {[1, 5, 10, 20].map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => addCoins(amt)}
                style={{
                  background: 'linear-gradient(135deg, #17463c, #2d7a5e)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '0.65rem 1.1rem',
                  fontWeight: 800,
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  minHeight: 'auto',
                }}
              >
                +{amt} 🪙
              </button>
            ))}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#63746e', marginTop: '0.5rem' }}>
            Balanță actuală: <strong>{selectedWallet.balance} monede</strong> ≈ {fmtEur(selectedWallet.balance, coinValue)}
          </div>
        </div>
      )}

      {/* Mod Copil button */}
      <div style={{
        background: 'linear-gradient(135deg, #fff7ed, #ffedd5)',
        borderRadius: '16px',
        border: '1px solid #fed7aa',
        padding: '1.25rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.75rem',
      }}>
        <div>
          <div style={{ fontWeight: 800, color: '#15231f' }}>🧒 Mod Copil</div>
          <div style={{ fontSize: '0.82rem', color: '#63746e', marginTop: '0.2rem' }}>
            Deschide interfața simplă pentru Veronica sau Robert.
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem' }}>
          {CHILDREN.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => { setKidModeChild(name); setKidModeActive(true) }}
              style={{
                background: '#f97316',
                color: '#fff',
                border: 'none',
                borderRadius: '10px',
                padding: '0.6rem 1.1rem',
                fontWeight: 800,
                fontSize: '0.9rem',
                minHeight: 'auto',
                cursor: 'pointer',
              }}
            >
              {childAvatar(name)} {name}
            </button>
          ))}
        </div>
      </div>

      {/* Settings */}
      {schemaReady.settings && (
        <div style={{
          background: '#fff',
          borderRadius: '16px',
          border: '1px solid #dde4da',
          padding: '1.25rem',
        }}>
          <div style={{ fontWeight: 800, marginBottom: '1rem', color: '#15231f' }}>⚙️ Setări tokeni</div>
          <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: '1fr 1fr' }}>
            <label style={{ display: 'grid', gap: '0.3rem' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#63746e' }}>Valoare 1 monedă (EUR)</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={coinValueDraft}
                onChange={(e) => setCoinValueDraft(e.target.value)}
                style={{ border: '1px solid #cdd8d2', borderRadius: '8px', padding: '0.6rem' }}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem', fontWeight: 600, color: '#374151', paddingTop: '1.5rem' }}>
              <input
                type="checkbox"
                checked={showChildEurDraft}
                onChange={(e) => setShowChildEurDraft(e.target.checked)}
                style={{ width: 'auto' }}
              />
              Arată EUR copilului
            </label>
          </div>
          <div style={{ fontSize: '0.78rem', color: '#63746e', marginTop: '0.5rem' }}>
            <strong>{Math.round(1 / Number(coinValueDraft || 0.1))} monede</strong> = 1,00 EUR
          </div>
          <button
            type="button"
            onClick={saveSettings}
            disabled={settingsSaving}
            style={{
              marginTop: '0.75rem',
              background: 'linear-gradient(135deg, #17463c, #2d7a5e)',
              color: '#fff',
              border: 'none',
              borderRadius: '10px',
              padding: '0.6rem 1.2rem',
              fontWeight: 800,
              fontSize: '0.88rem',
              cursor: 'pointer',
              minHeight: 'auto',
            }}
          >
            💾 Salvează setări
          </button>
        </div>
      )}
    </div>
  )

  // ─── TAB: Sarcini ─────────────────────────────────────────────────────────

  const renderTaskForm = (form, setForm) => {
    const typeInfo = taskTypeInfo(form.task_type)
    return (
      <div style={{
        background: '#fff',
        borderRadius: '16px',
        border: '1px solid #dde4da',
        padding: '1.5rem',
        boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
        marginBottom: '1.5rem',
      }}>
        <div style={{ fontWeight: 900, fontSize: '1.05rem', marginBottom: '1rem', color: '#15231f' }}>
          {form.id ? '✏️ Editează sarcina' : '➕ Sarcină nouă'}
        </div>
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          <label style={{ display: 'grid', gap: '0.3rem' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#63746e' }}>Pictogramă</span>
            <EmojiPicker value={form.icon || '⭐'} onChange={(v) => setForm({ ...form, icon: v })} />
          </label>
          <label style={{ display: 'grid', gap: '0.3rem' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#63746e' }}>Titlu *</span>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex: Strânge jucăriile" />
          </label>
          <label style={{ display: 'grid', gap: '0.3rem' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#63746e' }}>Descriere (opțional)</span>
            <input value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Detalii..." />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <label style={{ display: 'grid', gap: '0.3rem' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#63746e' }}>Copil</span>
              <select value={form.child_target || 'Ambii'} onChange={(e) => setForm({ ...form, child_target: e.target.value })}>
                <option value="Ambii">Ambii</option>
                {CHILDREN.map((n) => <option key={n} value={n}>{childAvatar(n)} {n}</option>)}
              </select>
            </label>
            <label style={{ display: 'grid', gap: '0.3rem' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#63746e' }}>Tip sarcină</span>
              <select
                value={form.task_type}
                onChange={(e) => {
                  const info = taskTypeInfo(e.target.value)
                  setForm({ ...form, task_type: e.target.value, coins: Math.round((info.min + info.max) / 2) })
                }}
              >
                {TASK_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label} ({t.min}–{t.max} 🪙)</option>)}
              </select>
            </label>
          </div>
          <div style={{
            background: '#f3f4f6',
            borderRadius: '8px',
            padding: '0.5rem 0.75rem',
            fontSize: '0.8rem',
            color: '#6b7280',
          }}>
            💡 Interval recomandat: <strong>{typeInfo.min}–{typeInfo.max} monede</strong>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <label style={{ display: 'grid', gap: '0.3rem' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#63746e' }}>Categorie</span>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {TASK_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label style={{ display: 'grid', gap: '0.3rem' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#63746e' }}>Frecvență</span>
              <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
                <option value="once">O singură dată</option>
                <option value="daily">Zilnic</option>
                <option value="weekly">Săptămânal</option>
                <option value="flexible">Flexibil</option>
              </select>
            </label>
          </div>
          <label style={{ display: 'grid', gap: '0.3rem' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#63746e' }}>
              Monede: <strong>{form.coins}</strong> ≈ {fmtEur(Number(form.coins || 0), coinValue)}
            </span>
            <input
              type="number"
              min="0"
              max="100"
              value={form.coins}
              onChange={(e) => setForm({ ...form, coins: Number(e.target.value || 0) })}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem', fontWeight: 600, color: '#374151' }}>
            <input
              type="checkbox"
              checked={form.requires_approval}
              onChange={(e) => setForm({ ...form, requires_approval: e.target.checked })}
              style={{ width: 'auto' }}
            />
            Necesită aprobare părinte
          </label>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => saveTask(form)}
            style={{ background: 'linear-gradient(135deg, #17463c, #2d7a5e)', color: '#fff', border: 'none', borderRadius: '10px', padding: '0.65rem 1.2rem', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer', minHeight: 'auto' }}
          >
            💾 Salvează sarcina
          </button>
          <button
            type="button"
            onClick={() => setTaskForm(null)}
            style={{ background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '10px', padding: '0.65rem 1rem', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', minHeight: 'auto' }}
          >
            Anulează
          </button>
        </div>
      </div>
    )
  }

  const renderTasks = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ fontWeight: 900, fontSize: '1.1rem', color: '#15231f' }}>📋 Sarcini copii</div>
        <button
          type="button"
          onClick={() => setTaskForm({ ...emptyTask })}
          style={{ background: 'linear-gradient(135deg, #17463c, #2d7a5e)', color: '#fff', border: 'none', borderRadius: '10px', padding: '0.6rem 1.1rem', fontWeight: 800, fontSize: '0.88rem', cursor: 'pointer', minHeight: 'auto' }}
        >
          ➕ Sarcină nouă
        </button>
      </div>

      {taskForm && renderTaskForm(taskForm, setTaskForm)}

      {!schemaReady.tasks && (
        <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '12px', padding: '1rem', color: '#92400e', fontSize: '0.88rem', marginBottom: '1rem' }}>
          ⚠️ Tabelul kb_kid_tasks nu există. Rulați scriptul <strong>KB_MIGRATION_KIDS_TASKS.sql</strong> în Supabase SQL Editor.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {tasks.length === 0 && <div style={{ color: '#9ca3af', textAlign: 'center', padding: '2rem', fontSize: '0.9rem' }}>Nu există sarcini. Adaugă prima sarcină!</div>}
        {tasks.map((task) => {
          const info = taskTypeInfo(task.task_type)
          const childWallet = wallets.find((w) => w.id === task.child_id)
          return (
            <div
              key={task.id}
              style={{
                background: task.active ? '#fff' : '#f9fafb',
                borderRadius: '14px',
                border: `1px solid ${task.active ? '#dde4da' : '#e5e7eb'}`,
                padding: '1rem 1.25rem',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                opacity: task.active ? 1 : 0.6,
                boxShadow: task.active ? '0 2px 8px rgba(0,0,0,0.04)' : 'none',
              }}
            >
              <div style={{ fontSize: '1.8rem', flexShrink: 0 }}>{safeIcon(task.icon)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, color: '#15231f', fontSize: '0.95rem' }}>{task.title}</div>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                  <span style={{ background: info.color + '22', color: info.color, fontSize: '0.72rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '20px' }}>{info.label}</span>
                  <span style={{ background: '#f3f4f6', color: '#6b7280', fontSize: '0.72rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '20px' }}>{task.category}</span>
                  <span style={{ background: '#fef3c7', color: '#92400e', fontSize: '0.72rem', fontWeight: 800, padding: '0.15rem 0.5rem', borderRadius: '20px' }}>
                    {task.coins} 🪙 ≈ {fmtEur(task.coins, coinValue)}
                  </span>
                  <span style={{ background: '#f0fdf4', color: '#15803d', fontSize: '0.72rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '20px' }}>
                    {childAvatar(childWallet?.member_name || 'all')} {childWallet?.member_name || 'Ambii'}
                  </span>
                  {task.requires_approval && (
                    <span style={{ background: '#fef9c3', color: '#713f12', fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '20px' }}>necesită aprobare</span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => toggleTaskActive(task)}
                  style={{ minHeight: 'auto', padding: '0.35rem 0.65rem', fontSize: '0.78rem', fontWeight: 700, borderRadius: '8px', background: task.active ? '#fee2e2' : '#dcfce7', color: task.active ? '#991b1b' : '#15803d', border: 'none', cursor: 'pointer' }}
                >
                  {task.active ? 'Dezactivează' : 'Activează'}
                </button>
                <button
                  type="button"
                  onClick={() => setTaskForm({ ...emptyTask, ...task, child_target: wallets.find((w) => w.id === task.child_id)?.member_name || 'Ambii' })}
                  style={{ minHeight: 'auto', padding: '0.35rem 0.65rem', fontSize: '0.78rem', fontWeight: 700, borderRadius: '8px', background: '#e0f2fe', color: '#0369a1', border: 'none', cursor: 'pointer' }}
                >
                  ✏️
                </button>
                <button
                  type="button"
                  onClick={() => deleteTask(task)}
                  style={{ minHeight: 'auto', padding: '0.35rem 0.65rem', fontSize: '0.78rem', fontWeight: 700, borderRadius: '8px', background: '#fee2e2', color: '#991b1b', border: 'none', cursor: 'pointer' }}
                >
                  🗑️
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  // ─── TAB: Recompense ──────────────────────────────────────────────────────

  const renderRewardForm = (form, setForm) => (
    <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #dde4da', padding: '1.5rem', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', marginBottom: '1.5rem' }}>
      <div style={{ fontWeight: 900, fontSize: '1.05rem', marginBottom: '1rem', color: '#15231f' }}>
        {form.id ? '✏️ Editează recompensa' : '➕ Recompensă nouă'}
      </div>
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        <label style={{ display: 'grid', gap: '0.3rem' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#63746e' }}>Pictogramă</span>
          <EmojiPicker value={form.icon || '🎁'} onChange={(v) => setForm({ ...form, icon: v })} />
        </label>
        <label style={{ display: 'grid', gap: '0.3rem' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#63746e' }}>Titlu *</span>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex: Înghețată" />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <label style={{ display: 'grid', gap: '0.3rem' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#63746e' }}>Copil</span>
            <select value={form.child_target || 'Ambii'} onChange={(e) => setForm({ ...form, child_target: e.target.value })}>
              <option value="Ambii">Ambii</option>
              {CHILDREN.map((n) => <option key={n} value={n}>{childAvatar(n)} {n}</option>)}
            </select>
          </label>
          <label style={{ display: 'grid', gap: '0.3rem' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#63746e' }}>Categorie</span>
            <select value={form.category || 'special'} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {REWARD_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>
        <label style={{ display: 'grid', gap: '0.3rem' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#63746e' }}>
            Cost: <strong>{form.cost_coins} monede</strong> ≈ {fmtEur(Number(form.cost_coins || 0), coinValue)}
          </span>
          <input type="number" min="1" value={form.cost_coins} onChange={(e) => setForm({ ...form, cost_coins: Number(e.target.value || 1) })} />
        </label>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>
            <input type="checkbox" checked={form.is_screen_time || false} onChange={(e) => setForm({ ...form, is_screen_time: e.target.checked })} style={{ width: 'auto' }} />
            Timp ecran
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>
            <input type="checkbox" checked={form.is_pocket_money || false} onChange={(e) => setForm({ ...form, is_pocket_money: e.target.checked })} style={{ width: 'auto' }} />
            Bani de buzunar
          </label>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => saveReward(form)}
          style={{ background: 'linear-gradient(135deg, #17463c, #2d7a5e)', color: '#fff', border: 'none', borderRadius: '10px', padding: '0.65rem 1.2rem', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer', minHeight: 'auto' }}
        >
          💾 Salvează recompensa
        </button>
        <button
          type="button"
          onClick={() => setRewardForm(null)}
          style={{ background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '10px', padding: '0.65rem 1rem', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', minHeight: 'auto' }}
        >
          Anulează
        </button>
      </div>
    </div>
  )

  const renderRewards = () => {
    const visible = rewards.filter((r) => r.is_available !== false)
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ fontWeight: 900, fontSize: '1.1rem', color: '#15231f' }}>🎁 Recompense</div>
          <button
            type="button"
            onClick={() => setRewardForm({ ...emptyReward })}
            style={{ background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)', color: '#fff', border: 'none', borderRadius: '10px', padding: '0.6rem 1.1rem', fontWeight: 800, fontSize: '0.88rem', cursor: 'pointer', minHeight: 'auto' }}
          >
            ➕ Recompensă nouă
          </button>
        </div>

        {rewardForm && renderRewardForm(rewardForm, setRewardForm)}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
          {visible.length === 0 && <div style={{ color: '#9ca3af', padding: '2rem', gridColumn: '1/-1', textAlign: 'center' }}>Nu există recompense active.</div>}
          {visible.map((r) => {
            const cost = Number(r.cost || 0)
            return (
              <div
                key={r.id}
                style={{
                  background: 'linear-gradient(135deg, #faf5ff, #ede9fe)',
                  borderRadius: '16px',
                  border: '1px solid #ddd6fe',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                  boxShadow: '0 2px 8px rgba(139,92,246,0.1)',
                }}
              >
                <div style={{ fontSize: '2.5rem', textAlign: 'center' }}>{safeIcon(r.icon, '🎁')}</div>
                <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#15231f', textAlign: 'center' }}>{r.title}</div>
                <div style={{ textAlign: 'center', color: '#5b21b6', fontWeight: 900, fontSize: '1.05rem' }}>
                  {cost} 🪙 ≈ {fmtEur(cost, coinValue)}
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => {
                      const childWallet = wallets.find((w) => w.id === r.child_id)
                      setRewardForm({ ...emptyReward, ...r, cost_coins: r.cost, active: r.is_available !== false, child_target: childWallet?.member_name || 'Ambii' })
                    }}
                    style={{ minHeight: 'auto', padding: '0.3rem 0.7rem', fontSize: '0.78rem', fontWeight: 700, borderRadius: '8px', background: '#e0f2fe', color: '#0369a1', border: 'none', cursor: 'pointer' }}
                  >
                    ✏️ Editează
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteReward(r)}
                    style={{ minHeight: 'auto', padding: '0.3rem 0.7rem', fontSize: '0.78rem', fontWeight: 700, borderRadius: '8px', background: '#fee2e2', color: '#991b1b', border: 'none', cursor: 'pointer' }}
                  >
                    Dezactivează
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ─── TAB: Cereri ─────────────────────────────────────────────────────────

  const renderRequests = () => {
    if (!schemaReady.tasks) {
      return (
        <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '12px', padding: '1rem', color: '#92400e', fontSize: '0.88rem' }}>
          ⚠️ Tabelul kb_kid_requests nu există. Rulați scriptul <strong>KB_MIGRATION_KIDS_TASKS.sql</strong> în Supabase SQL Editor.
        </div>
      )
    }

    const pending = requests.filter((r) => r.status === 'pending')
    const resolved = requests.filter((r) => r.status !== 'pending').slice(0, 20)

    const reqTypeLabel = (r) => {
      if (r.request_type === 'task_completion') return '✅ Sarcină finalizată'
      if (r.request_type === 'reward_redeem') return '🎁 Cerere recompensă'
      return r.request_type
    }

    const renderReqCard = (r, showActions = false) => {
      const wallet = wallets.find((w) => w.id === r.child_id)
      const task = tasks.find((t) => t.id === r.task_id)
      const reward = rewards.find((rw) => rw.id === r.reward_id)
      const isApproved = r.status === 'approved'

      return (
        <div key={r.id} style={{
          background: showActions ? '#fffbeb' : (isApproved ? '#f0fdf4' : '#fef2f2'),
          borderRadius: '14px',
          border: `1px solid ${showActions ? '#fde68a' : (isApproved ? '#86efac' : '#fca5a5')}`,
          padding: '1rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, color: '#15231f', fontSize: '0.9rem' }}>
              {childAvatar(wallet?.member_name)} {wallet?.member_name || 'Copil'}
            </div>
            <div style={{ fontSize: '0.82rem', color: '#6b7280', marginTop: '0.2rem' }}>{reqTypeLabel(r)}</div>
            <div style={{ fontWeight: 700, color: '#374151', fontSize: '0.88rem', marginTop: '0.15rem' }}>
              {task ? `${safeIcon(task.icon)} ${task.title}` : (reward ? `${safeIcon(reward.icon)} ${reward.title}` : '—')}
            </div>
            <div style={{ fontWeight: 900, color: '#b45309', marginTop: '0.15rem', fontSize: '0.88rem' }}>
              {r.request_type === 'task_completion' ? `+${r.coins}` : `−${r.coins}`} 🪙 ≈ {fmtEur(r.coins, coinValue)}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.2rem' }}>{formatDate(r.created_at)}</div>
          </div>
          {showActions ? (
            <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => approveRequest(r)}
                style={{ minHeight: 'auto', padding: '0.5rem 1rem', fontWeight: 800, fontSize: '0.88rem', borderRadius: '10px', background: 'linear-gradient(135deg, #17463c, #2d7a5e)', color: '#fff', border: 'none', cursor: 'pointer' }}
              >
                ✅ Aprobă
              </button>
              <button
                type="button"
                onClick={() => rejectRequest(r)}
                style={{ minHeight: 'auto', padding: '0.5rem 0.85rem', fontWeight: 700, fontSize: '0.85rem', borderRadius: '10px', background: '#fee2e2', color: '#991b1b', border: 'none', cursor: 'pointer' }}
              >
                ✗ Respinge
              </button>
            </div>
          ) : (
            <div style={{ fontSize: '0.8rem', fontWeight: 800, color: isApproved ? '#15803d' : '#991b1b' }}>
              {isApproved ? '✅ Aprobat' : '❌ Respins'}
            </div>
          )}
        </div>
      )
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: '1.05rem', marginBottom: '0.75rem', color: '#15231f' }}>
            ⏳ Cereri în așteptare ({pending.length})
          </div>
          {pending.length === 0 ? (
            <div style={{ color: '#9ca3af', textAlign: 'center', padding: '2rem', fontSize: '0.9rem', background: '#f9fafb', borderRadius: '12px', border: '1px dashed #d1d5db' }}>
              Nu există cereri în așteptare. 🎉
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {pending.map((r) => renderReqCard(r, true))}
            </div>
          )}
        </div>

        {resolved.length > 0 && (
          <div>
            <div style={{ fontWeight: 800, fontSize: '0.95rem', marginBottom: '0.75rem', color: '#6b7280' }}>
              📋 Cereri recente rezolvate
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {resolved.map((r) => renderReqCard(r, false))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ─── TAB: Chat familie ────────────────────────────────────────────────────

  const renderChat = () => (
    <div className="family-chat-container">
      {!schemaReady.chat && (
        <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '12px', padding: '1rem', color: '#92400e', fontSize: '0.88rem', marginBottom: '1rem' }}>
          ⚠️ Chat familie indisponibil. Rulați scriptul <strong>KB_MIGRATION_FAMILY_CHAT.sql</strong> în Supabase.
        </div>
      )}

      {/* Messages area */}
      <div className="family-chat-messages">
        {messages.length === 0 && (
          <div style={{ color: '#9ca3af', textAlign: 'center', margin: 'auto', fontSize: '0.9rem' }}>
            💬 Niciun mesaj încă. Începe conversația!
          </div>
        )}
        {messages.map((msg) => {
          const isSystem = msg.message_type === 'system' || msg.message_type === 'task_request' || msg.message_type === 'reward_request'
          const isParent = msg.sender_role === 'parent'
          const isSelf = msg.sender_name === senderName

          if (isSystem) {
            return (
              <div key={msg.id} style={{
                alignSelf: 'center',
                background: '#e0f2fe',
                color: '#075985',
                fontSize: '0.78rem',
                fontWeight: 600,
                padding: '0.4rem 0.85rem',
                borderRadius: '20px',
                textAlign: 'center',
                maxWidth: '85%',
              }}>
                {msg.message_text}
              </div>
            )
          }

          return (
            <div key={msg.id} style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: isSelf ? 'flex-end' : 'flex-start',
            }}>
              <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginBottom: '0.2rem', padding: '0 0.5rem' }}>
                {msg.sender_name} · {formatDate(msg.created_at)}
              </div>
              <div style={{
                maxWidth: '75%',
                background: isSelf
                  ? 'linear-gradient(135deg, #17463c, #2d7a5e)'
                  : (isParent ? '#fff' : 'linear-gradient(135deg, #f97316, #ea580c)'),
                color: (isSelf || !isParent) ? '#fff' : '#15231f',
                padding: '0.65rem 1rem',
                borderRadius: isSelf ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                fontSize: '0.9rem',
                fontWeight: 500,
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                border: isParent && !isSelf ? '1px solid #e5e7eb' : 'none',
                wordBreak: 'break-word',
                overflowWrap: 'anywhere',
                whiteSpace: 'pre-wrap',
              }}>
                {msg.message_text}
              </div>
            </div>
          )
        })}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="family-chat-input-wrapper">
        <input
          value={chatText}
          onChange={(e) => setChatText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(chatText) } }}
          placeholder="Scrie un mesaj..."
          className="family-chat-input"
          disabled={!schemaReady.chat}
        />
        <button
          type="button"
          onClick={() => sendMessage(chatText)}
          disabled={chatSending || !chatText.trim() || !schemaReady.chat}
          className="family-chat-send-btn"
        >
          Trimite ➤
        </button>
      </div>
    </div>
  )

  // ─── TAB: Istoric ─────────────────────────────────────────────────────────

  const renderHistory = () => (
    <div>
      <div style={{ fontWeight: 900, fontSize: '1.1rem', marginBottom: '1rem', color: '#15231f' }}>📜 Istoric tranzacții</div>
      {transactions.length === 0 ? (
        <div style={{ color: '#9ca3af', textAlign: 'center', padding: '2rem', fontSize: '0.9rem' }}>Nu există tranzacții încă.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
          {transactions.map((tx) => {
            const isPositive = Number(tx.amount || 0) >= 0
            const walletName = tx.family_wallets?.member_name || '—'
            return (
              <div key={tx.id} style={{
                background: '#fff',
                borderRadius: '12px',
                border: '1px solid #e5e7eb',
                padding: '0.85rem 1.1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
              }}>
                <div style={{ fontSize: '1.5rem' }}>{childAvatar(walletName)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: '#15231f', fontSize: '0.88rem' }}>{walletName}</div>
                  <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{tx.description}</div>
                  <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{formatDate(tx.created_at)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 900, fontSize: '1rem', color: isPositive ? '#15803d' : '#991b1b' }}>
                    {isPositive ? '+' : ''}{tx.amount} 🪙
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>≈ {fmtEur(Math.abs(tx.amount), coinValue)}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  // ─── TAB: Mod Copil ───────────────────────────────────────────────────────

  const renderKidMode = () => {
    const wallet = kidWallet || wallets.find((w) => w.member_name === kidModeChild) || wallets[0]
    if (!wallet) return <div style={{ color: '#9ca3af', padding: '2rem', textAlign: 'center' }}>Nu există portofele. Reîncarcă pagina.</div>

    const balance = Number(wallet.balance || 0)
    const avatar = childAvatar(wallet.member_name)
    const kidTasks = tasksForWallet(wallet.id)
    const kidRewards = rewards.filter((r) => r.is_available !== false)
    const kidRequests = requests.filter((r) => r.child_id === wallet.id).slice(0, 10)

    return (
      <div className="kid-mode-overlay">
        {/* Kid mode header */}
        <div style={{
          background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
          padding: '1.25rem 1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div style={{ color: '#fff', fontWeight: 900, fontSize: '1.1rem' }}>
            {avatar} {wallet.member_name}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {isChildAccount ? (
              /* Child account: show only sign out */
              onSignOut && (
                <button
                  type="button"
                  onClick={onSignOut}
                  style={{
                    minHeight: 'auto',
                    padding: '0.3rem 0.7rem',
                    background: 'rgba(255,255,255,0.2)',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.35)',
                    borderRadius: '20px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  🚪 Ieșire
                </button>
              )
            ) : (
              /* Parent: can switch between children */
              CHILDREN.filter((n) => n !== wallet.member_name).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setKidModeChild(n)}
                  style={{
                    minHeight: 'auto',
                    padding: '0.3rem 0.7rem',
                    background: 'rgba(255,255,255,0.2)',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.35)',
                    borderRadius: '20px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {childAvatar(n)} {n}
                </button>
              ))
            )}
          </div>
        </div>

        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '600px', margin: '0 auto' }}>
          {/* Wallet card */}
          <div style={{
            background: 'linear-gradient(135deg, #fffbeb, #fef3c7)',
            borderRadius: '20px',
            border: '2px solid #fde68a',
            padding: '1.5rem',
            textAlign: 'center',
            boxShadow: '0 4px 20px rgba(251,191,36,0.2)',
          }}>
            <div style={{ fontSize: '3.5rem' }}>{avatar}</div>
            <div style={{ fontWeight: 900, fontSize: '1.25rem', color: '#78350f', marginTop: '0.25rem' }}>{wallet.member_name}</div>
            <div style={{ fontWeight: 900, fontSize: '3rem', color: '#92400e', lineHeight: 1, marginTop: '0.25rem' }}>
              {balance} 🪙
            </div>
            {showChildEur && (
              <div style={{ fontSize: '0.88rem', color: '#a16207', marginTop: '0.25rem' }}>≈ {fmtEur(balance, coinValue)}</div>
            )}
            <div style={{ fontSize: '0.82rem', color: '#b45309', marginTop: '0.5rem', fontWeight: 500 }}>
              Continuă să strângi monede pentru recompense! 💪
            </div>
          </div>

          {/* Kid tasks */}
          <div>
            <div style={{ fontWeight: 900, fontSize: '1rem', color: '#15231f', marginBottom: '0.75rem' }}>📋 Sarcinile mele</div>
            {kidTasks.length === 0 ? (
              <div style={{ color: '#9ca3af', fontSize: '0.88rem', textAlign: 'center', padding: '1.5rem', background: '#fff', borderRadius: '12px', border: '1px dashed #d1d5db' }}>
                Nu ai sarcini active acum. 🎉
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {kidTasks.map((task) => {
                  const alreadyPending = requests.some((r) => r.task_id === task.id && r.child_id === wallet.id && r.status === 'pending')
                  return (
                    <div key={task.id} style={{
                      background: '#fff',
                      borderRadius: '14px',
                      border: '1px solid #e5e7eb',
                      padding: '1rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                    }}>
                      <div style={{ fontSize: '1.8rem', flexShrink: 0 }}>{safeIcon(task.icon)}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 800, color: '#15231f', fontSize: '0.92rem' }}>{task.title}</div>
                        <div style={{ fontWeight: 700, color: '#b45309', fontSize: '0.82rem', marginTop: '0.15rem' }}>
                          +{task.coins} 🪙 ≈ {fmtEur(task.coins, coinValue)}
                        </div>
                        {alreadyPending && (
                          <div style={{ fontSize: '0.75rem', color: '#0369a1', fontWeight: 600, marginTop: '0.2rem' }}>⏳ Cerere trimisă, aștept aprobarea...</div>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={alreadyPending}
                        onClick={() => childSubmitTaskRequest(task, wallet.id)}
                        style={{
                          minHeight: 'auto',
                          padding: '0.5rem 0.9rem',
                          background: alreadyPending ? '#e5e7eb' : 'linear-gradient(135deg, #17463c, #2d7a5e)',
                          color: alreadyPending ? '#9ca3af' : '#fff',
                          border: 'none',
                          borderRadius: '10px',
                          fontWeight: 800,
                          fontSize: '0.82rem',
                          cursor: alreadyPending ? 'not-allowed' : 'pointer',
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                        }}
                      >
                        {alreadyPending ? '⏳ Trimis' : '✅ Am făcut!'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Kid rewards */}
          <div>
            <div style={{ fontWeight: 900, fontSize: '1rem', color: '#15231f', marginBottom: '0.75rem' }}>🎁 Recompensele mele</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.75rem' }}>
              {kidRewards.map((r) => {
                const cost = Number(r.cost || 0)
                const canAfford = balance >= cost
                const pct = cost > 0 ? Math.min(100, Math.round((balance / cost) * 100)) : 100
                const alreadyPending = requests.some((req) => req.reward_id === r.id && req.child_id === wallet.id && req.status === 'pending')

                return (
                  <div key={r.id} style={{
                    background: canAfford ? 'linear-gradient(135deg, #f0fdf4, #dcfce7)' : '#fff',
                    borderRadius: '14px',
                    border: `1px solid ${canAfford ? '#86efac' : '#e5e7eb'}`,
                    padding: '1rem',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                  }}>
                    <div style={{ fontSize: '2rem' }}>{safeIcon(r.icon, '🎁')}</div>
                    <div style={{ fontWeight: 800, fontSize: '0.82rem', color: '#15231f' }}>{r.title}</div>
                    <div style={{ fontWeight: 900, fontSize: '0.9rem', color: '#7c3aed' }}>{cost} 🪙</div>
                    {/* Progress bar */}
                    <div style={{ height: '6px', background: '#e5e7eb', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: canAfford ? '#16a34a' : '#f97316', borderRadius: '3px', transition: 'width 0.4s ease' }} />
                    </div>
                    {!canAfford && <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Îți mai trebuie {cost - balance} 🪙</div>}
                    <button
                      type="button"
                      disabled={!canAfford || alreadyPending}
                      onClick={() => childRequestReward(r, wallet.id)}
                      style={{
                        minHeight: 'auto',
                        padding: '0.4rem 0.6rem',
                        background: (!canAfford || alreadyPending) ? '#e5e7eb' : 'linear-gradient(135deg, #7c3aed, #8b5cf6)',
                        color: (!canAfford || alreadyPending) ? '#9ca3af' : '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        fontWeight: 800,
                        fontSize: '0.78rem',
                        cursor: (!canAfford || alreadyPending) ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {alreadyPending ? '⏳ Trimis' : canAfford ? '🎁 Cere!' : 'Strânge mai multe'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Kid chat */}
          <div>
            <div style={{ fontWeight: 900, fontSize: '1rem', color: '#15231f', marginBottom: '0.75rem' }}>💬 Chat familie</div>
            {/* Quick buttons */}
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
              {QUICK_MESSAGES.map((qm) => (
                <button
                  key={qm.text}
                  type="button"
                  onClick={() => sendMessage(qm.text, wallet.member_name, 'child')}
                  className="kid-chat-quick-btn"
                >
                  {qm.label}
                </button>
              ))}
            </div>
            {/* Recent messages */}
            <div className="kid-chat-messages-container">
              {messages.slice(-10).map((msg) => {
                const isSystem = msg.message_type !== 'normal'
                const isKid = msg.sender_name === wallet.member_name
                if (isSystem) return (
                  <div key={msg.id} style={{ fontSize: '0.75rem', color: '#0369a1', textAlign: 'center', padding: '0.25rem 0' }}>
                    {msg.message_text}
                  </div>
                )
                return (
                  <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isKid ? 'flex-end' : 'flex-start' }}>
                    <div style={{ fontSize: '0.65rem', color: '#9ca3af', marginBottom: '0.1rem', padding: '0 0.4rem' }}>{msg.sender_name}</div>
                    <div style={{
                      maxWidth: '80%',
                      background: isKid ? 'linear-gradient(135deg, #f97316, #ea580c)' : '#fff',
                      color: isKid ? '#fff' : '#15231f',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '10px',
                      fontSize: '0.82rem',
                      border: isKid ? 'none' : '1px solid #e5e7eb',
                      wordBreak: 'break-word',
                      overflowWrap: 'anywhere',
                      whiteSpace: 'pre-wrap',
                    }}>
                      {msg.message_text}
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                value={kidChatText}
                onChange={(e) => setKidChatText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendMessage(kidChatText, wallet.member_name, 'child') } }}
                placeholder="Scrie un mesaj..."
                disabled={!schemaReady.chat}
                className="kid-chat-input"
              />
              <button
                type="button"
                onClick={() => sendMessage(kidChatText, wallet.member_name, 'child')}
                disabled={!kidChatText.trim() || !schemaReady.chat}
                className="kid-chat-send-btn"
              >
                ➤
              </button>
            </div>
          </div>

          {/* Kid requests */}
          {kidRequests.length > 0 && (
            <div>
              <div style={{ fontWeight: 900, fontSize: '1rem', color: '#15231f', marginBottom: '0.75rem' }}>📬 Cererile mele</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {kidRequests.map((r) => {
                  const task = tasks.find((t) => t.id === r.task_id)
                  const reward = rewards.find((rw) => rw.id === r.reward_id)
                  const statusColor = r.status === 'approved' ? '#15803d' : r.status === 'rejected' ? '#991b1b' : '#b45309'
                  const statusLabel = r.status === 'approved' ? '✅ Aprobat' : r.status === 'rejected' ? '❌ Respins' : '⏳ În așteptare'

                  return (
                    <div key={r.id} style={{
                      background: '#fff',
                      borderRadius: '10px',
                      border: '1px solid #e5e7eb',
                      padding: '0.75rem 1rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#374151' }}>
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

          {/* Exit button — only shown for parents, not child accounts */}
          {!isChildAccount && (
            <>
              <div style={{ textAlign: 'center', paddingTop: '0.5rem', paddingBottom: '2rem' }}>
                <button
                  type="button"
                  onClick={() => setKidExitConfirm(true)}
                  style={{
                    minHeight: 'auto',
                    background: 'rgba(0,0,0,0.06)',
                    color: '#6b7280',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '0.5rem 1rem',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  🔐 Ieșire părinți
                </button>
              </div>

              {/* Exit confirm dialog (replaces window.confirm, blocked in Android WebView) */}
              {kidExitConfirm && (
                <div className="kid-exit-confirm-overlay">
                  <div className="kid-exit-confirm-box">
                    <h3>🔐 Ieșire Mod Copil</h3>
                    <p>Ești sigur că vrei să ieși din modul copil?</p>
                    <div className="kid-exit-confirm-btns">
                      <button
                        type="button"
                        onClick={() => setKidExitConfirm(false)}
                        style={{ background: '#f3f4f6', color: '#374151' }}
                      >
                        Rămân
                      </button>
                      <button
                        type="button"
                        onClick={() => { setKidExitConfirm(false); setKidModeActive(false) }}
                        style={{ background: '#17463c', color: '#fff' }}
                      >
                        Ieșire
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    )
  }

  // ─── Main render ──────────────────────────────────────────────────────────

  if (kidModeActive) {
    return (
      <>
        {renderNotice()}
        {renderKidMode()}
      </>
    )
  }

  // If this is a child account but kid mode was somehow deactivated, re-activate it
  if (isChildAccount) {
    setKidModeActive(true)
    return null
  }

  const TABS = [
    { id: 'admin', label: '⚙️ Administrare' },
    { id: 'tasks', label: '📋 Sarcini' },
    { id: 'rewards', label: '🎁 Recompense' },
    { id: 'requests', label: `📬 Cereri${pendingCount ? ` (${pendingCount})` : ''}` },
    { id: 'chat', label: '💬 Chat familie' },
    { id: 'history', label: '📜 Istoric' },
    { id: 'kidmode', label: '🧒 Mod Copil' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
      {renderNotice()}

      {/* Page header */}
      <div style={{
        background: 'linear-gradient(135deg, #17463c 0%, #1e5945 50%, #2d7a5e 100%)',
        borderRadius: '20px',
        padding: '1.5rem 2rem 2rem',
        marginBottom: '0',
        boxShadow: '0 8px 32px rgba(23,70,60,0.2)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', right: '-20px', top: '-20px', width: '180px', height: '180px', borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />
        <h1 style={{ color: '#fff', margin: '0 0 0.25rem', fontSize: '1.7rem', fontWeight: 900 }}>
          🧸 Monede și recompense copii
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.65)', margin: 0, fontSize: '0.88rem' }}>
          Monede virtuale pentru sarcini, obiceiuri bune, educație financiară și recompense.
        </p>
      </div>

      {/* Tab bar - uses .kids-tab-scroll for native Android touch swipe */}
      <div className="kids-tab-scroll">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              if (tab.id === 'kidmode') {
                setKidModeActive(true)
              } else {
                setKidsTab(tab.id)
              }
            }}
            style={{
              minHeight: 'auto',
              whiteSpace: 'nowrap',
              padding: '0.55rem 1rem',
              background: kidsTab === tab.id ? '#17463c' : '#fff',
              color: kidsTab === tab.id ? '#fff' : '#374151',
              border: `1.5px solid ${kidsTab === tab.id ? '#17463c' : '#dde4da'}`,
              borderRadius: '10px',
              fontWeight: 700,
              fontSize: '0.82rem',
              cursor: 'pointer',
              boxShadow: kidsTab === tab.id ? '0 2px 8px rgba(23,70,60,0.15)' : 'none',
              transition: 'all 0.15s ease',
              flexShrink: 0,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ color: '#9ca3af', textAlign: 'center', padding: '3rem', fontSize: '0.9rem' }}>
          Se încarcă... ⏳
        </div>
      )}

      {/* Tab content */}
      {!loading && (
        <div style={{ paddingTop: '0.5rem', paddingBottom: '3rem' }}>
          {kidsTab === 'admin' && renderAdmin()}
          {kidsTab === 'tasks' && renderTasks()}
          {kidsTab === 'rewards' && renderRewards()}
          {kidsTab === 'requests' && renderRequests()}
          {kidsTab === 'chat' && renderChat()}
          {kidsTab === 'history' && renderHistory()}
        </div>
      )}
    </div>
  )
}
