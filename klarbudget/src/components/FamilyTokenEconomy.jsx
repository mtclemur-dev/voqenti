import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'

const defaultRewards = [
  { title: '30 minute tableta', cost: 20, icon: 'game' },
  { title: 'Film in familie', cost: 35, icon: 'film' },
  { title: 'Aleg desertul', cost: 15, icon: 'desert' },
  { title: '5 EUR bani de buzunar', cost: 50, icon: 'money' },
]

const defaultWallets = ['Veronica', 'Robert']

const childLoginByEmail = {
  'mtclemur@gmx.de': 'Veronica',
}

function rewardIcon(icon, title = '') {
  const cleanIcon = String(icon || '').trim()
  const normalized = `${cleanIcon} ${title}`.toLowerCase()
  if (normalized.includes('game') || normalized.includes('tablet')) return '🎮'
  if (normalized.includes('film')) return '🎬'
  if (normalized.includes('desert')) return '🍰'
  if (normalized.includes('money') || normalized.includes('bani') || normalized.includes('eur')) return '💶'
  if (cleanIcon && !cleanIcon.includes('?') && !cleanIcon.includes('�')) return cleanIcon
  return '⭐'
}

function childAvatar(name = '') {
  return name.toLowerCase().includes('veronica') ? '🌸' : '🚀'
}

function normalizeChildName(value = '') {
  return String(value).trim().toLowerCase()
}

function displayChildName(value = '') {
  const normalized = normalizeChildName(value)
  if (normalized.includes('robert')) return 'Robert'
  if (normalized.includes('veronica')) return 'Veronica'
  return String(value || 'Copil').trim()
}

function loggedChildName(user) {
  const emailChild = childLoginByEmail[String(user?.email || '').toLowerCase()]
  if (emailChild) return emailChild
  const metadataName = displayChildName(user?.user_metadata?.child_name || '')
  if (['Robert', 'Veronica'].includes(metadataName)) return metadataName
  const identity = `${user?.email || ''} ${user?.user_metadata?.name || ''}`.toLowerCase()
  if (identity.includes('robert')) return 'Robert'
  if (identity.includes('veronica')) return 'Veronica'
  return ''
}

function isLegacyWallet(wallet) {
  const name = normalizeChildName(wallet?.member_name)
  return name === 'daria' || name === 'fiul de 5 ani'
}

export function FamilyTokenEconomy({ user, childOnly = false, parentOnly = false, onOpenKidMode, onParentExit, familyMode = false }) {
  const [activeTab, setActiveTab] = useState(parentOnly ? 'parent' : 'child')
  const [wallets, setWallets] = useState([])
  const [rewards, setRewards] = useState([])
  const [requests, setRequests] = useState([])
  const [transactions, setTransactions] = useState([])
  const [selectedWalletId, setSelectedWalletId] = useState('')
  const [reason, setReason] = useState('Ajutat la curatenie')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [schemaReady, setSchemaReady] = useState(true)
  const [rewardForm, setRewardForm] = useState({ title: '', cost: '', icon: 'gift' })
  const [coinBurst, setCoinBurst] = useState('')
  const [previousBalance, setPreviousBalance] = useState(null)


  const currentChildName = loggedChildName(user)
  const isRealChildAccount = Boolean(currentChildName) || Boolean(user?.user_metadata?.child_name) || user?.user_metadata?.account_role === 'child'

  const displayWallets = useMemo(() => {
    const visible = wallets.filter((wallet) => !isLegacyWallet(wallet))
    const cleanWallets = visible.length ? visible : wallets
    if (childOnly && isRealChildAccount && currentChildName) {
      return cleanWallets.filter((wallet) => displayChildName(wallet.member_name) === currentChildName)
    }
    return cleanWallets
  }, [childOnly, currentChildName, isRealChildAccount, wallets])

  const selectedWallet = useMemo(
    () => displayWallets.find((wallet) => wallet.id === selectedWalletId) || displayWallets[0],
    [displayWallets, selectedWalletId],
  )

  const pendingRequests = useMemo(
    () => requests.filter((request) => request.status === 'pending'),
    [requests],
  )

  const visibleRewards = useMemo(() => {
    if (!selectedWallet) return []
    const seen = new Set()

    return rewards
      .filter((reward) => reward.is_available)
      .filter((reward) => {
        const key = [
          selectedWallet.id,
          String(reward.title || '').trim().toLowerCase(),
          Number(reward.cost || 0),
        ].join('|')

        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
  }, [rewards, selectedWallet])

  const hasPendingRequest = (reward) =>
    pendingRequests.some(
      (request) =>
        request.wallet_id === selectedWallet?.id &&
        (request.reward_id === reward.id ||
          (request.reward_title === reward.title && Number(request.reward_cost || 0) === Number(reward.cost || 0))),
    )

  useEffect(() => {
    if (!selectedWallet) return
    const balance = Number(selectedWallet.balance || 0)
    if (previousBalance !== null && balance > previousBalance) {
      setCoinBurst(`+${balance - previousBalance} 🪙`)
      setPreviousBalance(balance)
      const timer = window.setTimeout(() => setCoinBurst(''), 1600)
      return () => window.clearTimeout(timer)
    }
    setPreviousBalance(balance)
  }, [previousBalance, selectedWallet])

  useEffect(() => {
    if (parentOnly) setActiveTab('parent')
  }, [parentOnly])

  const rewardMotivation = (balance, cost, pending) => {
    if (pending) return 'Cerere trimisa. Asteapta aprobarea.'
    if (balance >= cost) return 'Super! Poti cere aceasta recompensa!'
    if (cost > 0 && balance / cost >= 0.7) return 'Mai ai putin pana la recompensa!'
    return 'Continua, esti pe drumul bun!'
  }

  const createDefaultData = async () => {
    if (!user) return false
    const childWalletName = currentChildName || displayChildName(user.user_metadata?.child_name || user.email?.split('@')?.[0] || 'Copil')
    const initialWallets = childOnly && isRealChildAccount ? [childWalletName] : defaultWallets

    const { data: walletData, error: walletError } = await supabase
      .from('family_wallets')
      .upsert(
        initialWallets.map((member_name) => ({ user_id: user.id, member_name, balance: 0 })),
        { onConflict: 'user_id,member_name' },
      )
      .select('*')

    if (walletError) {
      console.error('Could not create default family wallets:', walletError)
      setNotice(`Nu am putut crea portofelele: ${walletError.message}`)
      return false
    }

    const { data: existingRewards } = await supabase
      .from('family_rewards_shop')
      .select('id')
      .eq('user_id', user.id)
      .limit(1)

    if (!existingRewards?.length) {
      const { error: rewardError } = await supabase
        .from('family_rewards_shop')
        .insert(defaultRewards.map((reward) => ({ ...reward, user_id: user.id, is_available: true })))

      if (rewardError) {
        console.error('Could not create default family rewards:', rewardError)
        setNotice(`Portofelele au fost create, dar recompensele nu: ${rewardError.message}`)
      }
    }

    setWallets(walletData || [])
    const firstVisibleWallet = walletData?.find((wallet) => !isLegacyWallet(wallet)) || walletData?.[0]
    setSelectedWalletId((current) => current || firstVisibleWallet?.id || '')
    return true
  }

  const ensureDefaultChildren = async (currentWallets) => {
    if (isRealChildAccount) {
      const requiredChildName = currentChildName || displayChildName(user.user_metadata?.child_name || user.email?.split('@')?.[0] || 'Copil')
      const hasChildWallet = currentWallets.some((wallet) => displayChildName(wallet.member_name) === requiredChildName)
      if (hasChildWallet) return currentWallets

      const { data, error } = await supabase
        .from('family_wallets')
        .upsert([{ user_id: user.id, member_name: requiredChildName, balance: 0 }], { onConflict: 'user_id,member_name' })
        .select('*')

      if (error) {
        console.warn('Could not ensure child wallet:', error)
        return currentWallets
      }

      return [...currentWallets, ...(data || [])].sort((a, b) => String(a.member_name).localeCompare(String(b.member_name)))
    }

    const existingNames = new Set(currentWallets.map((wallet) => String(wallet.member_name || '').trim().toLowerCase()))
    const missingNames = defaultWallets.filter((name) => !existingNames.has(name.toLowerCase()))
    if (!missingNames.length) return currentWallets

    const { data, error } = await supabase
      .from('family_wallets')
      .upsert(
        missingNames.map((member_name) => ({ user_id: user.id, member_name, balance: 0 })),
        { onConflict: 'user_id,member_name' },
      )
      .select('*')

    if (error) {
      console.warn('Could not ensure default child wallets:', error)
      return currentWallets
    }

    return [...currentWallets, ...(data || [])].sort((a, b) => String(a.member_name).localeCompare(String(b.member_name)))
  }

  const loadData = async () => {
    if (!user) return
    setLoading(true)
    setNotice('')

    const [walletRes, rewardRes, requestRes, transactionRes] = await Promise.all([
      supabase.from('family_wallets').select('*').eq('user_id', user.id).order('member_name', { ascending: true }),
      supabase.from('family_rewards_shop').select('*').eq('user_id', user.id).order('cost', { ascending: true }),
      supabase
        .from('family_reward_requests')
        .select('*, family_wallets(member_name)')
        .eq('user_id', user.id)
        .order('requested_at', { ascending: false }),
      supabase
        .from('family_transactions')
        .select('*, family_wallets(member_name)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(30),
    ])

    if (walletRes.error || rewardRes.error || requestRes.error || transactionRes.error) {
      console.warn(
        'Family Token Economy schema not ready',
        walletRes.error || rewardRes.error || requestRes.error || transactionRes.error,
      )
      setSchemaReady(false)
      setLoading(false)
      return
    }

    let nextWallets = walletRes.data || []
    let nextRewards = rewardRes.data || []

    if (!nextWallets.length) {
      await createDefaultData()
      const { data, error } = await supabase
        .from('family_wallets')
        .select('*')
        .eq('user_id', user.id)
        .order('member_name', { ascending: true })
      if (error) setNotice(`Nu am putut incarca portofelele: ${error.message}`)
      nextWallets = data || []
    }

    if (!nextRewards.length) {
      const { data, error } = await supabase
        .from('family_rewards_shop')
        .select('*')
        .eq('user_id', user.id)
        .order('cost', { ascending: true })
      if (error) setNotice(`Nu am putut incarca recompensele: ${error.message}`)
      nextRewards = data || []
    }

    nextWallets = await ensureDefaultChildren(nextWallets)

    setWallets(nextWallets)
    setRewards(nextRewards)
    setRequests(requestRes.data || [])
    setTransactions(transactionRes.data || [])
    const selectableWallets = nextWallets.filter((wallet) => !isLegacyWallet(wallet))
    const childWallet = currentChildName
      ? selectableWallets.find((wallet) => displayChildName(wallet.member_name) === currentChildName)
      : null
    const firstVisibleWallet = childWallet || selectableWallets[0] || nextWallets[0]
    setSelectedWalletId((current) => current || firstVisibleWallet?.id || '')
    setSchemaReady(true)
    setLoading(false)
  }

  useEffect(() => {
    loadData()
    // The data loader intentionally owns the initial Supabase refresh for this module.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const addCoins = async (amount) => {
    if (!selectedWallet) return
    const nextBalance = Number(selectedWallet.balance || 0) + amount
    const description = reason.trim() || `+${amount} monede`

    const { error: updateError } = await supabase
      .from('family_wallets')
      .update({ balance: nextBalance })
      .eq('id', selectedWallet.id)
      .eq('user_id', user.id)
    if (updateError) {
      setNotice(updateError.message)
      return
    }

    const { error: txError } = await supabase.from('family_transactions').insert({
      user_id: user.id,
      wallet_id: selectedWallet.id,
      amount,
      description,
    })
    if (txError) {
      setNotice(txError.message)
      return
    }

    setNotice(`${amount} monede adaugate pentru ${selectedWallet.member_name}.`)
    setCoinBurst(`+${amount} 🪙`)
    await loadData()
  }

  const requestReward = async (reward) => {
    if (!selectedWallet) return
    const balance = Number(selectedWallet.balance || 0)
    const cost = Number(reward.cost || 0)
    if (balance < cost) {
      setNotice(`Iti mai trebuie ${cost - balance} monede.`)
      return
    }

    if (hasPendingRequest(reward)) {
      setNotice('Cerere trimisa. Asteapta aprobarea.')
      return
    }

    const { error } = await supabase.from('family_reward_requests').insert({
      user_id: user.id,
      wallet_id: selectedWallet.id,
      reward_id: reward.id,
      reward_title: reward.title,
      reward_cost: cost,
      status: 'pending',
    })

    if (error) {
      setNotice(error.message)
      return
    }

    setNotice('Cererea a fost trimisa parintilor.')
    await loadData()
  }

  const approveRequest = async (request) => {
    const wallet = wallets.find((item) => item.id === request.wallet_id)
    if (!wallet) return
    const balance = Number(wallet.balance || 0)
    const cost = Number(request.reward_cost || 0)

    if (balance < cost) {
      setNotice(`Nu se poate aproba. Lui ${wallet.member_name} ii mai trebuie ${cost - balance} monede.`)
      return
    }

    const { error: updateError } = await supabase
      .from('family_wallets')
      .update({ balance: balance - cost })
      .eq('id', wallet.id)
      .eq('user_id', user.id)
    if (updateError) {
      setNotice(updateError.message)
      return
    }

    const { error: txError } = await supabase.from('family_transactions').insert({
      user_id: user.id,
      wallet_id: wallet.id,
      amount: -cost,
      description: `Redeem aprobat: ${request.reward_title}`,
    })
    if (txError) {
      setNotice(txError.message)
      return
    }

    const { error: requestError } = await supabase
      .from('family_reward_requests')
      .update({ status: 'approved', resolved_at: new Date().toISOString() })
      .eq('id', request.id)
      .eq('user_id', user.id)
    if (requestError) {
      setNotice(requestError.message)
      return
    }

    setNotice(`Recompensa aprobata pentru ${wallet.member_name}.`)
    await loadData()
  }

  const rejectRequest = async (request) => {
    const { error } = await supabase
      .from('family_reward_requests')
      .update({ status: 'rejected', resolved_at: new Date().toISOString() })
      .eq('id', request.id)
      .eq('user_id', user.id)

    if (error) {
      setNotice(error.message)
      return
    }

    setNotice('Cererea a fost respinsa.')
    await loadData()
  }

  const addReward = async (event) => {
    event.preventDefault()
    const cost = Number(rewardForm.cost || 0)
    if (!rewardForm.title.trim() || cost <= 0) return

    const { error } = await supabase.from('family_rewards_shop').insert({
      user_id: user.id,
      title: rewardForm.title.trim(),
      cost,
      icon: rewardForm.icon || 'gift',
      is_available: true,
    })
    if (error) {
      setNotice(error.message)
      return
    }

    setRewardForm({ title: '', cost: '', icon: 'gift' })
    setNotice('Recompensa adaugata.')
    await loadData()
  }

  if (!schemaReady) {
    return (
      <section className="section">
        <h2>Family Token Economy</h2>
        <div className="notice danger">
          Ruleaza in Supabase scriptul KB_MIGRATION_FAMILY_TOKEN_ECONOMY.sql ca sa activezi portofelele,
          recompensele si cererile copiilor.
        </div>
      </section>
    )
  }

  return (
    <section className={childOnly ? 'kid-mode-shell' : 'section'}>
      {childOnly && (
        <button type="button" className="kid-parent-exit" onClick={onParentExit}>
          Iesire parinti
        </button>
      )}
      <div className={childOnly ? 'kid-mode-content' : 'flex flex-col gap-4'}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className={childOnly ? 'kid-title' : 'text-2xl font-black text-emerald-950'}>{childOnly ? 'Recompensele mele' : 'Family Token Economy'}</h2>
            <p className={childOnly ? 'kid-subtitle' : 'text-sm text-slate-600'}>
              {childOnly ? 'Strange monede pentru recompense!' : 'Monede virtuale pentru obiceiuri bune, ajutor in casa si recompense.'}
            </p>
          </div>
          {!childOnly && (
            <div className="inline-flex rounded-lg bg-emerald-50 p-1">
              {!parentOnly && <button type="button" className={`rounded-md px-4 py-2 text-sm font-bold ${activeTab === 'child' ? 'bg-emerald-800 text-white' : 'text-emerald-950'}`} onClick={() => setActiveTab('child')}>Vizualizare Copil</button>}
              <button type="button" className={`rounded-md px-4 py-2 text-sm font-bold ${activeTab === 'parent' ? 'bg-emerald-800 text-white' : 'text-emerald-950'}`} onClick={() => setActiveTab('parent')}>Panoul Parintilor</button>
            </div>
          )}
        </div>

        {parentOnly && (
          <div className="kid-open-card">
            <div>
              <strong>Mod Copil</strong>
              <span>Deschide o interfata separata pentru Veronica si Robert, fara meniurile financiare.</span>
            </div>
            <button type="button" className="kid-open-button" onClick={onOpenKidMode}>
              Deschide Mod Copil
            </button>
          </div>
        )}

        {notice && <div className={childOnly ? 'kid-notice' : 'notice'}>{notice}</div>}
        {loading ? <div className="empty">Se incarca...</div> : null}

        {!loading && wallets.length === 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
            <h3 className="text-lg font-black text-amber-950">Nu exista portofele inca.</h3>
            <p className="mt-1 text-sm text-slate-700">
              Creeaza portofelele initiale pentru copii. Daca apare eroare, verifica daca scriptul SQL a fost rulat in Supabase.
            </p>
            <button
              type="button"
              className="mt-4 rounded-lg bg-emerald-800 px-4 py-3 text-sm font-black text-white"
              onClick={async () => {
                setLoading(true)
                const created = await createDefaultData()
                if (created) setNotice('Portofele create.')
                await loadData()
              }}
            >
              Creeaza portofele
            </button>
          </div>
        )}

        {displayWallets.length > 0 && !childOnly && (
          <label className="text-sm font-bold text-slate-700">
            Copil
            <select className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3" value={selectedWallet?.id || ''} onChange={(event) => setSelectedWalletId(event.target.value)}>
              {displayWallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.member_name}</option>)}
            </select>
          </label>
        )}

        {displayWallets.length > 1 && childOnly && (
          <div className="kid-child-picker" aria-label="Alege copilul">
            {displayWallets.map((wallet) => (
              <button
                type="button"
                key={wallet.id}
                className={wallet.id === selectedWallet?.id ? 'active' : ''}
                onClick={() => setSelectedWalletId(wallet.id)}
              >
                <span>{childAvatar(wallet.member_name)}</span>
                {wallet.member_name}
              </button>
            ))}
          </div>
        )}

        {activeTab === 'child' && !parentOnly && selectedWallet && (
          <div className={childOnly ? 'kid-layout' : 'grid gap-4 lg:grid-cols-[320px_1fr]'}>
            <div className={childOnly ? 'kid-wallet-card' : 'rounded-xl border border-amber-200 bg-amber-50 p-6 text-center shadow-sm'}>
              <div className={childOnly ? 'kid-coin' : 'text-6xl'}>🪙</div>
              {coinBurst && <div className="kid-coin-burst">{coinBurst}</div>}
              <h3 className={childOnly ? 'kid-name' : 'mt-3 text-2xl font-black text-amber-950'}>{selectedWallet.member_name}</h3>
              <div className={childOnly ? 'kid-balance' : 'mt-3 text-5xl font-black text-amber-700'}>{selectedWallet.balance} monede</div>
              <p className={childOnly ? 'kid-tagline' : 'text-sm font-bold text-amber-900'}>Strange monede pentru recompense!</p>
            </div>

            <div className={childOnly ? 'kid-reward-grid' : 'grid gap-3 sm:grid-cols-2'}>
              {visibleRewards.map((reward) => {
                const balance = Number(selectedWallet.balance || 0)
                const cost = Number(reward.cost || 0)
                const missing = Math.max(0, cost - balance)
                const progress = cost > 0 ? Math.min(100, Math.round((balance / cost) * 100)) : 0
                const canRequest = balance >= cost
                const pending = hasPendingRequest(reward)
                const motivation = rewardMotivation(balance, cost, pending)

                return (
                  <article key={reward.id} className={childOnly ? 'kid-reward-card' : 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm'}>
                    <div className={childOnly ? 'kid-reward-head' : 'flex items-start gap-3'}>
                      <div className={childOnly ? 'kid-reward-icon' : 'text-4xl'}>{rewardIcon(reward.icon, reward.title)}</div>
                      <div className="min-w-0 flex-1">
                        <h4 className={childOnly ? 'kid-reward-title' : 'text-lg font-black text-slate-900'}>{reward.title}</h4>
                        <p className={childOnly ? 'kid-reward-cost' : 'text-sm font-bold text-amber-700'}>{cost} monede</p>
                        <p className={childOnly ? 'kid-progress-text' : 'mt-1 text-xs font-bold text-slate-600'}>Progres: {balance} / {cost}</p>
                        <div className={childOnly ? 'kid-progress' : 'mt-2 h-2 overflow-hidden rounded-full bg-slate-100'}>
                          <div className={childOnly ? 'kid-progress-fill' : 'h-full rounded-full bg-amber-500'} style={{ width: progress + '%' }} />
                        </div>
                        {missing > 0 && <p className={childOnly ? 'kid-missing' : 'mt-2 text-xs font-bold text-red-700'}>Iti mai trebuie {missing} monede</p>}
                        {pending && <p className={childOnly ? 'kid-pending' : 'mt-2 text-xs font-bold text-emerald-700'}>Cerere trimisa. Asteapta aprobarea.</p>}
                        <p className={childOnly ? 'kid-motivation' : 'mt-2 text-xs font-bold text-slate-600'}>{motivation}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className={childOnly
                        ? 'kid-reward-button ' + (canRequest && !pending ? '' : 'disabled')
                        : 'mt-4 w-full rounded-lg px-4 py-3 text-sm font-black ' + (canRequest && !pending ? 'bg-emerald-800 text-white' : 'bg-slate-200 text-slate-500')}
                      disabled={!canRequest || pending}
                      onClick={() => requestReward(reward)}
                    >
                      {pending ? 'Cerere trimisa' : 'Cere recompensa'}
                    </button>
                  </article>
                )
              })}
            </div>
          </div>
        )}
        {!childOnly && activeTab === 'parent' && selectedWallet && (
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-lg font-black text-slate-900">Adauga monede</h3>
              <p className="text-sm text-slate-600">Alege motivul si adauga monede pentru activitati bune.</p>
              <label className="mt-4 block text-sm font-bold text-slate-700">
                Motiv
                <input className="mt-1 w-full rounded-lg border border-slate-300 p-3" value={reason} onChange={(event) => setReason(event.target.value)} />
              </label>
              <div className="mt-4 flex flex-wrap gap-2">
                {[1, 5, 10, 20].map((amount) => (
                  <button key={amount} type="button" className="rounded-lg bg-emerald-800 px-4 py-3 text-sm font-black text-white" onClick={() => addCoins(amount)}>
                    +{amount} Monede
                  </button>
                ))}
              </div>
            </div>

            {!familyMode && (
              <form className="rounded-xl border border-slate-200 bg-white p-4" onSubmit={addReward}>
                <h3 className="text-lg font-black text-slate-900">Recompensa noua</h3>
                <div className="mt-4 grid gap-3">
                  <input className="rounded-lg border border-slate-300 p-3" placeholder="Titlu recompensa" value={rewardForm.title} onChange={(event) => setRewardForm({ ...rewardForm, title: event.target.value })} />
                  <input className="rounded-lg border border-slate-300 p-3" placeholder="Cost monede" type="number" value={rewardForm.cost} onChange={(event) => setRewardForm({ ...rewardForm, cost: event.target.value })} />
                  <input className="rounded-lg border border-slate-300 p-3" placeholder="Icon sau text scurt" value={rewardForm.icon} onChange={(event) => setRewardForm({ ...rewardForm, icon: event.target.value })} />
                  <button type="submit" className="rounded-lg bg-amber-600 px-4 py-3 text-sm font-black text-white">Adauga recompensa</button>
                </div>
              </form>
            )}

            <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-lg font-black text-slate-900">Cereri in asteptare</h3>
              <div className="mt-3 grid gap-2">
                {pendingRequests.length === 0 ? <div className="empty">Nu exista cereri in asteptare.</div> : pendingRequests.map((request) => (
                  <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-amber-50 p-3 text-sm">
                    <div>
                      <strong>{request.family_wallets?.member_name || 'Copil'}</strong>
                      <span className="block text-slate-700">{request.reward_title}</span>
                      <span className="block font-black text-amber-700">{request.reward_cost} monede</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-black text-white" onClick={() => approveRequest(request)}>Aproba</button>
                      <button type="button" className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-black text-slate-700" onClick={() => rejectRequest(request)}>Respinge</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-lg font-black text-slate-900">Istoric tranzactii</h3>
              <div className="mt-3 grid gap-2">
                {transactions.length === 0 ? <div className="empty">Nu exista tranzactii inca.</div> : transactions.map((transaction) => (
                  <div key={transaction.id} className="flex items-center justify-between rounded-lg bg-slate-50 p-3 text-sm">
                    <div>
                      <strong>{transaction.family_wallets?.member_name || 'Copil'}</strong>
                      <span className="block text-slate-600">{transaction.description}</span>
                    </div>
                    <span className={`font-black ${transaction.amount >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                      {transaction.amount > 0 ? '+' : ''}{transaction.amount} monede
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
