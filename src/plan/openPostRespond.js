import { supabase } from '../supabaseClient'

export function openPostChoiceStatus(choice, isPlanner = false) {
  if (choice === 'go') return isPlanner ? 'assigned' : 'pending'
  if (choice === 'no') return 'declined'
  return 'thinking'
}

export async function respondToOpenPost({ jobId, workerId, choice, isPlanner = false }) {
  if (!jobId || !workerId || !choice) return { error: 'missing' }
  const status = openPostChoiceStatus(choice, isPlanner)
  const payload = {
    job_id: jobId,
    worker_id: workerId,
    status,
    decline_reason: choice === 'no' ? 'openPostNo' : null,
    updated_at: new Date().toISOString(),
  }
  const existing = await supabase
    .from('work_job_assignees')
    .select('id, status')
    .eq('job_id', jobId)
    .eq('worker_id', workerId)
    .maybeSingle()
  let error = existing.error
  if (!error && existing.data?.id) {
    const updated = await supabase
      .from('work_job_assignees')
      .update({
        status,
        decline_reason: payload.decline_reason,
        updated_at: payload.updated_at,
      })
      .eq('id', existing.data.id)
    error = updated.error
  } else if (!error) {
    const inserted = await supabase.from('work_job_assignees').insert([payload])
    error = inserted.error
  }
  await supabase
    .from('work_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('job_id', jobId)
    .eq('worker_id', workerId)
    .is('read_at', null)
  return { error, status }
}

export function openPostAnswer(row) {
  if (!row) return ''
  if (['assigned', 'approved', 'pending'].includes(row.status)) return 'go'
  if (row.status === 'declined') return 'no'
  if (row.status === 'thinking') return 'think'
  return ''
}
