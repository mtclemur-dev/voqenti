/**
 * Computes consumption, estimated cost, and status (plus/minus) for Gas, Electricity, and Water readings.
 * 
 * Readings are sorted chronologically to perform the difference checks:
 * - consumption = current_value - previous_value
 * - period_days = days between current and previous reading
 * - period_months = period_days / 30.44
 * - estimated_payments = monthly_payment * period_months
 * - cost_calculated = consumption * unit_price
 * - cost = manual_cost || cost_calculated
 * - plus_minus = estimated_payments - cost
 */
export function computeUtilityData(readings = [], settings = {}) {
  const meterUnits = {
    electricity: 'kWh',
    gas: 'm³',
    water: 'm³'
  };

  const types = ['gas', 'electricity', 'water'];
  const data = {};

  types.forEach((type) => {
    // Sort chronologically (oldest first) to compute diffs
    const typeReadings = readings
      .filter((r) => r.meter_type === type)
      .sort((a, b) => new Date(a.reading_date) - new Date(b.reading_date));

    const unitPrice = Number(settings[`utility_price_${type}`] ?? (type === 'electricity' ? 0.35 : type === 'gas' ? 1.20 : 4.50));
    const monthlyPayment = Number(settings[`utility_monthly_payment_${type}`] ?? 0);
    const unit = meterUnits[type] || '';

    const processed = [];
    for (let i = 0; i < typeReadings.length; i++) {
      const reading = typeReadings[i];
      let consumption = 0;
      let days = 0;
      let months = 0;
      let isError = false;
      let costCalculated = 0;
      let costManual = reading.cost_estimate !== null && reading.cost_estimate !== undefined && reading.cost_estimate !== '' ? Number(reading.cost_estimate) : null;
      let cost;
      let estimatedPayments = 0;
      let plusMinus = 0;

      let prevReadingDate = null;

      if (i > 0) {
        const prev = typeReadings[i - 1];
        prevReadingDate = prev.reading_date;
        consumption = Number(reading.value) - Number(prev.value);
        if (consumption < 0) {
          isError = true;
        }
        const dateCurrent = new Date(reading.reading_date);
        const datePrev = new Date(prev.reading_date);
        const diffTime = dateCurrent - datePrev;
        days = Math.max(0, Math.round(diffTime / (1000 * 60 * 60 * 24)));
        months = days / 30.44;
        costCalculated = consumption * unitPrice;
        cost = costManual !== null ? costManual : costCalculated;
        estimatedPayments = monthlyPayment * months;
        plusMinus = estimatedPayments - cost;
      } else {
        // Oldest reading
        cost = costManual !== null ? costManual : 0;
      }

      processed.push({
        ...reading,
        consumption,
        days,
        months,
        isError,
        costCalculated,
        costManual,
        cost,
        estimatedPayments,
        plusMinus,
        unit,
        prevReadingDate
      });
    }

    // The latest reading is the last element in the sorted list
    const latest = processed[processed.length - 1] || null;

    data[type] = {
      readings: [...processed].reverse(), // display newest first in lists
      latest,
      unitPrice,
      monthlyPayment,
      unit,
      hasEnoughData: processed.length >= 2
    };
  });

  return data;
}
