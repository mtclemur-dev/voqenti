import { supabase } from '../supabaseClient'

export function openPostChoiceStatus(choice) {
  if (choice === 'go') return 'assigned'
  if (choice === 'no') return 'declined'
  return 'thinking'
}

function clockValue(value) {
  const text = String(value || '').slice(0, 5)
  return /^\d{2}:\d{2}$/.test(text) ? text : null
}

function isMissingColumn(error) {
  const message = error?.message?.toLowerCase() ?? ''
  return error?.code === 'PGRST204'
    || message.includes('planned_start')
    || message.includes('planned_end')
    || message.includes('schema cache')
}

function isPolicyError(error) {
  const message = error?.message?.toLowerCase() ?? ''
  return error?.code === '42501'
    || message.includes('row-level security')
    || message.includes('not allowed')
}

async function jobClock(jobId, startTime, endTime) {
  let start = clockValue(startTime)
  let end = clockValue(endTime)
  if (start && end) return { start, end }
  const { data } = await supabase
    .from('work_jobs')
    .select('start_time, end_time')
    .eq('id', jobId)
    .maybeSingle()
  return {
    start: start || clockValue(data?.start_time),
    end: end || clockValue(data?.end_time),
  }
}

function assigneeFields(payload, withTimes) {
  const fields = {
    status: payload.status,
    decline_reason: payload.decline_reason,
    updated_at: payload.updated_at,
  }
  if (withTimes) {
    fields.planned_start = payload.planned_start
    fields.planned_end = payload.planned_end
  }
  return fields
}

async function writeAssignee(existingId, payload, withTimes) {
  const fields = assigneeFields(payload, withTimes)
  if (existingId) {
    return supabase.from('work_job_assignees').update(fields).eq('id', existingId)
  }
  return supabase.from('work_job_assignees').insert([{
    job_id: payload.job_id,
    worker_id: payload.worker_id,
    ...fields,
  }])
}

async function saveAssignee(existingId, payload) {
  let result = await writeAssignee(existingId, payload, true)
  if (result.error && isMissingColumn(result.error)) {
    result = await writeAssignee(existingId, payload, false)
  }
  if (result.error && payload.status === 'assigned' && isPolicyError(result.error) && !existingId) {
    const pending = { ...payload, status: 'pending' }
    result = await writeAssignee(null, pending, true)
    if (result.error && isMissingColumn(result.error)) {
      result = await writeAssignee(null, pending, false)
    }
    if (!result.error) return { error: null, status: 'pending' }
  }
  return { error: result.error, status: payload.status }
}

export async function respondToOpenPost({
  jobId,
  workerId,
  choice,
  startTime,
  endTime,
}) {
  if (!jobId || !workerId || !choice) return { error: 'missing' }
  const status = openPostChoiceStatus(choice)
  const range = choice === 'go'
    ? await jobClock(jobId, startTime, endTime)
    : { start: null, end: null }
  const payload = {
    job_id: jobId,
    worker_id: workerId,
    status,
    decline_reason: choice === 'no' ? 'openPostNo' : null,
    updated_at: new Date().toISOString(),
    planned_start: range.start,
    planned_end: range.end,
  }
  const existing = await supabase
    .from('work_job_assignees')
    .select('id, status')
    .eq('job_id', jobId)
    .eq('worker_id', workerId)
    .maybeSingle()
  if (existing.error) return { error: existing.error, status }
  const saved = await saveAssignee(existing.data?.id, payload)
  await supabase
    .from('work_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('job_id', jobId)
    .eq('worker_id', workerId)
    .is('read_at', null)
  return saved
}

export function openPostAnswer(row) {
  if (!row) return ''
  if (['assigned', 'approved', 'pending'].includes(row.status)) return 'go'
  if (row.status === 'declined') return 'no'
  if (row.status === 'thinking') return 'think'
  return ''
}
