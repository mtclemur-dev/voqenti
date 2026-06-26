/**
 * Utility meter readings — consumption & cost helpers.
 *
 * When is_meter_reset is true on a reading, it marks a new physical meter baseline.
 * Consumption for that reading is 0; the next reading compares only to this baseline.
 */

const DEFAULT_PRICES = { electricity: 0.35, gas: 1.20, water: 4.50 }

export function isMeterReset(reading) {
  return Boolean(reading?.is_meter_reset)
}

export function sortUtilityReadings(readings = [], type) {
  return readings
    .filter((r) => r.meter_type === type)
    .sort((a, b) => new Date(a.reading_date) - new Date(b.reading_date))
}

/** Consumption between two consecutive readings (chronological). */
export function computeReadingConsumption(current, previous) {
  if (isMeterReset(current)) {
    return { consumption: 0, isBaseline: true, isError: false }
  }
  if (!previous) {
    return { consumption: 0, isBaseline: false, isError: false }
  }
  const consumption = Number(current.value) - Number(previous.value)
  return {
    consumption,
    isBaseline: false,
    isError: consumption < 0,
  }
}

function unitPriceFor(type, settings = {}) {
  return Number(settings[`utility_price_${type}`] ?? DEFAULT_PRICES[type] ?? 0)
}

function monthlyPaymentFor(type, settings = {}) {
  return Number(settings[`utility_monthly_payment_${type}`] ?? 0)
}

/**
 * Stats for the dashboard cards (latest period between last two readings).
 */
export function computeLatestPeriodStats(readings = [], type, settings = {}) {
  const typeReadings = sortUtilityReadings(readings, type)
  const unitPrice = unitPriceFor(type, settings)
  const monthlyPayment = monthlyPaymentFor(type, settings)
  const latest = typeReadings[typeReadings.length - 1] || null

  if (!latest) {
    return { hasEnoughData: false, readings: typeReadings, latest: null }
  }

  if (typeReadings.length < 2) {
    return {
      hasEnoughData: false,
      readings: typeReadings,
      latest,
      isBaseline: isMeterReset(latest),
    }
  }

  const previous = typeReadings[typeReadings.length - 2]
  const { consumption, isBaseline, isError } = computeReadingConsumption(latest, previous)

  if (isBaseline) {
    return {
      hasEnoughData: false,
      readings: typeReadings,
      latest,
      isBaseline: true,
    }
  }

  const dateNew = new Date(latest.reading_date)
  const dateOld = new Date(previous.reading_date)
  const days = Math.max(1, Math.round((dateNew - dateOld) / (1000 * 60 * 60 * 24)))
  const costEstimat = consumption * unitPrice
  const medieZilnica = consumption / days
  const costMediuZilnic = costEstimat / days
  const fractionOfMonth = days / 30.44
  const platiEstimate = monthlyPayment * fractionOfMonth
  const diferenta = platiEstimate - costEstimat

  return {
    hasEnoughData: !isError,
    readings: typeReadings,
    latest,
    consum: consumption,
    costEstimat,
    days,
    medieZilnica,
    costMediuZilnic,
    plataLunara: monthlyPayment,
    platiEstimate,
    diferenta,
    isPlus: diferenta >= 0,
    diffAbs: Math.abs(diferenta),
    isError,
    previousWasReset: isMeterReset(previous),
  }
}

/**
 * Full history with per-reading consumption (newest first for display lists).
 */
export function computeUtilityData(readings = [], settings = {}) {
  const meterUnits = {
    electricity: 'kWh',
    gas: 'm³',
    water: 'm³',
  }

  const types = ['gas', 'electricity', 'water']
  const data = {}

  types.forEach((type) => {
    const typeReadings = sortUtilityReadings(readings, type)
    const unitPrice = unitPriceFor(type, settings)
    const monthlyPayment = monthlyPaymentFor(type, settings)
    const unit = meterUnits[type] || ''

    const processed = []
    for (let i = 0; i < typeReadings.length; i++) {
      const reading = typeReadings[i]
      const prev = i > 0 ? typeReadings[i - 1] : null
      const { consumption, isBaseline, isError } = computeReadingConsumption(reading, prev)

      let days = 0
      let months = 0
      let costCalculated = 0
      const costManual = reading.cost_estimate !== null && reading.cost_estimate !== undefined && reading.cost_estimate !== ''
        ? Number(reading.cost_estimate)
        : null
      let cost
      let estimatedPayments = 0
      let plusMinus = 0
      const prevReadingDate = prev?.reading_date ?? null

      if (i > 0 && !isBaseline) {
        const dateCurrent = new Date(reading.reading_date)
        const datePrev = new Date(prev.reading_date)
        days = Math.max(0, Math.round((dateCurrent - datePrev) / (1000 * 60 * 60 * 24)))
        months = days / 30.44
        costCalculated = consumption * unitPrice
        cost = costManual !== null ? costManual : costCalculated
        estimatedPayments = monthlyPayment * months
        plusMinus = estimatedPayments - cost
      } else {
        cost = costManual !== null ? costManual : 0
      }

      processed.push({
        ...reading,
        consumption,
        days,
        months,
        isError,
        isBaseline,
        costCalculated,
        costManual,
        cost,
        estimatedPayments,
        plusMinus,
        unit,
        prevReadingDate,
      })
    }

    const latest = processed[processed.length - 1] || null

    data[type] = {
      readings: [...processed].reverse(),
      latest,
      unitPrice,
      monthlyPayment,
      unit,
      hasEnoughData: processed.length >= 2 && latest && !latest.isBaseline && !latest.isError,
    }
  })

  return data
}
