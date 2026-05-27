import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type UsageEntry = {
  category: string
  item_name: string
  quantity: number | null
  unit: string | null
  worker_name: string | null
  user_email: string | null
}

const categoryLabels: Record<string, string> = {
  chemie: 'Eingesetzte Chemikalien',
  geraete: 'Verwendete Geraete',
  materialien: 'Benoetigte Materialien',
  hinweise: 'Hinweise',
}

const berlinDate = () => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(new Date())
}

const toGermanDate = (isoDate: string) => {
  const [year, month, day] = isoDate.split('-')
  return year && month && day ? `${day}.${month}.${year}` : isoDate
}

const escapeHtml = (text?: string | null) =>
  String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const buildHtml = (entries: UsageEntry[], usageDate: string) => {
  const grouped = entries.reduce<Record<string, UsageEntry[]>>((acc, entry) => {
    acc[entry.category] = acc[entry.category] ?? []
    acc[entry.category].push(entry)
    return acc
  }, {})

  const sections = Object.entries(grouped)
    .map(([category, rows]) => {
      const items = rows
        .map(row => {
          const quantity = row.quantity ? ` - ${row.quantity}${row.unit ? ` ${escapeHtml(row.unit)}` : ''}` : ''
          const worker = escapeHtml(row.worker_name ?? row.user_email ?? 'Unbekannt')
          return `<li><strong>${escapeHtml(row.item_name)}</strong>${quantity}<br><span style="color:#64748b">Mitarbeiter: ${worker}</span></li>`
        })
        .join('')
      return `<h3>${escapeHtml(categoryLabels[category] ?? category)}</h3><ul>${items}</ul>`
    })
    .join('')

  return `
    <p>Guten Tag,</p>
    <p>anbei die interne Material- und Chemikalienuebersicht vom ${toGermanDate(usageDate)}.</p>
    ${sections || '<p>Heute wurden keine Materialien erfasst.</p>'}
    <p>Mit freundlichen Gruessen<br>Voqenti</p>
  `
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const cronSecret = Deno.env.get('MATERIAL_USAGE_CRON_SECRET')
    if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
      throw new Error('Unauthorized')
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const emailFrom = Deno.env.get('EMAIL_FROM') ?? 'Voqenti <onboarding@resend.dev>'
    const recipient = Deno.env.get('MATERIAL_USAGE_RECIPIENT') ?? 'mtclemur@gmail.com'

    if (!resendApiKey || !supabaseUrl || !serviceRoleKey) {
      throw new Error('Missing RESEND_API_KEY, SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    }

    const body = await req.json().catch(() => ({}))
    const usageDate = body?.usage_date ?? berlinDate()
    const supabaseClient = createClient(supabaseUrl, serviceRoleKey)

    const { data, error } = await supabaseClient
      .from('material_usage_entries')
      .select('category, item_name, quantity, unit, worker_name, user_email')
      .eq('usage_date', usageDate)
      .order('category', { ascending: true })
      .order('item_name', { ascending: true })

    if (error) throw error

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: emailFrom,
        to: [recipient],
        subject: `Materialverbrauch ${toGermanDate(usageDate)}`,
        html: buildHtml(data ?? [], usageDate),
      }),
    })

    const resendResult = await response.json()
    if (!response.ok) {
      throw new Error(resendResult?.message ?? 'Resend email failed')
    }

    return new Response(JSON.stringify({ ok: true, count: data?.length ?? 0, resend: resendResult }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
