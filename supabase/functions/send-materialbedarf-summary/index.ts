import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from 'https://esm.sh/pdf-lib@1.17.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type RequestItem = {
  id: number
  material_item_id: string | null
  custom_name: string | null
  quantity: number | null
  unit: string | null
  material_items?: { name?: string | null } | null
}

type MaterialRequest = {
  id: number
  objekt_name: string | null
  reporter_name: string | null
  reporter_email: string | null
  request_date: string
  status: string
  material_request_items?: RequestItem[]
}

const berlinDate = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())

const toGermanDate = (isoDate: string) => {
  const [year, month, day] = isoDate.split('-')
  return year && month && day ? `${day}.${month}.${year}` : isoDate
}

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

const addWrappedText = (
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  font: PDFFont,
  size: number,
  lineHeight = size + 4,
) => {
  const words = text.split(/\s+/)
  let line = ''
  let currentY = y
  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(testLine, size) > maxWidth && line) {
      page.drawText(line, { x, y: currentY, size, font, color: rgb(0.12, 0.16, 0.24) })
      currentY -= lineHeight
      line = word
    } else {
      line = testLine
    }
  }
  if (line) {
    page.drawText(line, { x, y: currentY, size, font, color: rgb(0.12, 0.16, 0.24) })
    currentY -= lineHeight
  }
  return currentY
}

const buildPdf = async (requests: MaterialRequest[], requestDate: string) => {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  let page = pdf.addPage([595, 842])
  let y = 790

  const ensureSpace = (needed = 80) => {
    if (y > needed) return
    page = pdf.addPage([595, 842])
    y = 790
  }

  page.drawText('Materialbedarf - Tagesuebersicht', { x: 40, y, size: 20, font: bold, color: rgb(0.02, 0.2, 0.32) })
  y -= 28
  page.drawText(`Datum: ${toGermanDate(requestDate)}`, { x: 40, y, size: 11, font, color: rgb(0.35, 0.42, 0.52) })
  y -= 30

  const grouped = requests.reduce<Record<string, MaterialRequest[]>>((acc, request) => {
    const key = request.objekt_name || 'Ohne Objekt'
    acc[key] = acc[key] ?? []
    acc[key].push(request)
    return acc
  }, {})

  for (const [objectName, rows] of Object.entries(grouped)) {
    ensureSpace(130)
    page.drawRectangle({ x: 36, y: y - 8, width: 523, height: 24, color: rgb(0.9, 0.96, 1) })
    page.drawText(`Objekt: ${objectName}`, { x: 44, y, size: 13, font: bold, color: rgb(0.02, 0.23, 0.36) })
    y -= 24

    const reporters = Array.from(new Set(rows.map(row => row.reporter_name || row.reporter_email).filter(Boolean)))
    if (reporters.length > 0) {
      y = addWrappedText(page, `Gemeldet von: ${reporters.join(', ')}`, 44, y, 480, font, 9)
    }

    for (const request of rows) {
      for (const item of request.material_request_items ?? []) {
        ensureSpace(50)
        const name = item.custom_name || item.material_items?.name || 'Material'
        const quantity = item.quantity ? `: ${item.quantity}${item.unit ? ` ${item.unit}` : ''}` : ''
        y = addWrappedText(page, `- ${name}${quantity}`, 54, y, 470, font, 11)
      }
    }
    y -= 12
  }

  return await pdf.save()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const emailFrom = Deno.env.get('EMAIL_FROM') ?? 'Voqenti <onboarding@resend.dev>'
    const recipient = Deno.env.get('MATERIALBEDARF_RECIPIENT') ?? 'mtclemur@gmail.com'

    if (!resendApiKey || !supabaseUrl || !serviceRoleKey || !anonKey) {
      throw new Error('Missing RESEND_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY')
    }

    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData.user) throw new Error('Unauthorized')

    const body = await req.json().catch(() => ({}))
    const requestDate = body?.request_date ?? berlinDate()
    const serviceClient = createClient(supabaseUrl, serviceRoleKey)

    const { data, error } = await serviceClient
      .from('material_requests')
      .select('id, objekt_name, reporter_name, reporter_email, request_date, status, material_request_items(id, material_item_id, custom_name, quantity, unit, material_items(name))')
      .eq('request_date', requestDate)
      .eq('user_id', userData.user.id)
      .eq('summary_sent', false)
      .in('status', ['offen', 'geplant', 'eingepackt', 'mitgenommen'])
      .order('objekt_name', { ascending: true })

    if (error) throw error
    const requests = (data ?? []) as MaterialRequest[]
    if (requests.length === 0) throw new Error('Keine offenen Materialbedarfe fuer dieses Datum')

    const pdfBytes = await buildPdf(requests, requestDate)
    const subject = `Materialbedarf ${toGermanDate(requestDate)}`

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: emailFrom,
        to: [recipient],
        subject,
        html: `<p>Guten Tag,</p><p>anbei erhalten Sie die Materialbedarf-Tagesuebersicht vom ${toGermanDate(requestDate)}.</p><p>Mit freundlichen Gruessen<br>Voqenti</p>`,
        attachments: [{
          filename: `Materialbedarf_${requestDate}.pdf`,
          content: bytesToBase64(pdfBytes),
        }],
      }),
    })

    const resendResult = await response.json()
    if (!response.ok) throw new Error(resendResult?.message ?? 'Resend email failed')

    const requestIds = requests.map(row => row.id)
    await serviceClient
      .from('material_requests')
      .update({ summary_sent: true, summary_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .in('id', requestIds)

    return new Response(JSON.stringify({ ok: true, count: requests.length, resend: resendResult }), {
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
