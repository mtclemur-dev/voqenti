import { useCallback, useEffect, useMemo, useState } from 'react'
import { Auth } from './components/Auth'
import { Dashboard } from './components/Dashboard'
import { AccountForm, DebtForm, ExpenseForm, IncomeForm, JournalEntryForm, WorkAbsenceForm, UtilityReadingForm } from './components/Forms'
import { EntityList } from './components/EntityList'
import { DebtPlan } from './components/DebtPlan'
import { PaymentCalendar } from './components/PaymentCalendar'
import { Insights } from './components/Insights'
import { AIActionPanel } from './components/AIActionPanel'
import { KidsZone } from './components/KidsZone'
import { DashboardFamily } from './components/DashboardFamily'
import { FamilyPayments } from './components/FamilyPayments'
import { FamilyFood } from './components/FamilyFood'
import { Pantry } from './components/Pantry'
import { SmartShopping } from './components/SmartShopping'
import { inferOfferCategory, normalizeOfferPayload, normalizeProduct } from './lib/shoppingHelpers'
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
  utility_price_electricity: 0.35,
  utility_price_gas: 1.20,
  utility_price_water: 4.50,
  utility_monthly_payment_electricity: 0,
  utility_monthly_payment_gas: 0,
  utility_monthly_payment_water: 0,
}

// const navItems = ['dashboard', 'journal', 'shopping', 'workAbsence', 'accounts', 'incomes', 'expenses', 'debts', 'calendar', 'insights', 'aiActions', 'kids']

const BUILD_LABEL = 'KlarBudget build 2026-06-08 19:09 fix-priority-journal'

function App() {
  const [language, setLanguage] = useState(localStorage.getItem('klarbudget-language') || 'ro')
  const [user, setUser] = useState(null)
  const [familyOwnerId, setFamilyOwnerId] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [accountRole, setAccountRole] = useState('parent')
  const [childName, setChildName] = useState('')
  const [profileAccountRole, setProfileAccountRole] = useState('parent')
  const [authError, setAuthError] = useState('')
  const [loading, setLoading] = useState(true)
  const [profileUser, setProfileUser] = useState(() => {
    return localStorage.getItem('klarbudget-profile-user') || 'Victor'
  })
  const [familyMode, setFamilyMode] = useState(() => {
    const saved = localStorage.getItem('klarbudget-family-mode')
    return saved !== null ? saved === 'true' : true
  })
  const [view, setView] = useState(() => {
    const isDoinaStr = localStorage.getItem('klarbudget-profile-user') === 'Doina'
    const savedFamilyMode = localStorage.getItem('klarbudget-family-mode')
    const startInFamilyMode = savedFamilyMode !== null ? savedFamilyMode === 'true' : true
    return (isDoinaStr || startInFamilyMode) ? 'dashboard_family' : 'dashboard'
  })
  const [quickSpendOpen, setQuickSpendOpen] = useState(false)
  const [quickSpendForm, setQuickSpendForm] = useState({ amount: '', category: 'mâncare', store: '', person: 'family', notes: '' })
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
  const [shoppingList, setShoppingList] = useState([])
  const [weeklyOffers, setWeeklyOffers] = useState([])
  const [stores, setStores] = useState([])
  const [offerSources, setOfferSources] = useState([])
  const [shoppingSchemaReady, setShoppingSchemaReady] = useState(true)
  const [utilityReadings, setUtilityReadings] = useState([])
  const [utilitySchemaReady, setUtilitySchemaReady] = useState(true)
  const [pantryItems, setPantryItems] = useState([])
  const [settings, setSettings] = useState(defaultSettings)
  const [settingsDraft, setSettingsDraft] = useState(defaultSettings)
  const [currency, setCurrency] = useState('EUR')
  const [editing, setEditing] = useState({ incomes: null, expenses: null, debts: null, accounts: null, journal: null, workAbsence: null, utilityReading: null })
  const [formOpen, setFormOpen] = useState({ incomes: false, expenses: false, debts: false, accounts: false, journal: true, workAbsence: false, utilityReading: false })
  const [notice, setNotice] = useState('')
  const [expenseFilters, setExpenseFilters] = useState({ search: '', category: 'all', type: 'all', sort: 'date' })
  const [debtSort, setDebtSort] = useState('priority')
  const [shoppingTab, setShoppingTab] = useState('import')
  const [offerPreview, setOfferPreview] = useState([])
  // eslint-disable-next-line no-unused-vars
  const [priceHistory, setPriceHistory] = useState([])
  const [receipts, setReceipts] = useState([])
  const [receiptItems, setReceiptItems] = useState([])

  const t = useMemo(() => makeTranslator(language), [language])

  const isDoinaUser = user?.email?.toLowerCase().includes('doina')
  const isSimpleModeForced = isDoinaUser
  const activeFamilyMode = isSimpleModeForced ? true : familyMode
  const activeProfileUser = isSimpleModeForced ? 'Doina' : profileUser
  const dbUserId = familyOwnerId || user?.id

  useEffect(() => {
    localStorage.setItem('klarbudget-language', language)
  }, [language])

  useEffect(() => {
    localStorage.setItem('klarbudget-profile-user', profileUser)
  }, [profileUser])

  useEffect(() => {
    localStorage.setItem('klarbudget-family-mode', familyMode ? 'true' : 'false')
  }, [familyMode])

  useEffect(() => {
    setQuickSpendForm((prev) => ({
      ...prev,
      person: activeProfileUser === 'Doina' ? 'doina' : 'family'
    }))
  }, [activeProfileUser])

  useEffect(() => {
    if (!user) {
      setFamilyOwnerId(null)
      return
    }
    setLoading(true)
    supabase
      .from('kb_family_members')
      .select('family_owner_user_id')
      .eq('email', user.email)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.family_owner_user_id) {
          setFamilyOwnerId(data.family_owner_user_id)
        } else {
          setFamilyOwnerId(user.id)
        }
      })
      .catch(() => {
        setFamilyOwnerId(user.id)
      })
  }, [user])

  useEffect(() => {
    if (!hasSupabaseConfig) {
      setLoading(false)
      return
    }

    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user ?? null
      setUser(u)
      if (!u) {
        setLoading(false)
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null
      setUser(u)
      if (!u) {
        setLoading(false)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  const loadData = useCallback(async () => {
    if (!user || !familyOwnerId) return
    setLoading(true)

    const [profileRes, incomesRes, expensesRes, debtsRes, paymentsRes, settingsRes, accountsRes, snapshotsRes, journalRes, closuresRes, workAbsencesRes, shoppingListRes, offersRes, storesRes, sourcesRes, priceHistoryRes, receiptsRes, receiptItemsRes, utilityReadingsRes, pantryRes] = await Promise.all([
      supabase.from('kb_profiles').select('*').eq('id', user.id).maybeSingle(),
      supabase.from('kb_incomes').select('*').eq('user_id', familyOwnerId).order('created_at', { ascending: false }),
      supabase.from('kb_expenses').select('*').eq('user_id', familyOwnerId).order('created_at', { ascending: false }),
      supabase.from('kb_debts').select('*').eq('user_id', familyOwnerId).order('priority', { ascending: true }),
      supabase.from('kb_payment_status').select('*').eq('user_id', familyOwnerId).order('due_date', { ascending: true }),
      supabase.from('kb_settings').select('*').eq('user_id', familyOwnerId).maybeSingle(),
      supabase.from('kb_accounts').select('*').eq('user_id', familyOwnerId).order('updated_at', { ascending: false }),
      supabase.from('kb_account_snapshots').select('*').eq('user_id', familyOwnerId).order('snapshot_date', { ascending: false }),
      supabase.from('kb_daily_entries').select('*').eq('user_id', familyOwnerId).order('entry_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('kb_daily_closures').select('*').eq('user_id', familyOwnerId).order('closure_date', { ascending: false }),
      supabase.from('kb_work_absences').select('*').eq('user_id', familyOwnerId).order('work_date', { ascending: false }).order('start_time', { ascending: false }),
      supabase.from('kb_shopping_list').select('*').eq('user_id', familyOwnerId).order('created_at', { ascending: false }),
      supabase.from('kb_weekly_offers').select('*').eq('user_id', familyOwnerId).eq('status', 'confirmed').order('valid_until', { ascending: false }),
      supabase.from('kb_stores').select('*').eq('user_id', familyOwnerId).order('name', { ascending: true }),
      supabase.from('kb_offer_sources').select('*').eq('user_id', familyOwnerId).order('created_at', { ascending: false }),
      supabase.from('kb_price_history').select('*').eq('user_id', familyOwnerId).order('recorded_at', { ascending: false }),
      supabase.from('kb_receipts').select('*').eq('user_id', familyOwnerId).order('purchase_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('kb_receipt_items').select('*').eq('user_id', familyOwnerId).order('created_at', { ascending: false }),
      supabase.from('kb_utility_readings').select('*').eq('user_id', familyOwnerId).order('reading_date', { ascending: false }),
      supabase.from('kb_pantry_items').select('*').eq('user_id', familyOwnerId).eq('active', true).order('created_at', { ascending: false }),
    ])

    const metadataRole = user.user_metadata?.account_role === 'child' ? 'child' : 'parent'
    if (!profileRes.data) {
      const baseProfile = { id: user.id, preferred_language: language, currency: 'EUR' }
      const { error } = await supabase.from('kb_profiles').insert({ ...baseProfile, account_role: metadataRole })
      if (error && /account_role/i.test(error.message || '')) {
        await supabase.from('kb_profiles').insert(baseProfile)
      }
      setProfileAccountRole(metadataRole)
    } else {
      setCurrency(profileRes.data.currency || 'EUR')
      setLanguage(profileRes.data.preferred_language || language)
      setProfileAccountRole(profileRes.data.account_role || metadataRole)
    }

    if (!settingsRes.data) {
      const { data } = await supabase
        .from('kb_settings')
        .insert({
          user_id: familyOwnerId,
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
    setShoppingList(shoppingListRes.data || [])
    setWeeklyOffers(offersRes.data || [])
    setStores(storesRes.data || [])
    setOfferSources(sourcesRes.data || [])
    setPriceHistory(priceHistoryRes.data || [])
    setReceipts(receiptsRes.data || [])
    setReceiptItems(receiptItemsRes.data || [])
    setShoppingSchemaReady(!shoppingListRes.error && !offersRes.error && !storesRes.error && !sourcesRes.error && !receiptsRes.error && !receiptItemsRes.error)
    setUtilityReadings(utilityReadingsRes.data || [])
    setUtilitySchemaReady(!utilityReadingsRes.error)
    setPantryItems(pantryRes?.data || [])
    setLoading(false)
  }, [language, user, familyOwnerId])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Automatic shopping refresh is disabled. It was reloading the app while typing in forms.

  const summary = useMemo(
    () => calculateSummary({ incomes, expenses, debts, settings, paymentStatuses, accounts, accountSnapshots, journalEntries }),
    [incomes, expenses, debts, settings, paymentStatuses, accounts, accountSnapshots, journalEntries],
  )

  const insights = useMemo(
    () => buildInsights({ summary, incomes, expenses, debts, settings, paymentStatuses, t, language, currency }),
    [summary, incomes, expenses, debts, settings, paymentStatuses, t, language, currency],
  )

  // Active offers today (for Pantry badge and recommendations)
  const activeOffers = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return weeklyOffers.filter((o) => {
      if (!o.valid_from && !o.valid_until) return false
      const from = o.valid_from ? new Date(o.valid_from) : null
      const until = o.valid_until ? new Date(o.valid_until) : null
      if (from) { from.setHours(0,0,0,0); if (today < from) return false }
      if (until) { until.setHours(0,0,0,0); if (today > until) return false }
      return true
    })
  }, [weeklyOffers])

  // Pantry stats for DashboardFamily card
  const pantryStats = useMemo(() => {
    if (!pantryItems.length) return null
    const today = new Date(); today.setHours(0,0,0,0)
    const in30 = new Date(today); in30.setDate(in30.getDate() + 30)
    let belowMin = 0, expiringSoon = 0, buyOnOffer = 0
    pantryItems.forEach((item) => {
      const qty = Number(item.quantity) || 0
      const minQty = Number(item.min_quantity) || 1
      if (qty < minQty) belowMin++
      if (item.expiry_date) {
        const ex = new Date(item.expiry_date); ex.setHours(0,0,0,0)
        if (ex >= today && ex <= in30) expiringSoon++
      }
      if (item.buy_on_offer) buyOnOffer++
    })
    return { belowMin, expiringSoon, buyOnOffer, total: pantryItems.length }
  }, [pantryItems])

  const signIn = async () => {
    setAuthError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setAuthError(error.message)
  }

  const signUp = async () => {
    setAuthError('')
    const cleanChildName = childName.trim()
    if (accountRole === 'child' && !cleanChildName) {
      setAuthError('Scrie numele copilului pentru contul de copil.')
      return
    }
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          account_role: accountRole,
          child_name: accountRole === 'child' ? cleanChildName : null,
        },
      },
    })
    if (error) setAuthError(error.message)
  }

  const saveRow = async (table, payload, currentItem = null) => {
    const prepared = preparePayload(payload)
    const query = currentItem
      ? supabase.from(table).update(prepared).eq('id', currentItem.id).eq('user_id', dbUserId)
      : supabase.from(table).insert({ ...prepared, user_id: dbUserId })
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
    const { error } = await supabase.from(table).delete().eq('id', row.id).eq('user_id', dbUserId)
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
      ? supabase.from('kb_accounts').update(prepared).eq('id', currentItem.id).eq('user_id', dbUserId)
      : supabase.from('kb_accounts').insert({ ...prepared, user_id: dbUserId }).select('*').single()
    const { data, error } = await query
    if (error) {
      setNotice(t('saveError'))
      window.alert(error.message)
      return
    }

    const accountId = currentItem?.id || data?.id
    if (accountId) {
      await supabase.from('kb_account_snapshots').insert({
        user_id: dbUserId,
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
    // kb_daily_entries does not have a priority column - remove it if present
    delete prepared.priority
    // Normalize person field to match DB constraint: 'family', 'doina', 'victor'
    if (prepared.person) {
      const personMap = { Familie: 'family', Famille: 'family', Victor: 'victor', Doina: 'doina' }
      prepared.person = personMap[prepared.person] ?? prepared.person.toLowerCase()
    }
    let query = currentItem
      ? supabase.from('kb_daily_entries').update(prepared).eq('id', currentItem.id).eq('user_id', dbUserId)
      : supabase.from('kb_daily_entries').insert({ ...prepared, user_id: dbUserId })
    let { error } = await query
    if (error && /entry_mode|unit_price|priority/i.test(error.message || '')) {
      const fallback = { ...prepared }
      delete fallback.entry_mode
      delete fallback.unit_price
      delete fallback.priority
      query = currentItem
        ? supabase.from('kb_daily_entries').update(fallback).eq('id', currentItem.id).eq('user_id', dbUserId)
        : supabase.from('kb_daily_entries').insert({ ...fallback, user_id: dbUserId })
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
      const { error } = await supabase.from('kb_daily_closures').delete().eq('id', closed.id).eq('user_id', dbUserId)
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
      user_id: dbUserId,
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
    const { error } = await supabase.from('kb_daily_entries').delete().eq('id', item.id).eq('user_id', dbUserId)
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
      ? supabase.from('kb_work_absences').update(prepared).eq('id', currentItem.id).eq('user_id', dbUserId)
      : supabase.from('kb_work_absences').insert({ ...prepared, user_id: dbUserId })
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

  const saveUtilityReading = async (payload, currentItem = null) => {
    const prepared = preparePayload(payload)
    const query = currentItem
      ? supabase.from('kb_utility_readings').update(prepared).eq('id', currentItem.id).eq('user_id', dbUserId)
      : supabase.from('kb_utility_readings').insert({ ...prepared, user_id: dbUserId })
    const { error } = await query
    if (error) {
      setNotice(t('saveError'))
      window.alert(error.message)
      return
    }
    setEditing((current) => ({ ...current, utilityReading: null }))
    setFormOpen((current) => ({ ...current, utilityReading: false }))
    setNotice(t('savedSuccess'))
    loadData()
  }

  const saveShoppingItem = async (payload) => {
    const prepared = preparePayload(payload)
    const insertData = {
      ...prepared,
      priority: prepared.priority || 'normal',
      user_id: dbUserId,
    }
    const { error } = await supabase.from('kb_shopping_list').insert(insertData)
    if (error) {
      setNotice(t('saveError'))
      window.alert(error.message)
      return
    }
    setNotice(t('savedSuccess'))
    loadData()
  }

  const saveReceipt = async ({ receipt, items, createJournalEntry }) => {
    if (!items.length) {
      setNotice('Nu am gasit produse de salvat.')
      return
    }

    const total = items.reduce((sum, item) => sum + toNumber(item.total_price), 0)
    const { data: savedReceipt, error: receiptError } = await supabase
      .from('kb_receipts')
      .insert({
        user_id: dbUserId,
        store_name: receipt.store_name || 'Magazin',
        purchase_date: receipt.purchase_date || isoDate(new Date()),
        total_amount: total,
        source: receipt.source || 'manual_text',
        raw_text: receipt.raw_text || null,
        notes: receipt.notes || null,
      })
      .select('*')
      .single()

    if (receiptError) {
      setNotice(t('saveError'))
      window.alert(receiptError.message)
      return
    }

    const rows = items.map((item) => ({
      user_id: dbUserId,
      receipt_id: savedReceipt.id,
      product_name: item.product_name,
      category: item.category || inferOfferCategory(item.product_name),
      quantity: item.quantity || null,
      unit: item.unit || null,
      unit_price: item.unit_price || null,
      total_price: toNumber(item.total_price),
      notes: item.notes || null,
    }))

    const { error: itemError } = await supabase.from('kb_receipt_items').insert(rows)
    if (itemError) {
      setNotice(t('saveError'))
      window.alert(itemError.message)
      return
    }

    await supabase.from('kb_price_history').insert(rows.map((item) => ({
      user_id: dbUserId,
      product_name: item.product_name,
      store_name: savedReceipt.store_name,
      price: item.total_price,
      unit_price: item.unit_price,
      quantity: item.quantity,
      unit: item.unit,
      recorded_at: savedReceipt.purchase_date,
    })))

    if (createJournalEntry) {
      await saveJournalEntry({
        entry_date: savedReceipt.purchase_date,
        description: `Bon ${savedReceipt.store_name}`,
        amount: total,
        category: 'mancare',
        store: savedReceipt.store_name,
        product_name: 'Bon cumparaturi',
        entry_mode: 'detailed',
      })
    } else {
      loadData()
    }

    setNotice(`Bon salvat: ${total.toFixed(2)} ${currency}.`)
  }

  const saveStore = async (payload) => {
    const prepared = preparePayload(payload)
    if (prepared.import_mode === 'auto_future') prepared.active = false
    const table = 'source_url' in prepared || 'import_mode' in prepared ? 'kb_offer_sources' : 'kb_stores'
    const { error } = await supabase.from(table).insert({ ...prepared, user_id: dbUserId })
    if (error) {
      setNotice(t('saveError'))
      window.alert(error.message)
      return
    }
    setNotice(t('savedSuccess'))
    loadData()
  }

  const saveManualOffer = async (payload) => {
    const prepared = normalizeOfferPayload({ ...payload, status: 'confirmed' })
    const { error } = await supabase.from('kb_weekly_offers').insert({ ...prepared, user_id: dbUserId })
    if (error) {
      setNotice(t('saveError'))
      window.alert(error.message)
      throw new Error(error.message)
    }
    setNotice(t('savedSuccess'))
    loadData()
  }

  const importKaufdaOffer = async (offer) => {
    await saveManualOffer({
      ...offer,
      offer_source: 'kaufda',
      status: 'confirmed',
    })
  }

  const confirmOfferPreview = async (mode = 'safe', previewRows = null) => {
    const sourceRows = previewRows || offerPreview
    const rows = sourceRows
      .filter((item) => mode === 'all' ? item.status !== 'ignored' : item.status === 'ok' && toNumber(item.confidence) >= 0.75)
      .map((item) => normalizeOfferPayload({ ...item, status: 'confirmed' }))
      .filter((item) => !weeklyOffers.some((offer) =>
        normalizeProduct(offer.product_name) === normalizeProduct(item.product_name) &&
        String(offer.store_name).toLowerCase() === String(item.store_name).toLowerCase() &&
        toNumber(offer.price) === toNumber(item.price) &&
        String(offer.valid_until || '') === String(item.valid_until || ''),
      ))
    if (!rows.length) return
    const { error } = await supabase.from('kb_weekly_offers').insert(rows.map((row) => ({ ...row, user_id: dbUserId })))
    if (error) {
      setNotice(t('saveError'))
      window.alert(error.message)
      return
    }
    setNotice(t('offersImported'))
    loadData()
  }

  const startWorkAbsence = async () => {
    if (!workAbsenceSchemaReady) return
    const active = workAbsences.find((item) => item.is_active)
    if (active) return
    const now = new Date()
    const { error } = await supabase.from('kb_work_absences').insert({
      user_id: dbUserId,
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
      .eq('user_id', dbUserId)
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
      user_id: dbUserId,
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
      .upsert({ ...next, user_id: dbUserId }, { onConflict: 'user_id' })
    if (error) window.alert(error.message)
  }

  const saveFinancialSettings = async () => {
    await updateSettings({
      minimum_reserve: Number(settingsDraft.minimum_reserve || 0),
      include_overdraft_in_debt_plan: Boolean(settingsDraft.include_overdraft_in_debt_plan),
      utility_price_electricity: Number(settingsDraft.utility_price_electricity ?? 0.35),
      utility_price_gas: Number(settingsDraft.utility_price_gas ?? 1.20),
      utility_price_water: Number(settingsDraft.utility_price_water ?? 4.50),
      utility_monthly_payment_electricity: Number(settingsDraft.utility_monthly_payment_electricity ?? 0),
      utility_monthly_payment_gas: Number(settingsDraft.utility_monthly_payment_gas ?? 0),
      utility_monthly_payment_water: Number(settingsDraft.utility_monthly_payment_water ?? 0),
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
          <p className="build-label">{BUILD_LABEL}</p>
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
        buildLabel={BUILD_LABEL}
        email={email}
        password={password}
        setEmail={setEmail}
        setPassword={setPassword}
        accountRole={accountRole}
        setAccountRole={setAccountRole}
        childName={childName}
        setChildName={setChildName}
        onSignIn={signIn}
        onSignUp={signUp}
        error={authError}
      />
    )
  }

  const isChildAccount = profileAccountRole === 'child' || user.user_metadata?.account_role === 'child'
  const childAccountName = user.user_metadata?.child_name || null

  if (isChildAccount) {
    return (
      <div className="app-shell">
        <KidsZone
          user={user}
          familyOwnerId={familyOwnerId}
          isChildAccount={true}
          childAccountName={childAccountName}
          onSignOut={() => supabase.auth.signOut()}
        />
      </div>
    )
  }

  return (
    <div className={`app-shell ${activeFamilyMode ? 'family-mode' : ''}`}>
      <header className="topbar">
        <div>
          <p className="eyebrow">{t('appName')}</p>
          <p className="build-label">{BUILD_LABEL}</p>
          <h1>{t('tagline')}</h1>
        </div>
        <div className="top-actions">
          {isSimpleModeForced ? (
            <span style={{ fontWeight: 'bold', marginRight: '0.5rem', display: 'inline-flex', alignItems: 'center', minHeight: '44px' }}>
              👤 Doina
            </span>
          ) : (
            <select
              style={{ width: 'auto', display: 'inline-block', padding: '0.45rem 0.75rem', minHeight: '44px' }}
              value={activeProfileUser}
              onChange={(e) => {
                const val = e.target.value
                setProfileUser(val)
                if (val === 'Doina') {
                  setFamilyMode(true)
                  setView('dashboard_family')
                } else {
                  setView(familyMode ? 'dashboard_family' : 'dashboard')
                }
              }}
              aria-label="Profil"
            >
              <option value="Victor">👤 Victor</option>
              <option value="Doina">👤 Doina</option>
            </select>
          )}

          {!isSimpleModeForced && activeProfileUser === 'Victor' && (
            <button
              type="button"
              className="secondary"
              style={{ minHeight: '44px', padding: '0.45rem 0.75rem' }}
              onClick={() => {
                const nextMode = !familyMode
                setFamilyMode(nextMode)
                setView(nextMode ? 'dashboard_family' : 'dashboard')
              }}
            >
              {activeFamilyMode ? '⚙️ ' + t('detailedView') : '🏡 ' + t('familyView')}
            </button>
          )}

          <select value={language} onChange={(event) => changeLanguage(event.target.value)} aria-label="Language" style={{ width: 'auto', display: 'inline-block', minHeight: '44px' }}>
            {languages.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
          </select>
          <button type="button" className="secondary" onClick={() => supabase.auth.signOut()} style={{ minHeight: '44px' }}>{t('signOut')}</button>
        </div>
      </header>

      {activeFamilyMode ? (
        <nav className="tabbar" aria-label="KlarBudget navigation" style={{ position: 'static', borderBottom: 0 }}>
          <button
            type="button"
            className={view === 'dashboard_family' ? 'active' : ''}
            onClick={() => setView('dashboard_family')}
          >
            🏡 {t('navGroup_general')}
          </button>
          <button
            type="button"
            className={view === 'family_payments' ? 'active' : ''}
            onClick={() => setView('family_payments')}
          >
            💳 {t('paymentsNext')}
          </button>
          <button
            type="button"
            className={view === 'family_food' ? 'active' : ''}
            onClick={() => setView('family_food')}
          >
            🍏 {t('budgetFoodTitle')}
          </button>
          <button
            type="button"
            className={view === 'kids' ? 'active' : ''}
            onClick={() => setView('kids')}
          >
            🧸 {t('kids')}
          </button>
          <button
            type="button"
            className={view === 'calendar' ? 'active' : ''}
            onClick={() => setView('calendar')}
          >
            📅 {t('calendar')}
          </button>
          <button
            type="button"
            className={view === 'pantry' ? 'active' : ''}
            onClick={() => setView('pantry')}
          >
            🏺 Debara
          </button>
        </nav>
      ) : (
        <>
          <nav className="tabbar" aria-label="KlarBudget navigation" style={{ position: 'static', borderBottom: 0 }}>
            <button
              type="button"
              className={['dashboard', 'insights', 'aiActions', 'utilities'].includes(view) ? 'active' : ''}
              onClick={() => setView('dashboard')}
            >
              📂 {t('navGroup_general')}
            </button>
            <button
              type="button"
              className={['incomes', 'expenses', 'debts', 'plan', 'accounts'].includes(view) ? 'active' : ''}
              onClick={() => setView('incomes')}
            >
              💰 {t('navGroup_budget')}
            </button>
            <button
              type="button"
              className={['journal', 'shopping', 'workAbsence', 'calendar', 'pantry'].includes(view) ? 'active' : ''}
              onClick={() => setView('journal')}
            >
              📋 {t('navGroup_activity')}
            </button>
          </nav>

          <nav className="tabbar sub-tabbar" aria-label="KlarBudget sub-navigation">
            {['dashboard', 'insights', 'aiActions', 'utilities'].includes(view) &&
              ['dashboard', 'insights', 'aiActions', 'utilities'].map((item) => (
                <button type="button" className={view === item ? 'active' : ''} onClick={() => setView(item)} key={item}>
                  {t(item)}
                </button>
              ))
            }
            {['incomes', 'expenses', 'debts', 'plan', 'accounts'].includes(view) &&
              ['incomes', 'expenses', 'debts', 'plan', 'accounts'].map((item) => (
                <button type="button" className={view === item ? 'active' : ''} onClick={() => setView(item)} key={item}>
                  {t(item)}
                </button>
              ))
            }
            {['journal', 'shopping', 'workAbsence', 'calendar', 'pantry'].includes(view) &&
              ['journal', 'shopping', 'workAbsence', 'calendar', 'pantry'].map((item) => (
                <button type="button" className={view === item ? 'active' : ''} onClick={() => setView(item)} key={item}>
                  {item === 'pantry' ? '🏺 Debara' : t(item)}
                </button>
              ))
            }
          </nav>
        </>
      )}

      <main className="content">
        {notice && <div className="toast">{notice}</div>}
        {view === 'dashboard_family' && (
          <DashboardFamily
            t={t}
            language={language}
            currency={currency}
            summary={summary}
            expenses={expenses}
            journalEntries={journalEntries}
            accounts={accounts}
            dbUserId={dbUserId}
            pantryStats={pantryStats}
            onOpenQuickSpend={(initialValues = {}) => {
              setQuickSpendForm({
                amount: '',
                category: initialValues.category || 'mâncare',
                store: '',
                person: activeProfileUser === 'Doina' ? 'Doina' : 'Familie',
                notes: ''
              })
              setQuickSpendOpen(true)
            }}
            onNavigate={(nextView) => setView(nextView)}
          />
        )}
        {view === 'family_payments' && (
          <FamilyPayments
            t={t}
            language={language}
            currency={currency}
            expenses={expenses}
            settings={settings}
            paymentStatuses={paymentStatuses}
            onPaymentStatus={setExpensePaymentStatus}
          />
        )}
        {view === 'family_food' && (
          <FamilyFood
            t={t}
            language={language}
            currency={currency}
            expenses={expenses}
            journalEntries={journalEntries}
            onOpenQuickSpend={(initialValues = {}) => {
              setQuickSpendForm({
                amount: '',
                category: initialValues.category || 'mâncare',
                store: '',
                person: activeProfileUser === 'Doina' ? 'Doina' : 'Familie',
                notes: ''
              })
              setQuickSpendOpen(true)
            }}
          />
        )}
        {view === 'dashboard' && (
          <Dashboard
            t={t}
            language={language}
            currency={currency}
            summary={summary}
            dbUserId={dbUserId}
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
        {view === 'shopping' && (
          <SmartShopping
            currency={currency}
            journalEntries={journalEntries}
            language={language}
            locale={locale}
            offerPreview={offerPreview}
            offers={weeklyOffers}
            receiptItems={receiptItems}
            receipts={receipts}
            schemaReady={shoppingSchemaReady}
            shoppingList={shoppingList}
            stores={stores}
            sources={offerSources}
            pantryItems={pantryItems}
            tab={shoppingTab}
            t={t}
            onConfirmPreview={confirmOfferPreview}
            onDelete={(table, item) => deleteRow(table, item)}
            onPreviewChange={setOfferPreview}
            onSaveItem={saveShoppingItem}
            onSaveReceipt={saveReceipt}
            onSaveStore={saveStore}
            onTabChange={setShoppingTab}
            onSaveManualOffer={saveManualOffer}
            onImportOffer={importKaufdaOffer}
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
        {view === 'utilities' && (
          <UtilityReadings
            readings={utilityReadings}
            currency={currency}
            editing={editing.utilityReading}
            formOpen={formOpen.utilityReading}
            language={language}
            locale={locale}
            schemaReady={utilitySchemaReady}
            settings={settings}
            t={t}
            onCancel={() => setEditing((current) => ({ ...current, utilityReading: null }))}
            onDelete={(item) => deleteRow('kb_utility_readings', item)}
            onEdit={(item) => {
              setEditing((current) => ({ ...current, utilityReading: item }))
              setFormOpen((current) => ({ ...current, utilityReading: true }))
            }}
            onSubmit={(payload) => saveUtilityReading(payload, editing.utilityReading)}
            onToggleForm={() => setFormOpen((current) => ({ ...current, utilityReading: !current.utilityReading }))}
            onSaveSettings={async (changes) => {
              await updateSettings(changes)
              setNotice(t('savedSuccess'))
            }}
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
          <PaymentCalendar t={t} language={language} currency={currency} expenses={expenses} settings={settings} paymentStatuses={paymentStatuses} onPaymentStatus={setExpensePaymentStatus} familyMode={activeFamilyMode} onEdit={(item) => {
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
            utilityReadings={utilityReadings}
          />
        )}
        {view === 'kids' && <KidsZone user={user} familyOwnerId={familyOwnerId} />}
        {view === 'pantry' && <Pantry dbUserId={dbUserId} activeOffers={activeOffers} />}
      </main>

      {/* Quick Spend Modal for Mod Familie */}
      {quickSpendOpen && (
        <div className="quick-spend-overlay" onClick={() => setQuickSpendOpen(false)}>
          <div className="quick-spend-modal" onClick={(e) => e.stopPropagation()}>
            <div className="quick-spend-header">
              <h2>{t('quickSpend')}</h2>
              <button type="button" className="quick-spend-close" onClick={() => setQuickSpendOpen(false)}>×</button>
            </div>
            <form
              className="quick-spend-form"
              onSubmit={async (e) => {
                e.preventDefault()
                const amountNum = parseFloat(quickSpendForm.amount)
                if (isNaN(amountNum) || amountNum <= 0) {
                  window.alert(t('saveError'))
                  return
                }

                await saveJournalEntry({
                  entry_date: isoDate(new Date()),
                  description: quickSpendForm.store || t('quickSpend'),
                  amount: amountNum,
                  category: quickSpendForm.category,
                  store: quickSpendForm.store || null,
                  person: quickSpendForm.person,
                  notes: quickSpendForm.notes || null,
                  entry_mode: 'quick',
                })

                setQuickSpendOpen(false)
                window.alert(t('spentSaved'))
              }}
            >
              <label>
                {t('amount')} ({currency})
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  autoFocus
                  placeholder="0.00"
                  value={quickSpendForm.amount}
                  onChange={(e) => setQuickSpendForm({ ...quickSpendForm, amount: e.target.value })}
                />
              </label>

              <label>
                {t('category')}
                <select
                  value={quickSpendForm.category}
                  onChange={(e) => setQuickSpendForm({ ...quickSpendForm, category: e.target.value })}
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                {t('store')} ({t('other')} / {language === 'de' ? 'optional' : 'opțional'})
                <input
                  type="text"
                  placeholder="Lidl, Rewe, Netto..."
                  value={quickSpendForm.store}
                  onChange={(e) => setQuickSpendForm({ ...quickSpendForm, store: e.target.value })}
                />
              </label>

              <label>
                {t('person')}
                <select
                  value={quickSpendForm.person}
                  onChange={(e) => setQuickSpendForm({ ...quickSpendForm, person: e.target.value })}
                >
                  <option value="doina">{t('doina')}</option>
                  <option value="victor">{t('victor')}</option>
                  <option value="family">{t('family')}</option>
                </select>
              </label>

              <label>
                {t('notes')} ({language === 'de' ? 'optional' : 'opțional'})
                <input
                  type="text"
                  placeholder="..."
                  value={quickSpendForm.notes}
                  onChange={(e) => setQuickSpendForm({ ...quickSpendForm, notes: e.target.value })}
                />
              </label>

              <div className="form-actions" style={{ marginTop: '0.5rem' }}>
                <button type="submit" className="big-action-button" style={{ margin: 0 }}>
                  {t('save')}
                </button>
                <button type="button" className="ghost" onClick={() => setQuickSpendOpen(false)}>
                  {t('cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
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


function UtilityReadings({ readings, currency, editing, formOpen, language, locale, schemaReady, settings = {}, t, onCancel, onDelete, onEdit, onSubmit, onToggleForm, onSaveSettings }) {
  const [settingsDraft, setSettingsDraft] = useState({
    utility_price_electricity: settings.utility_price_electricity ?? 0.35,
    utility_price_gas: settings.utility_price_gas ?? 1.20,
    utility_price_water: settings.utility_price_water ?? 4.50,
    utility_monthly_payment_electricity: settings.utility_monthly_payment_electricity ?? 0,
    utility_monthly_payment_gas: settings.utility_monthly_payment_gas ?? 0,
    utility_monthly_payment_water: settings.utility_monthly_payment_water ?? 0,
  });
  const [settingsSaved, setSettingsSaved] = useState(false);

  const handleSaveSettings = async () => {
    if (onSaveSettings) {
      await onSaveSettings({
        utility_price_electricity: Number(settingsDraft.utility_price_electricity),
        utility_price_gas: Number(settingsDraft.utility_price_gas),
        utility_price_water: Number(settingsDraft.utility_price_water),
        utility_monthly_payment_electricity: Number(settingsDraft.utility_monthly_payment_electricity),
        utility_monthly_payment_gas: Number(settingsDraft.utility_monthly_payment_gas),
        utility_monthly_payment_water: Number(settingsDraft.utility_monthly_payment_water),
      });
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2500);
    }
  };
  const recentReadings = readings.map((item) => ({
    ...item,
    name: t(item.meter_type),
    amount: null,
  }))

  const meterUnits = {
    electricity: 'kWh',
    gas: 'm³',
    water: 'm³'
  }

  const formatMeterVal = (val) => {
    const num = Number(val);
    if (Number.isNaN(num)) return '0';
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: num % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2
    }).format(num);
  };

  const formatCalculatedVal = (val) => {
    const num = Number(val);
    if (Number.isNaN(num)) return '0,00';
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(num);
  };

  const getUtilityData = (type) => {
    const typeReadings = readings
      .filter((r) => r.meter_type === type)
      .sort((a, b) => new Date(a.reading_date) - new Date(b.reading_date));

    const unitPrice = Number(settings[`utility_price_${type}`] ?? (type === 'electricity' ? 0.35 : type === 'gas' ? 1.20 : 4.50));
    const monthlyPayment = Number(settings[`utility_monthly_payment_${type}`] ?? 0);

    if (typeReadings.length < 2) {
      return {
        hasEnoughData: false,
        readings: typeReadings,
        latest: typeReadings[typeReadings.length - 1] || null
      };
    }

    const veche = typeReadings[typeReadings.length - 2];
    const noua = typeReadings[typeReadings.length - 1];

    const consum = Number(noua.value) - Number(veche.value);
    const costEstimat = consum * unitPrice;

    const dateNew = new Date(noua.reading_date);
    const dateOld = new Date(veche.reading_date);
    const diffTime = dateNew - dateOld;
    const days = Math.max(1, Math.round(diffTime / (1000 * 60 * 60 * 24)));

    const medieZilnica = consum / days;
    const costMediuZilnic = costEstimat / days;

    const fractionOfMonth = days / 30.44;
    const platiEstimate = monthlyPayment * fractionOfMonth;
    const diferenta = platiEstimate - costEstimat;

    return {
      hasEnoughData: true,
      readings: typeReadings,
      latest: noua,
      consum,
      costEstimat,
      days,
      medieZilnica,
      costMediuZilnic,
      plataLunara: monthlyPayment,
      platiEstimate,
      diferenta,
      isPlus: diferenta >= 0,
      diffAbs: Math.abs(diferenta)
    };
  };

  const gasData = getUtilityData('gas');
  const electricityData = getUtilityData('electricity');
  const waterData = getUtilityData('water');

  const configs = {
    gas: {
      gradient: 'linear-gradient(135deg, #ff6b35 0%, #f97316 40%, #ea580c 100%)',
      gradientSoft: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
      accentColor: '#f97316',
      accentDark: '#c2410c',
      textOnGradient: '#fff',
      iconBg: 'rgba(255,255,255,0.2)',
      borderColor: '#fed7aa',
      glowColor: 'rgba(249,115,22,0.25)',
    },
    electricity: {
      gradient: 'linear-gradient(135deg, #7c3aed 0%, #8b5cf6 40%, #a78bfa 100%)',
      gradientSoft: 'linear-gradient(135deg, #faf5ff 0%, #ede9fe 100%)',
      accentColor: '#8b5cf6',
      accentDark: '#5b21b6',
      textOnGradient: '#fff',
      iconBg: 'rgba(255,255,255,0.2)',
      borderColor: '#ddd6fe',
      glowColor: 'rgba(139,92,246,0.25)',
    },
    water: {
      gradient: 'linear-gradient(135deg, #1d4ed8 0%, #3b82f6 40%, #60a5fa 100%)',
      gradientSoft: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
      accentColor: '#3b82f6',
      accentDark: '#1e3a8a',
      textOnGradient: '#fff',
      iconBg: 'rgba(255,255,255,0.2)',
      borderColor: '#bfdbfe',
      glowColor: 'rgba(59,130,246,0.25)',
    }
  };

  const renderCard = (type, title, icon, data) => {
    const unit = meterUnits[type];
    const cfg = configs[type];

    return (
      <div style={{
        background: '#ffffff',
        borderRadius: '20px',
        border: `1px solid ${cfg.borderColor}`,
        boxShadow: `0 8px 32px ${cfg.glowColor}, 0 2px 8px rgba(0,0,0,0.04)`,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        minHeight: '460px',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
      }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-4px)';
          e.currentTarget.style.boxShadow = `0 16px 48px ${cfg.glowColor}, 0 4px 16px rgba(0,0,0,0.06)`;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = `0 8px 32px ${cfg.glowColor}, 0 2px 8px rgba(0,0,0,0.04)`;
        }}
      >
        {/* Gradient Header */}
        <div style={{
          background: cfg.gradient,
          padding: '1.5rem 1.5rem 2rem',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Big background icon */}
          <div style={{
            position: 'absolute',
            right: '-12px',
            top: '-12px',
            fontSize: '6rem',
            lineHeight: 1,
          }}>
            {icon}
          </div>

          {/* Top row: icon circle + unit badge */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '14px',
              background: cfg.iconBg,
              backdropFilter: 'blur(10px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.6rem',
              border: '1px solid rgba(255,255,255,0.3)',
            }}>
              {icon}
            </div>
            <span style={{
              background: 'rgba(255,255,255,0.25)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.35)',
              color: '#fff',
              fontWeight: '900',
              fontSize: '0.78rem',
              padding: '0.3rem 0.75rem',
              borderRadius: '20px',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}>
              {unit}
            </span>
          </div>

          {/* Title */}
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '1.35rem', fontWeight: '900', color: '#fff', letterSpacing: '-0.01em' }}>
            {title}
          </h3>

          {/* Last reading value */}
          {data.latest ? (
            <div>
              <div style={{
                fontSize: '0.65rem',
                fontWeight: '800',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.7)',
                marginBottom: '0.2rem',
              }}>
                ULTIMA CITIRE
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
                <span style={{ fontSize: '2.75rem', fontWeight: '900', color: '#fff', lineHeight: 1, letterSpacing: '-0.02em' }}>
                  {formatMeterVal(data.latest.value)}
                </span>
                <span style={{ fontSize: '1.1rem', fontWeight: '600', color: 'rgba(255,255,255,0.75)' }}>
                  {unit}
                </span>
              </div>
              <div style={{
                fontSize: '0.82rem',
                color: 'rgba(255,255,255,0.7)',
                marginTop: '0.2rem',
                fontWeight: '500',
              }}>
                📅 {data.latest.reading_date}
              </div>
            </div>
          ) : (
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', fontWeight: '600' }}>
              Nicio citire introdusă
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{
          padding: '1.4rem 1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.9rem',
          flexGrow: 1,
          background: cfg.gradientSoft,
        }}>
          {data.hasEnoughData ? (
            <>
              {/* Stats rows */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                {[
                  { label: 'Consum ultima perioadă', value: `${formatCalculatedVal(data.consum)} ${unit}`, highlight: false },
                  { label: 'Cost estimat ultima perioadă', value: formatMoney(data.costEstimat, currency, locale), highlight: true },
                  { label: 'Medie zilnică', value: `${formatCalculatedVal(data.medieZilnica)} ${unit}/zi`, highlight: false },
                  { label: 'Cost mediu zilnic', value: `${formatMoney(data.costMediuZilnic, currency, locale)}/zi`, highlight: false },
                  { label: 'Plată lunară', value: formatMoney(data.plataLunara, currency, locale), highlight: true },
                ].map(({ label, value, highlight }) => (
                  <div key={label} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '10px',
                    background: highlight ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.35)',
                    border: highlight ? `1px solid ${cfg.borderColor}` : '1px solid rgba(255,255,255,0.5)',
                    backdropFilter: 'blur(4px)',
                  }}>
                    <span style={{ fontSize: '0.82rem', color: '#374151', fontWeight: '500' }}>{label}</span>
                    <strong style={{
                      fontSize: highlight ? '0.95rem' : '0.88rem',
                      color: cfg.accentDark,
                      fontWeight: '800',
                      letterSpacing: '-0.01em',
                    }}>{value}</strong>
                  </div>
                ))}
              </div>

              {/* Status Panel */}
              <div style={{
                marginTop: 'auto',
                padding: '0.9rem 1rem',
                borderRadius: '14px',
                background: data.isPlus
                  ? 'linear-gradient(135deg, #dcfce7, #bbf7d0)'
                  : 'linear-gradient(135deg, #fee2e2, #fecaca)',
                border: data.isPlus ? '1px solid #86efac' : '1px solid #fca5a5',
                boxShadow: data.isPlus
                  ? '0 4px 12px rgba(34,197,94,0.15)'
                  : '0 4px 12px rgba(239,68,68,0.15)',
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontWeight: '900',
                  fontSize: '0.88rem',
                  letterSpacing: '0.03em',
                  textTransform: 'uppercase',
                  color: data.isPlus ? '#15803d' : '#b91c1c',
                  marginBottom: '0.3rem',
                }}>
                  <span>{data.isPlus ? '✅' : '⚠️'}</span>
                  <span>{data.isPlus ? `PE PLUS  +${formatMoney(data.diffAbs, currency, locale)}` : `PE MINUS  −${formatMoney(data.diffAbs, currency, locale)}`}</span>
                </div>
                <div style={{
                  fontSize: '0.8rem',
                  color: data.isPlus ? '#166534' : '#991b1b',
                  lineHeight: '1.45',
                  fontWeight: '500',
                }}>
                  {data.isPlus
                    ? `Ai plătit estimativ cu ${formatMoney(data.diffAbs, currency, locale)} mai mult decât consumul calculat.`
                    : `Consumul estimat este cu ${formatMoney(data.diffAbs, currency, locale)} peste plățile lunare.`}
                </div>
              </div>
            </>
          ) : data.latest ? (
            <div style={{
              flexGrow: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1.5rem',
              background: 'rgba(255,255,255,0.5)',
              borderRadius: '14px',
              border: '1px dashed rgba(0,0,0,0.1)',
              textAlign: 'center',
              gap: '0.4rem',
            }}>
              <span style={{ fontSize: '2rem' }}>📊</span>
              <span style={{ fontSize: '0.85rem', color: '#6b7280', fontWeight: '600' }}>
                Ai nevoie de cel puțin două citiri pentru calcul.
              </span>
            </div>
          ) : (
            <div style={{
              flexGrow: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '2rem',
              background: 'rgba(255,255,255,0.5)',
              borderRadius: '14px',
              border: '1px dashed rgba(0,0,0,0.1)',
              textAlign: 'center',
              gap: '0.4rem',
            }}>
              <span style={{ fontSize: '2.5rem' }}>📋</span>
              <span style={{ fontSize: '0.9rem', color: '#6b7280', fontWeight: '600' }}>
                Nicio citire introdusă încă.
              </span>
              <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>
                Adaugă prima citire cu butonul de sus.
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderMiniChartCard = (type, title, icon, data) => {
    const cfg = configs[type];
    const typeReadings = data.readings || [];
    const lastThree = typeReadings.slice(-3);
    const maxVal = lastThree.length > 0 ? Math.max(...lastThree.map((r) => Number(r.value))) : 0;

    return (
      <div style={{
        background: '#fff',
        borderRadius: '16px',
        border: `1px solid ${cfg.borderColor}`,
        boxShadow: `0 4px 16px ${cfg.glowColor}`,
        overflow: 'hidden',
      }}>
        {/* Mini header bar */}
        <div style={{
          background: cfg.gradient,
          padding: '0.85rem 1.1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
        }}>
          <span style={{ fontSize: '1.25rem' }}>{icon}</span>
          <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: '800', color: '#fff' }}>{title}</h4>
        </div>

        <div style={{ padding: '1.1rem', background: cfg.gradientSoft }}>
          {lastThree.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {lastThree.map((reading, idx) => {
                const val = Number(reading.value);
                const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
                const isLatest = idx === lastThree.length - 1;
                return (
                  <div key={reading.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                      <span style={{ fontSize: '0.78rem', color: '#6b7280', fontWeight: '500' }}>
                        {reading.reading_date}
                      </span>
                      <strong style={{
                        fontSize: isLatest ? '0.92rem' : '0.82rem',
                        color: isLatest ? cfg.accentDark : '#374151',
                        fontWeight: '800',
                      }}>
                        {formatMeterVal(val)} {meterUnits[type]}
                      </strong>
                    </div>
                    <div style={{
                      height: '10px',
                      background: 'rgba(255,255,255,0.6)',
                      borderRadius: '6px',
                      overflow: 'hidden',
                      border: '1px solid rgba(255,255,255,0.8)',
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${pct}%`,
                        background: isLatest ? cfg.gradient : cfg.accentColor + '88',
                        borderRadius: '6px',
                        transition: 'width 0.4s ease',
                        boxShadow: isLatest ? `0 2px 6px ${cfg.glowColor}` : 'none',
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{
              padding: '1rem',
              textAlign: 'center',
              fontSize: '0.82rem',
              color: '#9ca3af',
              fontWeight: '500',
            }}>
              Nu există citiri introduse.
            </div>
          )}
        </div>
      </div>
    );
  };

  const elecTitle = language === 'ro' ? 'Curent' : 'Strom';

  return (
    <>
      {/* Page Header */}
      <div style={{
        background: 'linear-gradient(135deg, #17463c 0%, #1e5945 50%, #2d7a5e 100%)',
        borderRadius: '20px',
        padding: '2rem 2rem 2.5rem',
        position: 'relative',
        overflow: 'hidden',
        marginBottom: '0.5rem',
        boxShadow: '0 8px 32px rgba(23,70,60,0.25)',
      }}>
        {/* Background decoration */}
        <div style={{
          position: 'absolute', right: '-30px', top: '-30px',
          width: '200px', height: '200px',
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.04)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', right: '80px', bottom: '-50px',
          width: '150px', height: '150px',
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.03)',
          pointerEvents: 'none',
        }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', position: 'relative' }}>
          <div>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              background: 'rgba(255,255,255,0.12)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.18)',
              borderRadius: '20px',
              padding: '0.25rem 0.75rem',
              marginBottom: '0.6rem',
              fontSize: '0.72rem',
              fontWeight: '800',
              color: 'rgba(255,255,255,0.8)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}>
              🏠 Acasă
            </div>
            <h1 style={{ margin: '0 0 0.35rem', fontSize: '1.9rem', fontWeight: '900', color: '#fff', letterSpacing: '-0.02em' }}>
              {t('utilities')}
            </h1>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'rgba(255,255,255,0.65)', fontWeight: '400' }}>
              {t('utilitiesSubtitle')}
            </p>
          </div>

          <button
            type="button"
            onClick={onToggleForm}
            style={{
              background: formOpen ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.95)',
              backdropFilter: 'blur(8px)',
              color: formOpen ? '#fff' : '#17463c',
              fontWeight: '800',
              fontSize: '0.88rem',
              borderRadius: '12px',
              padding: '0.7rem 1.3rem',
              border: formOpen ? '1px solid rgba(255,255,255,0.3)' : 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              minHeight: 'auto',
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap',
            }}
          >
            {formOpen ? '✕ ' + t('hideForm') : t('addUtilityReading')}
          </button>
        </div>

        {!schemaReady && (
          <div style={{
            marginTop: '1rem',
            background: 'rgba(239,68,68,0.15)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '10px',
            padding: '0.75rem 1rem',
            color: '#fca5a5',
            fontSize: '0.85rem',
            fontWeight: '500',
          }}>
            {t('utilitiesMigrationMissing')}
          </div>
        )}
      </div>

      {formOpen && (
        <div style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
          <UtilityReadingForm
            t={t}
            initialItem={editing}
            onSubmit={onSubmit}
            onCancel={onCancel}
          />
        </div>
      )}

      {/* 3 Main Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '1.5rem',
        marginTop: '1.75rem',
        marginBottom: '2.5rem',
      }}>
        {renderCard('gas', t('gas'), '🔥', gasData)}
        {renderCard('electricity', elecTitle, '⚡', electricityData)}
        {renderCard('water', t('water'), '💧', waterData)}
      </div>

      {/* Charts Section */}
      <div style={{ marginBottom: '2.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div style={{
            width: '4px',
            height: '24px',
            borderRadius: '2px',
            background: 'linear-gradient(180deg, #f97316, #8b5cf6)',
          }} />
          <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#15231f', fontWeight: '900' }}>
            Diagrame consum
          </h2>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '1.1rem',
        }}>
          {renderMiniChartCard('gas', t('gas'), '🔥', gasData)}
          {renderMiniChartCard('electricity', elecTitle, '⚡', electricityData)}
          {renderMiniChartCard('water', t('water'), '💧', waterData)}
        </div>
      </div>

      {/* Settings Panel */}
      <div style={{ marginBottom: '2.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div style={{
            width: '4px',
            height: '24px',
            borderRadius: '2px',
            background: 'linear-gradient(180deg, #17463c, #3b82f6)',
          }} />
          <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#15231f', fontWeight: '900' }}>
            ⚙️ Setări utilități
          </h2>
        </div>

        <div style={{
          background: '#fff',
          borderRadius: '20px',
          border: '1px solid #dde4da',
          boxShadow: '0 4px 20px rgba(23,70,60,0.06)',
          overflow: 'hidden',
        }}>
          {/* Panel header */}
          <div style={{
            background: 'linear-gradient(135deg, #17463c 0%, #1e5945 100%)',
            padding: '1rem 1.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}>
            <div>
              <div style={{ fontSize: '0.95rem', fontWeight: '800', color: '#fff' }}>
                Prețuri &amp; Avansuri lunare
              </div>
              <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.65)', marginTop: '0.15rem' }}>
                Valorile sunt folosite pentru calculul costurilor și al balanței.
              </div>
            </div>
            <button
              type="button"
              onClick={handleSaveSettings}
              style={{
                background: settingsSaved ? 'rgba(34,197,94,0.9)' : 'rgba(255,255,255,0.92)',
                color: settingsSaved ? '#fff' : '#17463c',
                fontWeight: '800',
                fontSize: '0.85rem',
                borderRadius: '10px',
                padding: '0.55rem 1.1rem',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                transition: 'all 0.25s ease',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                whiteSpace: 'nowrap',
              }}
            >
              {settingsSaved ? '✅ Salvat!' : '💾 Salvează'}
            </button>
          </div>

          {/* 3 utility rows */}
          <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {[
              {
                type: 'gas',
                icon: '🔥',
                label: language === 'ro' ? 'Gaz' : 'Gas',
                priceKey: 'utility_price_gas',
                paymentKey: 'utility_monthly_payment_gas',
                accentColor: '#f97316',
                bgColor: '#fff7ed',
                borderColor: '#fed7aa',
                unit: 'm³',
              },
              {
                type: 'electricity',
                icon: '⚡',
                label: language === 'ro' ? 'Curent' : 'Strom',
                priceKey: 'utility_price_electricity',
                paymentKey: 'utility_monthly_payment_electricity',
                accentColor: '#8b5cf6',
                bgColor: '#faf5ff',
                borderColor: '#ddd6fe',
                unit: 'kWh',
              },
              {
                type: 'water',
                icon: '💧',
                label: language === 'ro' ? 'Apă' : 'Wasser',
                priceKey: 'utility_price_water',
                paymentKey: 'utility_monthly_payment_water',
                accentColor: '#3b82f6',
                bgColor: '#eff6ff',
                borderColor: '#bfdbfe',
                unit: 'm³',
              },
            ].map(({ type, icon, label, priceKey, paymentKey, accentColor, bgColor, borderColor, unit }) => (
              <div key={type} style={{
                background: bgColor,
                border: `1px solid ${borderColor}`,
                borderRadius: '14px',
                padding: '1rem 1.25rem',
                display: 'grid',
                gridTemplateColumns: '140px 1fr 1fr',
                gap: '1rem',
                alignItems: 'center',
              }}>
                {/* Label */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: accentColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.1rem',
                    flexShrink: 0,
                  }}>
                    {icon}
                  </div>
                  <strong style={{ fontSize: '0.95rem', color: '#15231f', fontWeight: '800' }}>{label}</strong>
                </div>

                {/* Pret per unitate */}
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', margin: 0 }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Preț / {unit}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={settingsDraft[priceKey]}
                    onChange={(e) => setSettingsDraft((prev) => ({ ...prev, [priceKey]: Number(e.target.value || 0) }))}
                    style={{
                      border: `1.5px solid ${borderColor}`,
                      borderRadius: '8px',
                      padding: '0.45rem 0.65rem',
                      fontSize: '0.95rem',
                      fontWeight: '700',
                      color: '#15231f',
                      background: '#fff',
                      outline: 'none',
                      width: '100%',
                      boxSizing: 'border-box',
                    }}
                  />
                </label>

                {/* Avans lunar */}
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', margin: 0 }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Avans lunar ({currency})
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={settingsDraft[paymentKey]}
                    onChange={(e) => setSettingsDraft((prev) => ({ ...prev, [paymentKey]: Number(e.target.value || 0) }))}
                    style={{
                      border: `1.5px solid ${borderColor}`,
                      borderRadius: '8px',
                      padding: '0.45rem 0.65rem',
                      fontSize: '0.95rem',
                      fontWeight: '700',
                      color: '#15231f',
                      background: '#fff',
                      outline: 'none',
                      width: '100%',
                      boxSizing: 'border-box',
                    }}
                  />
                </label>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Entity list */}
      <div style={{
        background: '#fff',
        borderRadius: '16px',
        border: '1px solid #dde4da',
        padding: '0.25rem',
        boxShadow: '0 2px 8px rgba(23,70,60,0.04)',
      }}>
        <EntityList
          title={t('utilities')}
          items={recentReadings}
          currency={currency}
          language={language}
          emptyText={t('noData')}
          editText={t('edit')}
          deleteText={t('delete')}
          renderMeta={(item) => `${item.reading_date} — ${item.value} ${meterUnits[item.meter_type] || ''} ${item.cost_estimate ? `(Cost: ${item.cost_estimate} ${currency})` : ''} ${item.notes ? `[${item.notes}]` : ''}`}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </div>
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
  const numberFields = ['amount', 'initial_amount', 'remaining_balance', 'final_payment', 'monthly_payment', 'interest_rate', 'current_balance', 'overdraft_limit', 'overdraft_interest', 'quantity', 'unit_price', 'desired_quantity', 'price', 'old_price', 'discount_percent', 'distance_km', 'fuel_cost_estimate']
  const dateFields = ['occurrence_date', 'due_date', 'estimated_end_date', 'entry_date', 'valid_from', 'valid_until']
  const result = { ...payload }

  if ('priority' in result) {
    const validPriorities = ['normal', 'important', 'offer_only']
    if (typeof result.priority === 'string' || result.priority === null || result.priority === '') {
      if (!result.priority || !validPriorities.includes(result.priority)) {
        result.priority = 'normal'
      }
    }
  }

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
