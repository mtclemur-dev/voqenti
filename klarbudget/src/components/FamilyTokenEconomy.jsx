import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'

const defaultRewards = [
  { title: '30 minute tableta', cost: 20, icon: 'game' },
  { title: 'Film in familie', cost: 35, icon: 'film' },
  { title: 'Aleg desertul', cost: 15, icon: 'desert' },
  { title: '5 EUR bani de buzunar', cost: 50, icon: 'money' },
]

const defaultWallets = ['Daria', 'Fiul de 5 ani']

function rewardIcon(icon) {
  const normalized = String(icon || '').toLowerCase()
  if (normalized.includes('game')) return '🎮'
  if (normalized.includes('film')) return '🎬'
  if (normalized.includes('desert')) return '🍰'
  if (normalized.includes('money')) return '💶'
  return icon || '🎁'
}

export function FamilyTokenEconomy({ user, childOnly = false }) {
  const [activeTab, setActiveTab] = useState('child')
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

  const selectedWallet = useMemo(
    () => wallets.find((wallet) => wallet.id === selectedWalletId) || wallets[0],
    [selectedWalletId, wallets],
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

  const createDefaultData = async () => {
    if (!user) return false
    const childWalletName = user.user_metadata?.child_name || user.email?.split('@')?.[0] || 'Copil'
    const initialWallets = childOnly ? [childWalletName] : defaultWallets

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
    setSelectedWalletId((current) => current || walletData?.[0]?.id || '')
    return true
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

    setWallets(nextWallets)
    setRewards(nextRewards)
    setRequests(requestRes.data || [])
    setTransactions(transactionRes.data || [])
    setSelectedWalletId((current) => current || nextWallets[0]?.id || '')
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
    await loadData()
  }

  const requestReward = async (reward) => {
    if (!selectedWallet) return
    const balance = Number(selectedWallet.balance || 0)
    const cost = Number(reward.cost || 0)
    if (balance < cost) {
      setNotice(`Nu sunt destule monede. Mai lipsesc ${cost - balance}.`)
      return
    }

    if (hasPendingRequest(reward)) {
      setNotice('Cererea pentru aceasta recompensa este deja in asteptare.')
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

    setNotice('Cererea de recompensa a fost trimisa catre parinti.')
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
    <section className="section">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black text-emerald-950">Family Token Economy</h2>
            <p className="text-sm text-slate-600">Monede virtuale pentru obiceiuri bune, ajutor in casa si recompense.</p>
          </div>
          {!childOnly && (
            <div className="inline-flex rounded-lg bg-emerald-50 p-1">
              <button type="button" className={`rounded-md px-4 py-2 text-sm font-bold ${activeTab === 'child' ? 'bg-emerald-800 text-white' : 'text-emerald-950'}`} onClick={() => setActiveTab('child')}>Vizualizare Copil</button>
              <button type="button" className={`rounded-md px-4 py-2 text-sm font-bold ${activeTab === 'parent' ? 'bg-emerald-800 text-white' : 'text-emerald-950'}`} onClick={() => setActiveTab('parent')}>Panoul Parintilor</button>
            </div>
          )}
        </div>

        {notice && <div className="notice">{notice}</div>}
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

        {wallets.length > 0 && !childOnly && (
          <label className="text-sm font-bold text-slate-700">
            Copil
            <select className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3" value={selectedWallet?.id || ''} onChange={(event) => setSelectedWalletId(event.target.value)}>
              {wallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.member_name}</option>)}
            </select>
          </label>
        )}

        {activeTab === 'child' && selectedWallet && (
          <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center shadow-sm">
              <div className="text-6xl">🪙</div>
              <h3 className="mt-3 text-2xl font-black text-amber-950">{selectedWallet.member_name}</h3>
              <div className="mt-3 text-5xl font-black text-amber-700">{selectedWallet.balance}</div>
              <p className="text-sm font-bold text-amber-900">monede disponibile</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {visibleRewards.map((reward) => {
                const balance = Number(selectedWallet.balance || 0)
                const cost = Number(reward.cost || 0)
                const missing = Math.max(0, cost - balance)
                const progress = cost > 0 ? Math.min(100, Math.round((balance / cost) * 100)) : 0
                const canRequest = balance >= cost
                const pending = hasPendingRequest(reward)

                return (
                  <article key={reward.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="text-4xl">{rewardIcon(reward.icon)}</div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-lg font-black text-slate-900">{reward.title}</h4>
                        <p className="text-sm font-bold text-amber-700">{cost} monede</p>
                        <p className="mt-1 text-xs font-bold text-slate-600">{balance} / {cost} monede</p>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-amber-500" style={{ width: `${progress}%` }} />
                        </div>
                        {missing > 0 && <p className="mt-2 text-xs font-bold text-red-700">Iti mai trebuie {missing} monede</p>}
                        {pending && <p className="mt-2 text-xs font-bold text-emerald-700">Cerere in asteptare</p>}
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`mt-4 w-full rounded-lg px-4 py-3 text-sm font-black ${canRequest && !pending ? 'bg-emerald-800 text-white' : 'bg-slate-200 text-slate-500'}`}
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

            <form className="rounded-xl border border-slate-200 bg-white p-4" onSubmit={addReward}>
              <h3 className="text-lg font-black text-slate-900">Recompensa noua</h3>
              <div className="mt-4 grid gap-3">
                <input className="rounded-lg border border-slate-300 p-3" placeholder="Titlu recompensa" value={rewardForm.title} onChange={(event) => setRewardForm({ ...rewardForm, title: event.target.value })} />
                <input className="rounded-lg border border-slate-300 p-3" placeholder="Cost monede" type="number" value={rewardForm.cost} onChange={(event) => setRewardForm({ ...rewardForm, cost: event.target.value })} />
                <input className="rounded-lg border border-slate-300 p-3" placeholder="Icon sau text scurt" value={rewardForm.icon} onChange={(event) => setRewardForm({ ...rewardForm, icon: event.target.value })} />
                <button type="submit" className="rounded-lg bg-amber-600 px-4 py-3 text-sm font-black text-white">Adauga recompensa</button>
              </div>
            </form>

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
