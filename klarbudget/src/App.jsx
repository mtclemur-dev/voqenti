import { useCallback, useEffect, useMemo, useState } from 'react'
import { Auth } from './components/Auth'
import { Dashboard } from './components/Dashboard'
import { AccountForm, DebtForm, ExpenseForm, IncomeForm, JournalEntryForm, WorkAbsenceForm } from './components/Forms'
import { EntityList } from './components/EntityList'
import { DebtPlan } from './components/DebtPlan'
import { PaymentCalendar } from './components/PaymentCalendar'
import { Insights } from './components/Insights'
import { AIActionPanel } from './components/AIActionPanel'
import { categories, debtCategories, dictionary, languages, makeTranslator } from './i18n'
import { calculateSummary, debtRemainingTotal, expenseKind, formatMoney, isoDate, toNumber, variableBudgetStats } from './lib/finance'
import { buildInsights } from './lib/insights'
import { hasSupabaseConfig, supabase } from './supabaseClient'

const defaultSettings = {
  monthly_extra_debt_payment: 0,
  debt_method: 'snowball',
  large_payment_threshold: 300,
  include_mortgage_in_plan: false,
  minimum_reserve: 200,
  include_overdraft_in_debt_plan: false,
}

const navItems = ['dashboard', 'journal', 'workAbsence', 'accounts', 'incomes', 'expenses', 'debts', 'calendar', 'insights', 'aiActions']

function App() {
  const [language, setLanguage] = useState(localStorage.getItem('klarbudget-language') || 'ro')
  const [user, setUser] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('dashboard')
  const [incomes, setIncomes] = useState([])
  const [expenses, setExpenses] = useState([])
  const [debts, setDebts] = useState([])
  const [accounts, setAccounts] = useState([])
  const [accountSnapshots, setAccountSnapshots] = useState([])
  const [paymentStatuses, setPaymentStatuses] = useState([])
  const [journalEntries, setJournalEntries] = useState([])
  const [dailyClosures, setDailyClosures] = useState([])
  const [journalSchemaReady, setJournalSchemaReady] = useState(true)
  const [workAbsences, setWorkAbsences] = useState([])
  const [workAbsenceSchemaReady, setWorkAbsenceSchemaReady] = useState(true)
  const [settings, setSettings] = useState(defaultSettings)
  const [settingsDraft, setSettingsDraft] = useState(defaultSettings)
  const [currency, setCurrency] = useState('EUR')
  const [editing, setEditing] = useState({ incomes: null, expenses: null, debts: null, accounts: null, journal: null, workAbsence: null })
  const [formOpen, setFormOpen] = useState({ incomes: false, expenses: false, debts: false, accounts: false, journal: true, workAbsence: false })
  const [notice, setNotice] = useState('')
  const [expenseFilters, setExpenseFilters] = useState({ search: '', category: 'all', type: 'all', sort: 'date' })
  const [debtSort, setDebtSort] = useState('priority')

  const t = useMemo(() => makeTranslator(language), [language])

  useEffect(() => {
    localStorage.setItem('klarbudget-language', language)
  }, [language])

  useEffect(() => {
    if (!hasSupabaseConfig) {
      setLoading(false)
      return
    }

    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  const loadData = useCallback(async () => {
    if (!user) return
    setLoading(true)

    const [profileRes, incomesRes, expensesRes, debtsRes, paymentsRes, settingsRes, accountsRes, snapshotsRes, journalRes, closuresRes, workAbsencesRes] = await Promise.all([
      supabase.from('kb_profiles').select('*').eq('id', user.id).maybeSingle(),
      supabase.from('kb_incomes').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('kb_expenses').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('kb_debts').select('*').eq('user_id', user.id).order('priority', { ascending: true }),
      supabase.from('kb_payment_status').select('*').eq('user_id', user.id).order('due_date', { ascending: true }),
      supabase.from('kb_settings').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('kb_accounts').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }),
      supabase.from('kb_account_snapshots').select('*').eq('user_id', user.id).order('snapshot_date', { ascending: false }),
      supabase.from('kb_daily_entries').select('*').eq('user_id', user.id).order('entry_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('kb_daily_closures').select('*').eq('user_id', user.id).order('closure_date', { ascending: false }),
      supabase.from('kb_work_absences').select('*').eq('user_id', user.id).order('work_date', { ascending: false }).order('start_time', { ascending: false }),
    ])

    if (!profileRes.data) {
      await supabase.from('kb_profiles').insert({ id: user.id, preferred_language: language, currency: 'EUR' })
    } else {
      setCurrency(profileRes.data.currency || 'EUR')
      setLanguage(profileRes.data.preferred_language || language)
    }

    if (!settingsRes.data) {
      const { data } = await supabase
        .from('kb_settings')
        .insert({
          user_id: user.id,
          monthly_extra_debt_payment: defaultSettings.monthly_extra_debt_payment,
          debt_method: defaultSettings.debt_method,
          large_payment_threshold: defaultSettings.large_payment_threshold,
          include_mortgage_in_plan: defaultSettings.include_mortgage_in_plan,
        })
        .select('*')
        .single()
      const nextSettings = { ...defaultSettings, ...(data || {}) }
      setSettings(nextSettings)
      setSettingsDraft(nextSettings)
    } else {
      const nextSettings = { ...defaultSettings, ...settingsRes.data }
      setSettings(nextSettings)
      setSettingsDraft(nextSettings)
    }

    setIncomes(incomesRes.data || [])
    setExpenses(expensesRes.data || [])
    setDebts(debtsRes.data || [])
    setPaymentStatuses(paymentsRes.data || [])
    setAccounts(accountsRes.data || [])
    setAccountSnapshots(snapshotsRes.data || [])
    setJournalEntries(journalRes.data || [])
    setDailyClosures(closuresRes.data || [])
    setJournalSchemaReady(!journalRes.error && !closuresRes.error)
    setWorkAbsences(workAbsencesRes.data || [])
    setWorkAbsenceSchemaReady(!workAbsencesRes.error)
    setLoading(false)
  }, [language, user])

  useEffect(() => {
    loadData()
  }, [loadData])

  const summary = useMemo(
    () => calculateSummary({ incomes, expenses, debts, settings, paymentStatuses, accounts, accountSnapshots, journalEntries }),
    [incomes, expenses, debts, settings, paymentStatuses, accounts, accountSnapshots, journalEntries],
  )

  const insights = useMemo(
    () => buildInsights({ summary, incomes, expenses, debts, settings, paymentStatuses, t, language, currency }),
    [summary, incomes, expenses, debts, settings, paymentStatuses, t, language, currency],
  )

  const signIn = async () => {
    setAuthError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setAuthError(error.message)
  }

  const signUp = async () => {
    setAuthError('')
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) setAuthError(error.message)
  }

  const saveRow = async (table, payload, currentItem = null) => {
    const prepared = preparePayload(payload)
    const query = currentItem
      ? supabase.from(table).update(prepared).eq('id', currentItem.id).eq('user_id', user.id)
      : supabase.from(table).insert({ ...prepared, user_id: user.id })
    const { error } = await query
    if (error) {
      setNotice(t('saveError'))
      window.alert(error.message)
      return
    }
    setEditing({ incomes: null, expenses: null, debts: null, accounts: null })
    setFormOpen({ incomes: false, expenses: false, debts: false, accounts: false })
    setNotice(t('savedSuccess'))
    loadData()
  }

  const deleteRow = async (table, row) => {
    if (!window.confirm(t('deleteConfirm'))) return
    const { error } = await supabase.from(table).delete().eq('id', row.id).eq('user_id', user.id)
    if (error) {
      setNotice(t('saveError'))
      window.alert(error.message)
    }
    else {
      setEditing({ incomes: null, expenses: null, debts: null, accounts: null })
      setNotice(t('deletedSuccess'))
      loadData()
    }
  }

  const saveAccount = async (payload, currentItem = null) => {
    const prepared = preparePayload(cleanAccountPayload(payload))
    const query = currentItem
      ? supabase.from('kb_accounts').update(prepared).eq('id', currentItem.id).eq('user_id', user.id)
      : supabase.from('kb_accounts').insert({ ...prepared, user_id: user.id }).select('*').single()
    const { data, error } = await query
    if (error) {
      setNotice(t('saveError'))
      window.alert(error.message)
      return
    }

    const accountId = currentItem?.id || data?.id
    if (accountId) {
      await supabase.from('kb_account_snapshots').insert({
        user_id: user.id,
        account_id: accountId,
        balance: prepared.current_balance,
      })
    }

    setEditing((current) => ({ ...current, accounts: null }))
    setFormOpen((current) => ({ ...current, accounts: false }))
    setNotice(t('savedSuccess'))
    loadData()
  }

  const saveJournalEntry = async (payload, currentItem = null) => {
    const targetDate = payload.entry_date || isoDate(new Date())
    const closed = dailyClosures.some((item) => item.closure_date === targetDate)
    if (!currentItem && closed) {
      setNotice(t('journalDayClosedBlocked'))
      return
    }
    const prepared = preparePayload({
      ...payload,
      product_name: payload.product_name || inferProductName(payload.description),
    })
    let query = currentItem
      ? supabase.from('kb_daily_entries').update(prepared).eq('id', currentItem.id).eq('user_id', user.id)
      : supabase.from('kb_daily_entries').insert({ ...prepared, user_id: user.id })
    let { error } = await query
    if (error && /entry_mode|unit_price/i.test(error.message || '')) {
      const fallback = { ...prepared }
      delete fallback.entry_mode
      delete fallback.unit_price
      query = currentItem
        ? supabase.from('kb_daily_entries').update(fallback).eq('id', currentItem.id).eq('user_id', user.id)
        : supabase.from('kb_daily_entries').insert({ ...fallback, user_id: user.id })
      ;({ error } = await query)
    }
    if (error) {
      setNotice(t('saveError'))
      window.alert(error.message)
      return
    }
    setEditing((current) => ({ ...current, journal: null }))
    setNotice(t('savedSuccess'))
    loadData()
  }

  const closeJournalDay = async (date) => {
    const closed = dailyClosures.find((item) => item.closure_date === date)
    if (closed) {
      if (!window.confirm(t('reopenDayConfirm'))) return
      const { error } = await supabase.from('kb_daily_closures').delete().eq('id', closed.id).eq('user_id', user.id)
      if (error) {
        setNotice(t('saveError'))
        window.alert(error.message)
        return
      }
      setNotice(t('dayReopened'))
      loadData()
      return
    }
    const entries = journalEntries.filter((item) => item.entry_date === date)
    const total = entries.reduce((sum, item) => sum + toNumber(item.amount), 0)
    const { error } = await supabase.from('kb_daily_closures').upsert({
      user_id: user.id,
      closure_date: date,
      total_amount: total,
      entry_count: entries.length,
    }, { onConflict: 'user_id,closure_date' })
    if (error) {
      setNotice(t('saveError'))
      window.alert(error.message)
      return
    }
    setNotice(t('dayClosed'))
    loadData()
  }

  const deleteJournalEntry = async (item) => {
    const closed = dailyClosures.some((closure) => closure.closure_date === item.entry_date)
    if (closed && !window.confirm(t('deleteClosedDayConfirm'))) return
    if (!window.confirm(t('journalDeleteConfirm'))) return
    const { error } = await supabase.from('kb_daily_entries').delete().eq('id', item.id).eq('user_id', user.id)
    if (error) {
      setNotice(t('saveError'))
      window.alert(error.message)
      return
    }
    setEditing((current) => ({ ...current, journal: null }))
    setNotice(t('deletedSuccess'))
    loadData()
  }

  const saveWorkAbsence = async (payload, currentItem = null) => {
    const prepared = normalizeWorkAbsencePayload(payload)
    const query = currentItem
      ? supabase.from('kb_work_absences').update(prepared).eq('id', currentItem.id).eq('user_id', user.id)
      : supabase.from('kb_work_absences').insert({ ...prepared, user_id: user.id })
    const { error } = await query
    if (error) {
      setNotice(t('saveError'))
      window.alert(error.message)
      return
    }
    setEditing((current) => ({ ...current, workAbsence: null }))
    setFormOpen((current) => ({ ...current, workAbsence: false }))
    setNotice(t('savedSuccess'))
    loadData()
  }

  const startWorkAbsence = async () => {
    if (!workAbsenceSchemaReady) return
    const active = workAbsences.find((item) => item.is_active)
    if (active) return
    const now = new Date()
    const { error } = await supabase.from('kb_work_absences').insert({
      user_id: user.id,
      work_date: isoDate(now),
      start_time: timeValue(now),
      break_minutes: 0,
      entry_source: 'automatic',
      is_active: true,
      confirmed: false,
    })
    if (error) {
      setNotice(t('saveError'))
      window.alert(error.message)
      return
    }
    setNotice(t('workAbsenceStarted'))
    loadData()
  }

  const stopWorkAbsence = async (active) => {
    if (!active) return
    const now = new Date()
    const payload = normalizeWorkAbsencePayload({
      ...active,
      end_time: timeValue(now),
      entry_source: 'automatic',
      is_active: false,
      confirmed: window.confirm(t('workConfirmOnStop')),
    })
    const { error } = await supabase
      .from('kb_work_absences')
      .update(payload)
      .eq('id', active.id)
      .eq('user_id', user.id)
    if (error) {
      setNotice(t('saveError'))
      window.alert(error.message)
      return
    }
    setNotice(t('workAbsenceStopped'))
    loadData()
  }

  const setExpensePaymentStatus = async (expense, status) => {
    const dueDate = expense.due_date_iso ?? expense.due_date
    if (!dueDate) return
    const payload = {
      user_id: user.id,
      expense_id: expense.id,
      name: expense.name,
      amount: toNumber(expense.amount),
      due_date: dueDate,
      status,
      paid_date: status === 'paid' ? isoDate(new Date()) : null,
    }
    const { error } = await supabase
      .from('kb_payment_status')
      .upsert(payload, { onConflict: 'user_id,expense_id,due_date' })
    if (error) {
      setNotice(t('saveError'))
      window.alert(error.message)
      return
    }
    setNotice(t('paymentSaved'))
    loadData()
  }

  const updateSettings = async (changes) => {
    const next = { ...settings, ...changes }
    setSettings(next)
    const { error } = await supabase
      .from('kb_settings')
      .upsert({ ...next, user_id: user.id }, { onConflict: 'user_id' })
    if (error) window.alert(error.message)
  }

  const saveFinancialSettings = async () => {
    await updateSettings({
      minimum_reserve: Number(settingsDraft.minimum_reserve || 0),
      include_overdraft_in_debt_plan: Boolean(settingsDraft.include_overdraft_in_debt_plan),
    })
    setNotice(t('savedSuccess'))
  }

  const changeLanguage = async (nextLanguage) => {
    setLanguage(nextLanguage)
    if (user) {
      await supabase.from('kb_profiles').upsert({
        id: user.id,
        preferred_language: nextLanguage,
        currency,
      })
    }
  }

  const locale = language === 'de' ? 'de-DE' : 'ro-RO'
  const filteredExpenses = expenses
    .filter((item) => expenseFilters.search ? item.name.toLowerCase().includes(expenseFilters.search.toLowerCase()) : true)
    .filter((item) => expenseFilters.category === 'all' ? true : item.category === expenseFilters.category)
    .filter((item) => {
      if (expenseFilters.type === 'all') return true
      return expenseKind(item) === expenseFilters.type
    })
    .sort((a, b) => {
      if (expenseFilters.sort === 'amount') return toNumber(b.amount) - toNumber(a.amount)
      if (expenseFilters.sort === 'category') return String(a.category).localeCompare(String(b.category), language)
      if (expenseFilters.sort === 'name') return String(a.name).localeCompare(String(b.name), language)
      return String(a.due_date || '').localeCompare(String(b.due_date || ''))
    })
  const sortedDebts = [...debts].sort((a, b) => {
    if (debtSort === 'balance') return toNumber(a.remaining_balance) - toNumber(b.remaining_balance)
    if (debtSort === 'interest') return toNumber(b.interest_rate) - toNumber(a.interest_rate)
    if (debtSort === 'payment') return toNumber(b.monthly_payment) - toNumber(a.monthly_payment)
    if (debtSort === 'end') return String(a.estimated_end_date || '').localeCompare(String(b.estimated_end_date || ''))
    return toNumber(a.priority) - toNumber(b.priority)
  })

  if (loading) {
    return <div className="loading">KlarBudget</div>
  }

  if (!hasSupabaseConfig) {
    return (
      <main className="auth-screen">
        <section className="auth-card">
          <p className="eyebrow">KlarBudget</p>
          <h1>{dictionary[language].tagline}</h1>
          <div className="notice danger">{dictionary[language].missingEnv}</div>
        </section>
      </main>
    )
  }

  if (!user) {
    return (
      <Auth
        t={t}
        email={email}
        password={password}
        setEmail={setEmail}
        setPassword={setPassword}
        onSignIn={signIn}
        onSignUp={signUp}
        error={authError}
      />
    )
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">{t('appName')}</p>
          <h1>{t('tagline')}</h1>
        </div>
        <div className="top-actions">
          <select value={language} onChange={(event) => changeLanguage(event.target.value)} aria-label="Language">
            {languages.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
          </select>
          <button type="button" className="secondary" onClick={() => supabase.auth.signOut()}>{t('signOut')}</button>
        </div>
      </header>

      <nav className="tabbar" aria-label="KlarBudget navigation">
        {navItems.map((item) => (
          <button type="button" className={view === item ? 'active' : ''} onClick={() => setView(item)} key={item}>
            {t(item)}
          </button>
        ))}
      </nav>

      <main className="content">
        {notice && <div className="toast">{notice}</div>}
        {view === 'dashboard' && (
          <Dashboard
            t={t}
            language={language}
            currency={currency}
            summary={summary}
            onNavigate={(nextView) => setView(nextView)}
          />
        )}
        {view === 'journal' && (
          <DailyJournal
            currency={currency}
            dailyClosures={dailyClosures}
            dailyBudget={summary.dailyBudget}
            entries={journalEntries}
            language={language}
            locale={locale}
            t={t}
            editing={editing.journal}
            formOpen={formOpen.journal}
            schemaReady={journalSchemaReady}
            onCloseDay={closeJournalDay}
            onDelete={deleteJournalEntry}
            onEdit={(item) => {
              setEditing((current) => ({ ...current, journal: item }))
              setFormOpen((current) => ({ ...current, journal: true }))
            }}
            onRepeat={(item) => {
              setEditing((current) => ({ ...current, journal: { ...item, id: null, entry_date: isoDate(new Date()), entry_mode: item.entry_mode || 'quick' } }))
              setFormOpen((current) => ({ ...current, journal: true }))
            }}
            onSubmit={(payload) => saveJournalEntry(payload, editing.journal?.id ? editing.journal : null)}
            onCancel={() => setEditing((current) => ({ ...current, journal: null }))}
            onToggleForm={() => setFormOpen((current) => ({ ...current, journal: !current.journal }))}
          />
        )}
        {view === 'workAbsence' && (
          <WorkAbsence
            absences={workAbsences}
            currency={currency}
            editing={editing.workAbsence}
            formOpen={formOpen.workAbsence}
            language={language}
            locale={locale}
            schemaReady={workAbsenceSchemaReady}
            t={t}
            onCancel={() => setEditing((current) => ({ ...current, workAbsence: null }))}
            onDelete={(item) => deleteRow('kb_work_absences', item)}
            onEdit={(item) => {
              setEditing((current) => ({ ...current, workAbsence: item }))
              setFormOpen((current) => ({ ...current, workAbsence: true }))
            }}
            onExport={(scope) => exportWorkAbsenceCsv(workAbsences, scope, t)}
            onStart={startWorkAbsence}
            onStop={stopWorkAbsence}
            onSubmit={(payload) => saveWorkAbsence(payload, editing.workAbsence)}
            onToggleForm={() => setFormOpen((current) => ({ ...current, workAbsence: !current.workAbsence }))}
          />
        )}
        {view === 'accounts' && (
          <>
            <section className="section">
              <div className="section-title">
                <h2>{t('accounts')}</h2>
                <button type="button" onClick={() => setFormOpen((current) => ({ ...current, accounts: true }))}>{t('addAccount')}</button>
              </div>
              <div className="mini-stats">
                <span>{t('positiveBalanceTotal')}: <strong>{formatMoney(summary.accounts.positiveTotal, currency, locale)}</strong></span>
                <span>{t('overdraftUsed')}: <strong>{formatMoney(summary.accounts.overdraftUsed, currency, locale)}</strong></span>
                <span>{t('netBalance')}: <strong>{formatMoney(summary.accounts.netBalance, currency, locale)}</strong></span>
                <span>{t('safeAvailableReal')}: <strong>{formatMoney(summary.accounts.safeAvailable, currency, locale)}</strong> <small>{t('safeAvailableHint')}</small></span>
                <span>{t('overdraftAvailable')}: <strong>{formatMoney(summary.accounts.overdraftAvailable, currency, locale)}</strong> <small>{t('overdraftAvailableHint')}</small></span>
                <span>{t('minimumReserve')}: <strong>{formatMoney(summary.accounts.minimumReserve, currency, locale)}</strong></span>
              </div>
              {(summary.accounts.overdraftUsed > 0 || summary.accounts.netBalance < 0) && (
                <div className="notice danger">
                  <strong>{t('priorityNow')}</strong>
                  <span>{summary.accounts.overdraftUsed > 0 ? t('reduceOverdraftPriority') : t('accountsNegative')}</span>
                </div>
              )}
              {summary.accounts.positiveTotal <= 0 && <div className="notice">{t('noPositiveBalanceIncluded')}</div>}
              <div className="mini-stats">
                <span>{t('balanceToday')}: <strong>{formatMoney(summary.accounts.netBalance, currency, locale)}</strong></span>
                <span>{t('balance7DaysAgo')}: <strong>{summary.accounts.balances7DaysAgo === null ? '-' : formatMoney(summary.accounts.balances7DaysAgo, currency, locale)}</strong></span>
                <span>{t('balanceDifference')}: <strong>{summary.accounts.trendDifference === null ? '-' : formatMoney(summary.accounts.trendDifference, currency, locale)}</strong></span>
              </div>
              <div className="notice">{t('bankingLater')}</div>
              {hasPossibleOverdraftDuplicate(accounts, debts) && <div className="notice danger">{t('possibleOverdraftDuplicate')}</div>}
            </section>
            <section className="section">
              <div className="section-title">
                <h2>{t('financialSettings')}</h2>
                <button type="button" onClick={saveFinancialSettings}>{t('saveSettings')}</button>
              </div>
              <p className="muted">{t('salaryFromIncomesHint')}</p>
              <div className="controls">
                <label>
                  {t('minimumReserve')}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={settingsDraft.minimum_reserve ?? 200}
                    onChange={(event) => setSettingsDraft((current) => ({ ...current, minimum_reserve: Number(event.target.value || 0) }))}
                  />
                </label>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={Boolean(settingsDraft.include_overdraft_in_debt_plan)}
                    onChange={(event) => setSettingsDraft((current) => ({ ...current, include_overdraft_in_debt_plan: event.target.checked }))}
                  />
                  {t('includeOverdraftInDebtPlan')}
                </label>
              </div>
            </section>
            {(formOpen.accounts || editing.accounts) && (
              <AccountForm
                t={t}
                initialItem={editing.accounts}
                onCancel={() => {
                  setEditing((current) => ({ ...current, accounts: null }))
                  setFormOpen((current) => ({ ...current, accounts: false }))
                }}
                onSubmit={(payload) => saveAccount(payload, editing.accounts)}
              />
            )}
            <AccountLists
              accounts={accounts}
              currency={currency}
              language={language}
              locale={locale}
              t={t}
              onEdit={(item) => {
                setEditing({ incomes: null, expenses: null, debts: null, accounts: item })
                setFormOpen((current) => ({ ...current, accounts: true }))
              }}
              onDelete={(item) => deleteRow('kb_accounts', item)}
              onQuickBalance={async (item) => {
                const value = window.prompt(t('newBalance'), item.current_balance ?? 0)
                if (value === null) return
                await saveAccount({ ...item, current_balance: value }, item)
              }}
            />
          </>
        )}
        {view === 'incomes' && (
          <>
            <section className="section">
              <div className="section-title">
                <h2>{t('incomes')}</h2>
                <button type="button" onClick={() => setFormOpen((current) => ({ ...current, incomes: true }))}>{t('addIncome')}</button>
              </div>
              <div className="summary-line">{t('totalMonthlyIncome')}: <strong>{formatMoney(summary.incomeTotal, currency, locale)}</strong></div>
            </section>
            {(formOpen.incomes || editing.incomes) && (
              <IncomeForm
                t={t}
                initialItem={editing.incomes}
                onCancel={() => {
                  setEditing((current) => ({ ...current, incomes: null }))
                  setFormOpen((current) => ({ ...current, incomes: false }))
                }}
                onSubmit={(payload) => saveRow('kb_incomes', payload, editing.incomes)}
              />
            )}
            <EntityList
              title={t('incomes')}
              items={incomes}
              currency={currency}
              language={language}
              emptyText={t('noData')}
              editText={t('edit')}
              deleteText={t('delete')}
              renderMeta={(item) => `${t(item.frequency)} - ${item.active ? t('active') : t('inactive')}${item.occurrence_date ? ` - ${item.occurrence_date}` : ''}`}
              onEdit={(item) => {
                setEditing({ incomes: item, expenses: null, debts: null })
                setFormOpen((current) => ({ ...current, incomes: true }))
              }}
              onDelete={(item) => deleteRow('kb_incomes', item)}
            />
          </>
        )}
        {view === 'expenses' && (
          <>
            <section className="section">
              <div className="section-title">
                <h2>{t('expenses')}</h2>
                <button type="button" onClick={() => setFormOpen((current) => ({ ...current, expenses: true }))}>{t('addExpense')}</button>
              </div>
              <div className="mini-stats">
                <span>{t('totalFixedMonthly')}: <strong>{formatMoney(summary.fixedTotal, currency, locale)}</strong></span>
                <span>{t('totalVariableMonthly')}: <strong>{formatMoney(summary.variableTotal, currency, locale)}</strong></span>
                <span>{t('totalOnceThisMonth')}: <strong>{formatMoney(summary.onceThisMonth, currency, locale)}</strong></span>
              </div>
              <div className="filters">
                <input value={expenseFilters.search} onChange={(event) => setExpenseFilters((current) => ({ ...current, search: event.target.value }))} placeholder={t('searchExpense')} />
                <select value={expenseFilters.category} onChange={(event) => setExpenseFilters((current) => ({ ...current, category: event.target.value }))}>
                  <option value="all">{t('allCategories')}</option>
                  {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
                <select value={expenseFilters.type} onChange={(event) => setExpenseFilters((current) => ({ ...current, type: event.target.value }))}>
                  <option value="all">{t('allTypes')}</option>
                  <option value="fixed_payment">{t('fixed_payment')}</option>
                  <option value="variable_budget">{t('variable_budget')}</option>
                  <option value="one_time_expense">{t('one_time_expense')}</option>
                </select>
                <select value={expenseFilters.sort} onChange={(event) => setExpenseFilters((current) => ({ ...current, sort: event.target.value }))}>
                  <option value="date">{t('sortByDate')}</option>
                  <option value="amount">{t('sortByAmount')}</option>
                  <option value="category">{t('sortByCategory')}</option>
                  <option value="name">{t('sortByName')}</option>
                </select>
              </div>
            </section>
            {(formOpen.expenses || editing.expenses) && (
              <ExpenseForm
                t={t}
                initialItem={editing.expenses}
                onCancel={() => {
                  setEditing((current) => ({ ...current, expenses: null }))
                  setFormOpen((current) => ({ ...current, expenses: false }))
                }}
                onSubmit={(payload) => saveRow('kb_expenses', payload, editing.expenses)}
              />
            )}
            <ExpenseLists
              currency={currency}
              expenses={filteredExpenses}
              language={language}
              locale={locale}
              settings={settings}
              journalEntries={journalEntries}
              t={t}
              onDelete={(item) => deleteRow('kb_expenses', item)}
              onEdit={(item) => {
                setEditing({ incomes: null, expenses: item, debts: null })
                setFormOpen((current) => ({ ...current, expenses: true }))
              }}
              onPaymentStatus={setExpensePaymentStatus}
            />
          </>
        )}
        {view === 'debts' && (
          <>
            <section className="section">
              <div className="section-title">
                <h2>{t('debts')}</h2>
                <button type="button" onClick={() => setFormOpen((current) => ({ ...current, debts: true }))}>{t('addDebt')}</button>
              </div>
              <select value={debtSort} onChange={(event) => setDebtSort(event.target.value)}>
                <option value="priority">{t('priority')}</option>
                <option value="balance">{t('remainingBalance')}</option>
                <option value="interest">{t('interestRate')}</option>
                <option value="payment">{t('monthlyPayment')}</option>
                <option value="end">{t('estimatedEndDate')}</option>
              </select>
            </section>
            {(formOpen.debts || editing.debts) && (
              <DebtForm
                t={t}
                initialItem={editing.debts}
                onCancel={() => {
                  setEditing((current) => ({ ...current, debts: null }))
                  setFormOpen((current) => ({ ...current, debts: false }))
                }}
                onSubmit={(payload) => saveRow('kb_debts', payload, editing.debts)}
              />
            )}
            <EntityList
              title={t('debts')}
              items={sortedDebts}
              currency={currency}
              language={language}
              emptyText={t('noData')}
              editText={t('edit')}
              deleteText={t('delete')}
              renderMeta={(item) => {
                const category = debtCategories.find(([value]) => value === item.debt_category)?.[1] ?? item.debt_category ?? '-'
                const paidPercent = toNumber(item.initial_amount) > 0 ? Math.round(((toNumber(item.initial_amount) - toNumber(item.remaining_balance)) / toNumber(item.initial_amount)) * 100) : 0
                const finalPaymentText = toNumber(item.final_payment) > 0 ? ` - ${t('finalPayment')}: ${formatMoney(item.final_payment, currency, locale)} - ${t('totalToPay')}: ${formatMoney(debtRemainingTotal(item), currency, locale)}` : ''
                return `${category} - ${t(item.status)} - ${item.interest_rate || 0}% - ${t('monthlyPayment')}: ${item.monthly_payment || 0}${finalPaymentText} - ${Math.max(0, paidPercent)}%`
              }}
              onEdit={(item) => {
                setEditing({ incomes: null, expenses: null, debts: item })
                setFormOpen((current) => ({ ...current, debts: true }))
              }}
              onDelete={(item) => deleteRow('kb_debts', item)}
              renderActions={(item) => toNumber(item.monthly_payment) <= 0 ? <span className="badge danger">{t('noMonthlyPayment')}</span> : null}
            />
          </>
        )}
        {view === 'plan' && (
          <DebtPlan t={t} language={language} currency={currency} debts={debts} settings={settings} onSettingsChange={updateSettings} />
        )}
        {view === 'calendar' && (
          <PaymentCalendar t={t} language={language} currency={currency} expenses={expenses} settings={settings} paymentStatuses={paymentStatuses} onPaymentStatus={setExpensePaymentStatus} onEdit={(item) => {
            setView('expenses')
            setEditing({ incomes: null, expenses: item, debts: null })
            setFormOpen((current) => ({ ...current, expenses: true }))
          }} />
        )}
        {view === 'insights' && <Insights t={t} insights={insights} />}
        {view === 'aiActions' && (
          <AIActionPanel
            t={t}
            language={language}
            currency={currency}
            summary={summary}
            incomes={incomes}
            expenses={expenses}
            debts={debts}
            settings={settings}
            paymentStatuses={paymentStatuses}
            journalEntries={journalEntries}
          />
        )}
      </main>
    </div>
  )
}

function ExpenseLists({ currency, expenses, journalEntries = [], language, locale, settings, t, onDelete, onEdit, onPaymentStatus }) {
  const fixed = expenses.filter((item) => expenseKind(item) === 'fixed_payment')
  const variable = expenses.filter((item) => expenseKind(item) === 'variable_budget')
  const once = expenses.filter((item) => expenseKind(item) === 'one_time_expense')

  return (
    <>
      <EntityList
        title={t('fixedPayments')}
        items={fixed}
        currency={currency}
        language={language}
        emptyText={t('noData')}
        editText={t('edit')}
        deleteText={t('delete')}
        renderMeta={(item) => `${item.category} - ${t(item.frequency)}${item.due_date ? ` - ${t('payment')}: ${item.due_date}` : ''} - ${t(item.payment_mode || 'automatic_debit')}${toNumber(item.amount) >= toNumber(settings.large_payment_threshold) ? ` - ${t('largePayment')}` : ''}`}
        onEdit={onEdit}
        onDelete={onDelete}
        renderActions={(item) => (item.payment_mode === 'manual_payment'
          ? <button type="button" className="ghost" onClick={() => onPaymentStatus(item, 'paid')}>{t('markPaid')}</button>
          : null)}
      />
      <EntityList
        title={t('variableBudgets')}
        items={variable}
        currency={currency}
        language={language}
        emptyText={t('noData')}
        editText={t('edit')}
        deleteText={t('delete')}
        renderMeta={(item) => {
          const stats = variableBudgetStats(item, new Date(), journalEntries)
          return `${item.category} - ${t('monthlyBudget')}: ${formatMoney(stats.budget, currency, locale)} - ${t('spentThisMonth')}: ${formatMoney(stats.spent, currency, locale)} - ${t('remainingBudget')}: ${formatMoney(stats.remaining, currency, locale)} - ${t('dailyBudget')}: ${formatMoney(stats.dailyRemaining, currency, locale)}/${t('day')}`
        }}
        onEdit={onEdit}
        onDelete={onDelete}
      />
      <EntityList
        title={t('oneTimeExpenses')}
        items={once}
        currency={currency}
        language={language}
        emptyText={t('noData')}
        editText={t('edit')}
        deleteText={t('delete')}
        renderMeta={(item) => `${item.category}${item.due_date ? ` - ${item.due_date}` : ''}${toNumber(item.amount) >= toNumber(settings.large_payment_threshold) ? ` - ${t('largePayment')}` : ''}`}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </>
  )
}

function DailyJournal({ currency, dailyBudget, dailyClosures, editing, entries, formOpen, language, locale, schemaReady, t, onCancel, onCloseDay, onDelete, onEdit, onRepeat, onSubmit, onToggleForm }) {
  const today = isoDate(new Date())
  const todayEntries = entries.filter((item) => item.entry_date === today)
  const todayTotal = todayEntries.reduce((sum, item) => sum + toNumber(item.amount), 0)
  const closedToday = dailyClosures.find((item) => item.closure_date === today)
  const recentEntries = entries.slice(0, 30)
  const priceRows = buildPriceRows(entries, currency, locale, t)
  const remainingToday = toNumber(dailyBudget) - todayTotal
  const topCategory = topJournalCategory(todayEntries)

  return (
    <>
      <section className="section">
        <div className="section-title">
          <h2>{t('dailyJournal')}</h2>
          <button type="button" onClick={onToggleForm}>{formOpen ? t('hideForm') : t('addJournalEntry')}</button>
        </div>
        {!schemaReady && <div className="notice danger">{t('journalMigrationMissing')}</div>}
        <div className="mini-stats">
          <span>{t('todayTotal')}: <strong>{formatMoney(todayTotal, currency, locale)}</strong></span>
          <span>{t('entriesToday')}: <strong>{todayEntries.length}</strong></span>
          <span>{t('dayStatus')}: <strong>{closedToday ? t('dayClosedShort') : t('dayOpen')}</strong></span>
          <span>{t('recommendedBudgetToday')}: <strong>{formatMoney(dailyBudget, currency, locale)}</strong></span>
          <span>{t('remainingToday')}: <strong>{formatMoney(remainingToday, currency, locale)}</strong></span>
        </div>
        <div className={`notice ${remainingToday < 0 ? 'danger' : ''}`}>
          {remainingToday < 0
            ? t('dailyBudgetExceeded').replace('{amount}', formatMoney(Math.abs(remainingToday), currency, locale))
            : t('dailyBudgetLeft').replace('{amount}', formatMoney(remainingToday, currency, locale))}
        </div>
        {closedToday && (
          <div className="notice">
            <strong>{t('dayClosedSummary')}</strong>
            <span>{t('todayTotal')}: {formatMoney(todayTotal, currency, locale)}</span>
            <span>{t('entriesToday')}: {todayEntries.length}</span>
            <span>{t('mainCategory')}: {topCategory || '-'}</span>
            <span>{remainingToday >= 0
              ? t('underBudgetBy').replace('{amount}', formatMoney(remainingToday, currency, locale))
              : t('overBudgetBy').replace('{amount}', formatMoney(Math.abs(remainingToday), currency, locale))}</span>
          </div>
        )}
        <div className="form-actions">
          <button type="button" onClick={() => onCloseDay(today)}>{closedToday ? t('reopenDay') : t('closeDay')}</button>
        </div>
      </section>

      {formOpen && !closedToday && (
        <JournalEntryForm
          t={t}
          initialItem={editing}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />
      )}
      {formOpen && closedToday && <div className="notice danger">{t('journalDayClosedBlocked')}</div>}

      <EntityList
        title={t('todayEntries')}
        items={todayEntries}
        currency={currency}
        language={language}
        emptyText={t('noData')}
        editText={t('edit')}
        deleteText={t('delete')}
        renderMeta={(item) => `${item.category} - ${item.store || t('noStore')} - ${t(item.person)}${item.product_name ? ` - ${t('productName')}: ${item.product_name}` : ''}`}
        onEdit={onEdit}
        onDelete={onDelete}
      />

      <EntityList
        title={t('recentJournalEntries')}
        items={recentEntries}
        currency={currency}
        language={language}
        emptyText={t('noData')}
        editText={t('edit')}
        deleteText={t('delete')}
        renderMeta={(item) => `${item.entry_date} - ${item.category} - ${item.store || t('noStore')}`}
        onEdit={onEdit}
        onDelete={onDelete}
        renderActions={(item) => <button type="button" className="ghost" onClick={() => onRepeat(item)}>{t('repeat')}</button>}
      />

      <section className="section">
        <h2>{t('priceHistory')}</h2>
        <div className="list">
          {priceRows.length === 0 ? <div className="empty">{t('noData')}</div> : priceRows.map((row) => (
            <article className="list-item" key={row.product}>
              <div>
                <strong>{row.product}</strong>
                <span>{row.summary}</span>
                <span>{row.unitComparison ? t('unitComparison') : t('totalPriceComparison')}</span>
              </div>
              <div className="list-value">
                <b>{row.change >= 0 ? '+' : ''}{row.change.toFixed(1)}%</b>
                <span>{row.bestStore || t('noStore')}</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  )
}

function WorkAbsence({ absences, currency, editing, formOpen, language, locale, schemaReady, t, onCancel, onDelete, onEdit, onExport, onStart, onStop, onSubmit, onToggleForm }) {
  const [, setTick] = useState(0)
  const active = absences.find((item) => item.is_active)
  const monthlyStats = workAbsenceStats(absences, 'month')
  const yearlyStats = workAbsenceStats(absences, 'year')
  const recentAbsences = absences.slice(0, 30).map((item) => ({
    ...item,
    name: item.work_date,
    amount: item.estimated_allowance,
  }))

  useEffect(() => {
    if (!active) return undefined
    const timer = window.setInterval(() => setTick((current) => current + 1), 60_000)
    return () => window.clearInterval(timer)
  }, [active])

  return (
    <>
      <section className="section">
        <div className="section-title">
          <div>
            <h2>{t('workAbsence')}</h2>
            <p className="muted">{t('workAbsenceSubtitle')}</p>
          </div>
          <button type="button" onClick={onToggleForm}>{formOpen ? t('hideForm') : t('workAbsenceManualAdd')}</button>
        </div>
        {!schemaReady && <div className="notice danger">{t('workAbsenceMigrationMissing')}</div>}
        <div className="work-start-card">
          {active ? (
            <>
              <div>
                <strong>{t('workAbsenceActive')}</strong>
                <span>{active.work_date} · {active.start_time?.slice(0, 5)} · {formatDuration(minutesSinceStart(active.start_time))}</span>
              </div>
              <button type="button" className="danger-ghost" onClick={() => onStop(active)}>{t('stopWorkAbsence')}</button>
            </>
          ) : (
            <>
              <div>
                <strong>{t('noActiveWorkAbsence')}</strong>
                <span>{t('workAbsenceNoGps')}</span>
              </div>
              <button type="button" disabled={!schemaReady} onClick={onStart}>{t('startWorkAbsence')}</button>
            </>
          )}
        </div>
      </section>

      <section className="section">
        <div className="section-title">
          <h2>{t('workAbsenceReport')}</h2>
          <div className="button-pair">
            <button type="button" className="secondary" onClick={() => onExport('month')}>{t('exportCsvMonth')}</button>
            <button type="button" className="secondary" onClick={() => onExport('year')}>{t('exportCsvYear')}</button>
          </div>
        </div>
        <div className="metric-grid compact">
          <Metric t={t} label="workDaysRegisteredMonth" value={monthlyStats.registeredDays} />
          <Metric t={t} label="workDaysOver8Month" value={monthlyStats.eligibleDays} />
          <Metric t={t} label="workAllowanceMonth" value={formatMoney(monthlyStats.allowance, currency, locale)} />
          <Metric t={t} label="workHoursMonth" value={formatDuration(monthlyStats.durationMinutes)} />
          <Metric t={t} label="workDaysOver8Year" value={yearlyStats.eligibleDays} />
          <Metric t={t} label="workAllowanceYear" value={formatMoney(yearlyStats.allowance, currency, locale)} />
        </div>
        <div className="notice">{language === 'de' ? t('workTaxDisclaimerDe') : t('workTaxDisclaimer')}</div>
      </section>

      {formOpen && (
        <WorkAbsenceForm
          t={t}
          initialItem={editing}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />
      )}

      <EntityList
        title={t('workAbsenceRecent')}
        items={recentAbsences}
        currency={currency}
        language={language}
        emptyText={t('noData')}
        editText={t('edit')}
        deleteText={t('delete')}
        renderMeta={(item) => [
          item.object_name || item.location || '-',
          `${item.start_time?.slice(0, 5)} - ${item.end_time ? item.end_time.slice(0, 5) : t('active')}`,
          formatDuration(toNumber(item.duration_minutes)),
          item.eligible_over_8h ? t('estimatedAllowance14') : t('under8h'),
          item.confirmed ? t('confirmed') : t('notConfirmed'),
        ].filter(Boolean).join(' - ')}
        onEdit={onEdit}
        onDelete={onDelete}
        renderActions={(item) => (
          <div className="badge-row">
            <span className={`badge ${item.eligible_over_8h ? '' : 'danger'}`}>{item.eligible_over_8h ? t('over8h') : t('under8h')}</span>
            <span className="badge">{t(item.entry_source || 'manual')}</span>
          </div>
        )}
      />
    </>
  )
}

function Metric({ t, label, value }) {
  return (
    <article className="metric-card neutral">
      <span>{t(label)}</span>
      <strong>{value}</strong>
    </article>
  )
}

function AccountLists({ accounts, currency, language, locale, t, onDelete, onEdit, onQuickBalance }) {
  return (
    <EntityList
      title={t('accounts')}
      items={accounts}
      currency={currency}
      language={language}
      emptyText={t('noData')}
      editText={t('edit')}
      deleteText={t('delete')}
      renderMeta={(item) => {
        const balance = toNumber(item.current_balance)
        const overdraftUsed = Math.max(0, -balance)
        const negativeLabel = item.account_type === 'credit_card' ? 'cardCreditUsed' : 'inOverdraft'
        const overdraftAvailable = Math.max(0, toNumber(item.overdraft_limit) - overdraftUsed)
        return [
          t(item.account_type),
          balance < 0 ? `${t(negativeLabel)}: ${formatMoney(overdraftUsed, item.currency || currency, locale)}` : t('positiveBalance'),
          item.has_overdraft ? `${t('overdraftAvailable')}: ${formatMoney(overdraftAvailable, item.currency || currency, locale)}` : '',
          item.include_in_safe_balance === false ? t('excludedFromSafeBalance') : '',
          item.updated_at ? `${t('updatedAt')}: ${new Date(item.updated_at).toLocaleDateString(locale)}` : '',
        ].filter(Boolean).join(' - ')
      }}
      onEdit={onEdit}
      onDelete={onDelete}
      renderActions={(item) => (
        <>
          <button type="button" className="ghost" onClick={() => onQuickBalance(item)}>{t('quickBalanceUpdate')}</button>
          {toNumber(item.current_balance) < 0 && <span className="badge danger">{t(item.account_type === 'credit_card' ? 'cardCreditUsed' : 'inOverdraft')}</span>}
          {item.include_in_safe_balance === false && <span className="badge">{t('excludedFromSafeBalance')}</span>}
        </>
      )}
    />
  )
}

function preparePayload(payload) {
  const numberFields = ['amount', 'initial_amount', 'remaining_balance', 'final_payment', 'monthly_payment', 'interest_rate', 'priority', 'current_balance', 'overdraft_limit', 'overdraft_interest', 'quantity', 'unit_price']
  const dateFields = ['occurrence_date', 'due_date', 'estimated_end_date', 'entry_date']
  const result = { ...payload }

  numberFields.forEach((field) => {
    if (field in result) result[field] = result[field] === '' ? 0 : Number(result[field])
  })
  if ('unit_price' in payload && (payload.unit_price === '' || payload.unit_price === null || payload.unit_price === undefined)) {
    result.unit_price = null
  }
  dateFields.forEach((field) => {
    if (field in result && !result[field]) result[field] = null
  })

  if ('expense_kind' in result) {
    if (result.expense_kind === 'variable_budget') {
      result.frequency = 'monthly'
      result.expense_type = 'variable'
      result.payment_mode = 'variable_tracking'
      result.due_date = null
    }
    if (result.expense_kind === 'one_time_expense') {
      result.frequency = 'once'
      result.expense_type = 'variable'
      result.payment_mode = 'manual_payment'
    }
    if (result.expense_kind === 'fixed_payment') {
      result.expense_type = 'fixed'
      if (result.payment_mode === 'variable_tracking') result.payment_mode = 'automatic_debit'
    }
  }

  return result
}

function inferProductName(description = '') {
  return String(description)
    .replace(/\d+([.,]\d+)?\s*(eur|euro|€)/gi, '')
    .trim()
}

function buildPriceRows(entries, currency = 'EUR', locale = 'ro-RO', t = (key) => key) {
  const byProduct = new Map()
  entries
    .filter((item) => item.product_name && toNumber(item.amount) > 0)
    .forEach((item) => {
      const key = item.product_name.trim().toLowerCase()
      if (!byProduct.has(key)) byProduct.set(key, [])
      byProduct.get(key).push(item)
    })

  return [...byProduct.entries()].map(([product, rows]) => {
    const sorted = [...rows].sort((a, b) => String(a.entry_date).localeCompare(String(b.entry_date)))
    const enriched = sorted.map((item) => ({ ...item, unitInfo: normalizedUnitPrice(item) }))
    const comparable = enriched.filter((item) => item.unitInfo)
    const sourceRows = comparable.length >= 2 ? comparable : enriched
    const valueOf = (item) => item.unitInfo?.price ?? toNumber(item.amount)
    const minRow = sourceRows.reduce((min, item) => valueOf(item) < valueOf(min) ? item : min, sourceRows[0])
    const maxRow = sourceRows.reduce((max, item) => valueOf(item) > valueOf(max) ? item : max, sourceRows[0])
    const first = valueOf(sourceRows[0])
    const lastRow = sourceRows[sourceRows.length - 1]
    const last = valueOf(lastRow)
    const unitComparison = comparable.length >= 2
    const unitLabel = lastRow.unitInfo?.unit
    return {
      product,
      min: valueOf(minRow),
      max: valueOf(maxRow),
      last,
      change: first > 0 ? ((last - first) / first) * 100 : 0,
      bestStore: lastRow.store || minRow.store,
      unitComparison,
      summary: unitComparison
        ? `${tMoney(t('lastObservedPrice'), last, currency, locale)}/${unitLabel} - ${tMoney(t('lowestObservedPrice'), valueOf(minRow), currency, locale)}/${unitLabel} - ${tMoney(t('highestObservedPrice'), valueOf(maxRow), currency, locale)}/${unitLabel}`
        : `${tMoney(t('lastObservedPrice'), last, currency, locale)} - ${tMoney(t('lowestObservedPrice'), valueOf(minRow), currency, locale)} - ${tMoney(t('highestObservedPrice'), valueOf(maxRow), currency, locale)}`,
    }
  }).sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 10)
}

function normalizedUnitPrice(item) {
  const amount = toNumber(item.amount)
  const quantity = toNumber(item.quantity)
  const unit = String(item.unit || '').trim().toLowerCase()
  if (!item.product_name || !amount || !quantity || !unit) return null
  if (unit === 'g') return { price: amount / (quantity / 1000), unit: 'kg' }
  if (unit === 'ml') return { price: amount / (quantity / 1000), unit: 'L' }
  return { price: toNumber(item.unit_price) || amount / quantity, unit }
}

function tMoney(label, value, currency, locale) {
  return `${label}: ${formatMoney(value, currency, locale)}`
}

function topJournalCategory(entries) {
  const totals = new Map()
  entries.forEach((item) => {
    totals.set(item.category, (totals.get(item.category) || 0) + toNumber(item.amount))
  })
  return [...totals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
}

function hasPossibleOverdraftDuplicate(accounts, debts) {
  const hasNegativeAccount = accounts.some((account) => toNumber(account.current_balance) < 0)
  const hasDispoDebt = debts.some((debt) => debt.status === 'active' && /dispo|overdraft/i.test(`${debt.name} ${debt.debt_category}`))
  return hasNegativeAccount && hasDispoDebt
}

function cleanAccountPayload(payload) {
  return {
    name: payload.name,
    account_type: payload.account_type,
    current_balance: payload.current_balance,
    currency: payload.currency,
    include_in_safe_balance: payload.include_in_safe_balance,
    has_overdraft: payload.has_overdraft,
    overdraft_limit: payload.overdraft_limit,
    overdraft_interest: payload.overdraft_interest,
    notes: payload.notes,
  }
}

function normalizeWorkAbsencePayload(payload) {
  const duration = payload.end_time ? calculateWorkDuration(payload.start_time, payload.end_time, payload.break_minutes) : null
  const eligible = duration !== null && duration > 8 * 60
  return {
    work_date: payload.work_date || isoDate(new Date()),
    start_time: payload.start_time,
    end_time: payload.end_time || null,
    duration_minutes: duration,
    location: payload.location || null,
    object_name: payload.object_name || null,
    work_reason: payload.work_reason || null,
    kilometers: payload.kilometers === '' || payload.kilometers === null || payload.kilometers === undefined ? null : Number(payload.kilometers),
    break_minutes: Number(payload.break_minutes || 0),
    entry_source: payload.entry_source || 'manual',
    is_active: Boolean(payload.is_active && !payload.end_time),
    eligible_over_8h: eligible,
    estimated_allowance: eligible ? 14 : 0,
    notes: payload.notes || null,
    confirmed: Boolean(payload.confirmed),
  }
}

function calculateWorkDuration(startTime, endTime, breakMinutes = 0) {
  const start = timeToMinutes(startTime)
  const end = timeToMinutes(endTime)
  if (start === null || end === null) return null
  const raw = end >= start ? end - start : end + 24 * 60 - start
  return Math.max(0, raw - Number(breakMinutes || 0))
}

function timeToMinutes(value) {
  if (!value) return null
  const [hours, minutes] = String(value).split(':').map(Number)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null
  return hours * 60 + minutes
}

function timeValue(date = new Date()) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function minutesSinceStart(startTime) {
  const start = timeToMinutes(startTime)
  const now = timeToMinutes(timeValue(new Date()))
  if (start === null || now === null) return 0
  return now >= start ? now - start : now + 24 * 60 - start
}

function formatDuration(minutes = 0) {
  const clean = Math.max(0, Math.round(toNumber(minutes)))
  const hours = Math.floor(clean / 60)
  const rest = clean % 60
  return `${hours}h ${String(rest).padStart(2, '0')}m`
}

function workAbsenceStats(absences, scope) {
  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const year = String(now.getFullYear())
  const rows = absences.filter((item) => {
    if (scope === 'month') return String(item.work_date || '').startsWith(month)
    return String(item.work_date || '').startsWith(year)
  })
  const eligibleRows = rows.filter((item) => item.eligible_over_8h)
  return {
    registeredDays: rows.length,
    eligibleDays: eligibleRows.length,
    allowance: eligibleRows.reduce((sum, item) => sum + toNumber(item.estimated_allowance), 0),
    durationMinutes: rows.reduce((sum, item) => sum + toNumber(item.duration_minutes), 0),
    rows,
  }
}

function exportWorkAbsenceCsv(absences, scope, t) {
  const stats = workAbsenceStats(absences, scope)
  const rows = [
    ['Datum', 'Abfahrt Wohnung', 'Rueckkehr Wohnung', 'Abwesenheitsdauer', 'Einsatzort / Objekt', 'Anlass', 'Kilometer', '> 8 Stunden', 'Verpflegungspauschale geschaetzt', 'Erfassung', 'Bemerkung'],
    ...stats.rows.map((item) => [
      item.work_date,
      item.start_time?.slice(0, 5) || '',
      item.end_time?.slice(0, 5) || '',
      formatDuration(item.duration_minutes),
      [item.object_name, item.location].filter(Boolean).join(' / '),
      item.work_reason || '',
      item.kilometers ?? '',
      item.eligible_over_8h ? 'Ja' : 'Nein',
      toNumber(item.estimated_allowance).toFixed(2),
      item.entry_source === 'automatic' ? 'automatisch' : 'manuell',
      item.notes || '',
    ]),
    [],
    ['Summe Tage > 8h', stats.eligibleDays],
    ['Summe geschaetzte Pauschale', stats.allowance.toFixed(2)],
    [],
    [t('workTaxDisclaimerDe')],
  ]
  const csv = rows.map((row) => row.map(csvCell).join(';')).join('\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `klarbudget-arbeitsweg-${scope}-${isoDate(new Date())}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function csvCell(value) {
  const text = String(value ?? '')
  return `"${text.replaceAll('"', '""')}"`
}

export default App
