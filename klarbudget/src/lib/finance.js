const MS_PER_DAY = 24 * 60 * 60 * 1000

export const toNumber = (value) => Number.parseFloat(value || 0) || 0

export const debtRemainingTotal = (debt) =>
  toNumber(debt?.remaining_balance) + toNumber(debt?.final_payment)

export const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())

export const parseLocalDate = (dateString) => {
  if (!dateString) return null
  const [year, month, day] = String(dateString).split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

export const daysUntil = (date, now = new Date()) =>
  Math.ceil((startOfDay(date).getTime() - startOfDay(now).getTime()) / MS_PER_DAY)

export const monthKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

export const isoDate = (date) => {
  const clean = startOfDay(date)
  return `${clean.getFullYear()}-${String(clean.getMonth() + 1).padStart(2, '0')}-${String(clean.getDate()).padStart(2, '0')}`
}

export const isSameMonth = (dateString, reference = new Date()) => {
  if (!dateString) return false
  return monthKey(parseLocalDate(dateString)) === monthKey(reference)
}

export const expenseKind = (expense) => {
  if (expense?.expense_kind) return expense.expense_kind
  if (expense?.frequency === 'once') return 'one_time_expense'
  if (expense?.payment_mode === 'variable_tracking' || expense?.expense_type === 'variable') return 'variable_budget'
  return 'fixed_payment'
}

export const isCalendarExpense = (expense) => ['fixed_payment', 'one_time_expense'].includes(expenseKind(expense))

export const daysLeftInMonth = (reference = new Date()) => {
  const lastDay = new Date(reference.getFullYear(), reference.getMonth() + 1, 0)
  return Math.max(1, daysUntil(lastDay, reference) + 1)
}

const isExpenseLike = (item) =>
  Boolean(item && ('expense_kind' in item || 'expense_type' in item || 'payment_mode' in item || 'due_date' in item))

export const monthlyValue = (item, reference = new Date()) => {
  if (!item?.active && item?.status !== 'active') return 0
  const amount = toNumber(item.amount ?? item.monthly_payment)
  if (isExpenseLike(item) && expenseKind(item) === 'variable_budget') return amount
  if (isExpenseLike(item) && expenseKind(item) === 'one_time_expense') return isSameMonth(item.due_date, reference) ? amount : 0
  if (item.frequency === 'quarterly') return amount / 3
  if (item.frequency === 'semiannual') return amount / 6
  if (item.frequency === 'yearly') return amount / 12
  if (item.frequency === 'once') {
    return isSameMonth(item.occurrence_date ?? item.due_date, reference) ? amount : 0
  }
  return amount
}

export const nextDueDate = (expense, now = new Date()) => {
  if (!expense?.due_date) return null
  const source = parseLocalDate(expense.due_date)
  if (!source) return null
  if (expense.frequency === 'once') return source

  const step = recurrenceStepMonths(expense.frequency)
  let candidate = startOfDay(source)
  while (candidate < startOfDay(now)) {
    candidate = addMonthsClamped(candidate, step, source.getDate())
  }
  return candidate
}

export const nextIncomeDate = (incomes, now = new Date()) => {
  const dates = incomes
    .filter((income) => income.active && income.occurrence_date)
    .map((income) => {
      const source = parseLocalDate(income.occurrence_date)
      if (!source) return null
      if (income.frequency === 'once') return source
      const step = recurrenceStepMonths(income.frequency)
      let candidate = startOfDay(source)
      while (candidate < startOfDay(now)) {
        candidate = addMonthsClamped(candidate, step, source.getDate())
      }
      return candidate
    })
    .filter(Boolean)
    .filter((date) => date >= startOfDay(now))
    .sort((a, b) => a - b)

  return dates[0] ?? null
}

export const paymentKey = (expenseId, dueDate) => `${expenseId}:${isoDate(dueDate)}`

export const statusForPayment = (paymentStatuses = [], expenseId, dueDate) =>
  paymentStatuses.find((item) => item.expense_id === expenseId && item.due_date === isoDate(dueDate))?.status ?? 'pending'

export const upcomingPayments = (expenses, days = 14, settings = {}, now = new Date(), paymentStatuses = [], options = {}) => {
  const threshold = toNumber(settings.large_payment_threshold) || 300
  const includePaid = Boolean(options.includePaid)
  return expenses
    .filter((expense) => expense.active && isCalendarExpense(expense))
    .map((expense) => {
      const due = nextDueDate(expense, now)
      if (!due) return null
      const status = statusForPayment(paymentStatuses, expense.id, due)
      return {
        ...expense,
        next_due_date: due,
        due_date_iso: isoDate(due),
        days_until: daysUntil(due, now),
        is_large: toNumber(expense.amount) >= threshold,
        payment_status: status,
      }
    })
    .filter(Boolean)
    .filter((expense) => expense.days_until >= 0 && expense.days_until <= days)
    .filter((expense) => includePaid || expense.payment_status !== 'paid')
    .sort((a, b) => a.next_due_date - b.next_due_date)
}

export const calendarGroups = (expenses, settings = {}, now = new Date(), paymentStatuses = []) => {
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const endOfMonthDays = daysUntil(lastDay, now)
  const monthPayments = upcomingPayments(expenses, endOfMonthDays, settings, now, paymentStatuses, { includePaid: true })
  const next90Payments = upcomingPayments(expenses, 90, settings, now, paymentStatuses, { includePaid: true })
  return {
    next7: monthPayments.filter((item) => item.days_until <= 7),
    days8to14: monthPayments.filter((item) => item.days_until >= 8 && item.days_until <= 14),
    restOfMonth: monthPayments.filter((item) => item.days_until >= 15),
    next90: next90Payments.filter((item) => item.days_until > endOfMonthDays),
    unscheduled: expenses.filter((expense) => expense.active && isCalendarExpense(expense) && !expense.due_date),
  }
}

export const splitDebtTotals = (debts) => {
  const active = debts.filter((debt) => debt.status === 'active')
  const isMortgage = (debt) => debt.debt_category === 'credit_casa'
  const isCredit = (debt) => ['credit_consum', 'credit_auto', 'finantare_cumparaturi', 'renovare'].includes(debt.debt_category)
  const urgent = active.filter((debt) => !isMortgage(debt) && !isCredit(debt)).reduce((sum, debt) => sum + debtRemainingTotal(debt), 0)
  const monthlyCredits = active.filter((debt) => isCredit(debt)).reduce((sum, debt) => sum + debtRemainingTotal(debt), 0)
  const mortgage = active.filter((debt) => isMortgage(debt)).reduce((sum, debt) => sum + debtRemainingTotal(debt), 0)
  const total = active.reduce((sum, debt) => sum + debtRemainingTotal(debt), 0)
  return { urgent, monthlyCredits, mortgage, total }
}

export const calculateAccountSummary = ({ accounts = [], snapshots = [], summarySeed = {}, settings = {} }) => {
  const included = accounts.filter((account) => account.include_in_safe_balance !== false)
  const positiveTotal = included
    .filter((account) => toNumber(account.current_balance) > 0)
    .reduce((sum, account) => sum + toNumber(account.current_balance), 0)
  const overdraftUsed = included
    .filter((account) => toNumber(account.current_balance) < 0)
    .reduce((sum, account) => sum + Math.abs(toNumber(account.current_balance)), 0)
  const netBalance = positiveTotal - overdraftUsed
  const overdraftAvailable = accounts
    .filter((account) => account.has_overdraft)
    .reduce((sum, account) => {
      const used = Math.max(0, -toNumber(account.current_balance))
      return sum + Math.max(0, toNumber(account.overdraft_limit) - used)
    }, 0)
  const variableNeeded = Math.max(0, toNumber(summarySeed.variableTotal) / 30 * toNumber(summarySeed.daysUntilSalary || 0))
  const safeAvailable = positiveTotal
    - toNumber(summarySeed.upcomingUntilSalaryTotal)
    - variableNeeded
    - toNumber(settings.minimum_reserve ?? 200)
  const latestUpdate = accounts
    .map((account) => parseDateTime(account.updated_at))
    .filter(Boolean)
    .sort((a, b) => b - a)[0] ?? null
  const balances7DaysAgo = netBalanceFromSnapshots(accounts, snapshots, 7)
  const trendDifference = balances7DaysAgo === null ? null : netBalance - balances7DaysAgo

  return {
    positiveTotal,
    overdraftUsed,
    netBalance,
    overdraftAvailable,
    variableNeededUntilSalary: variableNeeded,
    minimumReserve: toNumber(settings.minimum_reserve ?? 200),
    safeAvailable,
    latestUpdate,
    balances7DaysAgo,
    trendDifference,
    stale: latestUpdate ? daysUntil(new Date(), latestUpdate) > 7 : accounts.length > 0,
    hasAccounts: accounts.length > 0,
  }
}

export const calculateSummary = ({ incomes, expenses, debts, settings, paymentStatuses = [], accounts = [], accountSnapshots = [] }) => {
  const incomeTotal = incomes.reduce((sum, item) => sum + monthlyValue(item), 0)
  const fixedTotal = expenses
    .filter((item) => expenseKind(item) === 'fixed_payment')
    .reduce((sum, item) => sum + monthlyValue(item), 0)
  const variableTotal = expenses
    .filter((item) => expenseKind(item) === 'variable_budget')
    .reduce((sum, item) => sum + monthlyValue(item), 0)
  const onceThisMonth = expenses
    .filter((item) => expenseKind(item) === 'one_time_expense')
    .reduce((sum, item) => sum + monthlyValue(item), 0)
  const activeDebts = debts.filter((debt) => debt.status === 'active')
  const debtTotals = splitDebtTotals(debts)
  const debtPayments = activeDebts.reduce((sum, debt) => sum + toNumber(debt.monthly_payment), 0)
  const plannedRemaining = incomeTotal - fixedTotal - variableTotal - debtPayments
  const now = new Date()
  const salaryDate = nextIncomeDate(incomes, now)
  const fallbackDays = Math.max(1, daysUntil(new Date(now.getFullYear(), now.getMonth() + 1, 0), now))
  const daysUntilSalary = salaryDate ? Math.max(1, daysUntil(salaryDate, now)) : fallbackDays
  const next14 = upcomingPayments(expenses, 14, settings, now, paymentStatuses)
  const nextUntilSalary = upcomingPayments(expenses, daysUntilSalary, settings, now, paymentStatuses)
  const nextPaymentTotal = next14.reduce((sum, item) => sum + toNumber(item.amount), 0)
  const upcomingUntilSalaryTotal = nextUntilSalary.reduce((sum, item) => sum + toNumber(item.amount), 0)
  const dailyBudget = (plannedRemaining - upcomingUntilSalaryTotal) / daysUntilSalary
  const largestPayment = next14.reduce((largest, item) => toNumber(item.amount) > toNumber(largest?.amount) ? item : largest, null)

  let status = 'onTrack'
  if (plannedRemaining < 0 || dailyBudget < 0) status = 'riskNegative'
  else if (next14.some((item) => item.is_large)) status = 'largePaymentsSoon'

  const baseSummary = {
    incomeTotal,
    fixedTotal,
    variableTotal,
    onceThisMonth,
    debtTotal: debtTotals.total,
    debtTotals,
    debtPayments,
    remaining: plannedRemaining,
    next14,
    nextPaymentTotal,
    largestPayment,
    daysUntilSalary,
    dailyBudget,
    upcomingUntilSalaryTotal,
    status,
  }

  return {
    ...baseSummary,
    accounts: calculateAccountSummary({ accounts, snapshots: accountSnapshots, summarySeed: baseSummary, settings }),
  }
}

export const sortDebts = (debts, method) => {
  const active = debts.filter((debt) => debt.status === 'active' && debtRemainingTotal(debt) > 0)
  if (method === 'avalanche') {
    return [...active].sort((a, b) => toNumber(b.interest_rate) - toNumber(a.interest_rate) || debtRemainingTotal(a) - debtRemainingTotal(b))
  }
  return [...active].sort((a, b) => debtRemainingTotal(a) - debtRemainingTotal(b))
}

const simulateMonths = (debts, extraPayment, method) => {
  let month = 0
  const balances = debts
    .filter((debt) => debt.status === 'active' && debtRemainingTotal(debt) > 0 && toNumber(debt.monthly_payment) > 0)
    .map((debt) => ({ ...debt, balance: debtRemainingTotal(debt) }))
  const monthlyDebtBudget = balances.reduce((sum, debt) => sum + toNumber(debt.monthly_payment), 0) + toNumber(extraPayment)

  if (!balances.length) return { months: 0 }
  if (monthlyDebtBudget <= 0) return { months: 600 }

  while (balances.some((debt) => debt.balance > 0) && month < 600) {
    month += 1
    balances.forEach((debt) => {
      if (debt.balance <= 0) return
      debt.balance += debt.balance * (toNumber(debt.interest_rate) / 100 / 12)
    })
    let available = monthlyDebtBudget
    sortDebts(balances, method).forEach((debt) => {
      if (available <= 0 || debt.balance <= 0) return
      const payment = Math.min(debt.balance, available)
      debt.balance -= payment
      available -= payment
    })
  }

  return { months: month }
}

export const debtPlan = (debts, settings) => {
  const method = settings.debt_method ?? 'snowball'
  const extra = toNumber(settings.monthly_extra_debt_payment)
  const includeMortgage = Boolean(settings.include_mortgage_in_plan)
  const includedDebts = debts.filter((debt) => includeMortgage || debt.debt_category !== 'credit_casa')
  const ordered = sortDebts(includedDebts, method)
  const base = simulateMonths(includedDebts, 0, method)
  const withExtra = simulateMonths(includedDebts, extra, method)
  const activeIncluded = includedDebts.filter((debt) => debt.status === 'active')
  const monthlyPayments = activeIncluded.reduce((sum, debt) => sum + toNumber(debt.monthly_payment), 0)
  const includedTotal = activeIncluded.reduce((sum, debt) => sum + debtRemainingTotal(debt), 0)
  const rates = activeIncluded.map((debt) => toNumber(debt.interest_rate)).filter((rate) => rate > 0)
  const highestInterest = rates.length ? Math.max(...rates) : 0
  const averageInterest = rates.length ? rates.reduce((sum, rate) => sum + rate, 0) / rates.length : 0
  const hasZeroPaymentDebt = activeIncluded.some((debt) => toNumber(debt.monthly_payment) <= 0)

  return {
    method,
    extra,
    includeMortgage,
    ordered,
    firstDebt: ordered[0] ?? null,
    monthsWithoutExtra: base.months,
    monthsWithExtra: withExtra.months,
    monthsSaved: Math.max(0, base.months - withExtra.months),
    includedTotal,
    monthlyPayments,
    highestInterest,
    averageInterest,
    hasZeroPaymentDebt,
  }
}

export const formatMoney = (value, currency = 'EUR', locale = 'ro-RO') =>
  new Intl.NumberFormat(locale, { style: 'currency', currency }).format(toNumber(value))

const recurrenceStepMonths = (frequency) => {
  if (frequency === 'quarterly') return 3
  if (frequency === 'semiannual') return 6
  if (frequency === 'yearly') return 12
  return 1
}

const addMonthsClamped = (date, months, preferredDay) => {
  const targetMonth = date.getMonth() + months
  const target = new Date(date.getFullYear(), targetMonth, 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(preferredDay, lastDay))
  return target
}

const parseDateTime = (value) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const netBalanceFromSnapshots = (accounts, snapshots, daysAgo) => {
  if (!accounts.length || !snapshots.length) return null
  const target = new Date()
  target.setDate(target.getDate() - daysAgo)
  const targetKey = isoDate(target)
  const byAccount = new Map()

  snapshots
    .filter((snapshot) => snapshot.snapshot_date <= targetKey)
    .sort((a, b) => String(b.snapshot_date).localeCompare(String(a.snapshot_date)))
    .forEach((snapshot) => {
      if (!byAccount.has(snapshot.account_id)) byAccount.set(snapshot.account_id, snapshot)
    })

  if (!byAccount.size) return null

  return accounts.reduce((sum, account) => {
    if (account.include_in_safe_balance === false) return sum
    const snapshot = byAccount.get(account.id)
    return sum + toNumber(snapshot?.balance ?? account.current_balance)
  }, 0)
}

export const variableBudgetStats = (expense, reference = new Date()) => {
  const budget = toNumber(expense.amount)
  const spent = 0
  const remaining = Math.max(0, budget - spent)
  return {
    budget,
    spent,
    remaining,
    dailyRemaining: remaining / daysLeftInMonth(reference),
  }
}

export const formatMonths = (months, language = 'ro') => {
  if (!months) return language === 'de' ? '0 Monate' : '0 luni'
  if (months >= 600) return language === 'de' ? 'kein realistischer Plan' : 'fără plan realist'
  const years = Math.floor(months / 12)
  const rest = months % 12
  const yearLabel = language === 'de' ? (years === 1 ? 'Jahr' : 'Jahre') : (years === 1 ? 'an' : 'ani')
  const monthLabel = language === 'de' ? (rest === 1 ? 'Monat' : 'Monate') : (rest === 1 ? 'lună' : 'luni')
  if (!years) return `${rest} ${monthLabel}`
  if (!rest) return `${years} ${yearLabel}`
  return `${years} ${yearLabel} ${rest} ${monthLabel}`
}
