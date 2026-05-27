import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from 'https://esm.sh/pdf-lib@1.17.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type EmailOutbox = {
  id: number
  user_id: string
  recipient: string
  subject: string
  html_body: string | null
  payload: {
    work_date?: string | null
    start_time?: string | null
    end_time?: string | null
    creator_email?: string | null
    creator_name?: string | null
    object_name?: string | null
    auftragsnummer?: string | null
    worker_names?: string[]
    task?: string | null
    task_de?: string | null
    damage_present?: boolean | null
    damage_description?: string | null
    damage_description_de?: string | null
    damage_image_url?: string | null
    attachment_urls?: string[]
    customer_satisfied?: boolean | null
    customer_feedback?: string | null
    customer_feedback_de?: string | null
    client_signature_data_url?: string | null
    customer_signed_at?: string | null
    status?: string | null
    entry_type?: string | null
    correction_reason?: string | null
    checklist?: {
      work_time?: boolean
      work_done?: boolean
      equipment_back?: boolean
      materials_back?: boolean
    }
    totals?: {
      total_minutes?: number
      pause_minutes?: number
      fahrzeit_minutes?: number
      effective_minutes?: number
    }
  } | null
}

let translationDebugMessage: string | null = null

const minutesToText = (minutes = 0) => {
  const safeMinutes = Math.max(0, Math.round(Number(minutes || 0)))
  const hours = Math.floor(safeMinutes / 60)
  const rest = safeMinutes % 60
  return rest > 0 ? `${hours}:${String(rest).padStart(2, '0')}` : String(hours)
}

const toGermanDate = (isoDate?: string | null) => {
  if (!isoDate) return ''
  const [year, month, day] = isoDate.split('-')
  return year && month && day ? `${day}.${month}.${year}` : isoDate
}

const buildSender = (emailFrom: string, senderName?: string | null) => {
  if (!senderName) return emailFrom
  const match = emailFrom.match(/<([^>]+)>/)
  const address = match?.[1] ?? emailFrom
  const safeName = senderName.replace(/[<>"]/g, '').trim()
  return safeName ? `${safeName} via Voqenti <${address}>` : emailFrom
}

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

const dataUrlToBytes = (dataUrl: string) => {
  const base64 = dataUrl.split(',')[1]
  if (!base64) return null
  return Uint8Array.from(atob(base64), char => char.charCodeAt(0))
}

const extensionFromContentType = (contentType: string) => {
  if (contentType.includes('png')) return 'png'
  if (contentType.includes('webp')) return 'webp'
  return 'jpg'
}

const buildImageAttachment = async (url: string, index: number) => {
  const response = await fetch(url)
  if (!response.ok) return null
  const contentType = response.headers.get('content-type') ?? 'image/jpeg'
  if (!contentType.startsWith('image/')) return null
  const bytes = new Uint8Array(await response.arrayBuffer())
  return {
    filename: `tagesbericht-foto-${index}.${extensionFromContentType(contentType)}`,
    content: bytesToBase64(bytes),
  }
}

const toGermanTime = (iso?: string | null) => {
  if (!iso) return ''
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

const wrapText = (text: string, maxChars: number) => {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  const lines: string[] = []
  let line = ''

  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (next.length > maxChars && line) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines
}

const sanitizePdfText = (text?: string | null) =>
  String(text ?? '')
    .replace(/[^\u0009\u000A\u000D\u0020-\u007E\u00A0-\u00FF]/g, '?')
    .replace(/\r/g, '')

const wrapTextByWidth = (text: string, font: PDFFont, size: number, maxWidth: number) => {
  const paragraphs = sanitizePdfText(text).split('\n')
  const lines: string[] = []

  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      lines.push('')
      continue
    }

    let line = ''
    for (const word of words) {
      const next = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(next, size) > maxWidth && line) {
        lines.push(line)
        line = word
      } else {
        line = next
      }
    }
    if (line) lines.push(line)
  }

  return lines
}

const drawWrappedText = (
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  font: PDFFont,
  size: number,
  color = rgb(0.12, 0.16, 0.22),
) => {
  const lines = wrapTextByWidth(text, font, size, maxWidth)
  let cursorY = y
  for (const line of lines) {
    page.drawText(line, { x, y: cursorY, size, font, color })
    cursorY -= size + 5
  }
  return cursorY
}

const drawLabelValue = (
  page: PDFPage,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
  font: PDFFont,
  boldFont: PDFFont,
) => {
  page.drawText(label, { x, y, size: 8, font: boldFont, color: rgb(0.38, 0.45, 0.55) })
  page.drawText(sanitizePdfText(value || '-'), { x, y: y - 15, size: 11, font, color: rgb(0.08, 0.11, 0.18) })
  page.drawLine({
    start: { x, y: y - 22 },
    end: { x: x + width, y: y - 22 },
    thickness: 0.6,
    color: rgb(0.86, 0.89, 0.93),
  })
}

const drawLabelLines = (
  page: PDFPage,
  label: string,
  lines: string[],
  x: number,
  y: number,
  width: number,
  font: PDFFont,
  boldFont: PDFFont,
) => {
  page.drawText(label, { x, y, size: 8, font: boldFont, color: rgb(0.38, 0.45, 0.55) })
  let cursorY = y - 15
  lines.filter(Boolean).forEach((line, index) => {
    page.drawText(sanitizePdfText(line), {
      x,
      y: cursorY,
      size: index === 0 && line.startsWith('Vorarbeiter') ? 9 : 10,
      font: line.startsWith('Vorarbeiter') ? boldFont : font,
      color: line.startsWith('Vorarbeiter') ? rgb(0.05, 0.42, 0.52) : rgb(0.08, 0.11, 0.18),
    })
    cursorY -= 14
  })
  page.drawLine({
    start: { x, y: Math.min(y - 22, cursorY + 6) },
    end: { x: x + width, y: Math.min(y - 22, cursorY + 6) },
    thickness: 0.6,
    color: rgb(0.86, 0.89, 0.93),
  })
}

const splitWorkers = (workers: string[]) => {
  const foremanIndex = workers.findIndex(worker => worker.toLowerCase().includes('plamadeala victor'))
  const foreman = foremanIndex >= 0 ? workers[foremanIndex] : null
  const others = workers.filter((_, index) => index !== foremanIndex)
  return { foreman, others }
}

const drawWorkerBlock = (
  page: PDFPage,
  workers: string[],
  x: number,
  y: number,
  width: number,
  font: PDFFont,
  boldFont: PDFFont,
) => {
  const { foreman, others } = splitWorkers(workers)
  let cursorY = y

  if (foreman) {
    page.drawText('Vorarbeiter', { x, y: cursorY, size: 8, font: boldFont, color: rgb(0.05, 0.42, 0.52) })
    cursorY -= 15
    page.drawText(sanitizePdfText(foreman), { x, y: cursorY, size: 10, font: boldFont, color: rgb(0.08, 0.11, 0.18) })
    cursorY -= 19
  }

  page.drawText('Mitarbeiter', { x, y: cursorY, size: 8, font: boldFont, color: rgb(0.38, 0.45, 0.55) })
  cursorY -= 15
  const workerLines = (others.length > 0 ? others : foreman ? [] : workers).filter(Boolean)
  workerLines.forEach(worker => {
    page.drawText(sanitizePdfText(worker), { x, y: cursorY, size: 10, font, color: rgb(0.08, 0.11, 0.18) })
    cursorY -= 14
  })

  page.drawLine({
    start: { x, y: Math.min(y - 22, cursorY + 6) },
    end: { x: x + width, y: Math.min(y - 22, cursorY + 6) },
    thickness: 0.6,
    color: rgb(0.86, 0.89, 0.93),
  })
}

const embedImageFromUrl = async (pdfDoc: PDFDocument, url?: string | null) => {
  if (!url) return null
  const response = await fetch(url)
  if (!response.ok) return null
  const contentType = response.headers.get('content-type') ?? ''
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (contentType.includes('png') || url.toLowerCase().includes('.png')) {
    return pdfDoc.embedPng(bytes)
  }
  return pdfDoc.embedJpg(bytes)
}

const translateTextToGerman = async (text?: string | null) => {
  const cleanText = String(text ?? '').replace(/\r/g, '').trim()
  const deeplApiKey = Deno.env.get('DEEPL_API_KEY')
  const deeplEndpoint = Deno.env.get('DEEPL_API_URL') ?? 'https://api-free.deepl.com/v2/translate'
  if (!cleanText) return cleanText
  if (!deeplApiKey) {
    translationDebugMessage = 'DEEPL_API_KEY fehlt'
    return cleanText
  }

  try {
    const body = new URLSearchParams()
    body.set('text', cleanText)
    body.set('target_lang', 'DE')
    body.set('preserve_formatting', '1')

    const response = await fetch(deeplEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${deeplApiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    })
    const data = await response.json()
    if (!response.ok) {
      translationDebugMessage = `DeepL Fehler (${response.status}): ${data?.message ?? data?.error?.message ?? 'unbekannt'}`
      return cleanText
    }
    const translated = sanitizePdfText(data?.translations?.[0]?.text ?? '').trim()
    if (!translated || translated === cleanText) {
      translationDebugMessage = 'Keine nutzbare Uebersetzung erhalten (DeepL)'
      return cleanText
    }
    return translated
  } catch (error) {
    translationDebugMessage = `DeepL Ausnahme: ${error instanceof Error ? error.message : String(error)}`
    return cleanText
  }
}

const getGermanText = async (original?: string | null, translated?: string | null) => {
  const cleanOriginal = sanitizePdfText(original).trim()
  const cleanTranslated = sanitizePdfText(translated).trim()
  if (cleanTranslated && cleanTranslated !== cleanOriginal) return cleanTranslated
  return translateTextToGerman(cleanOriginal)
}

const buildCompanyPdfBase64 = async (email: EmailOutbox) => {
  const pdfDoc = await PDFDocument.create()
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const page = pdfDoc.addPage([595.28, 841.89])
  const { width, height } = page.getSize()

  const payload = email.payload ?? {}
  translationDebugMessage = null
  const totals = payload.totals ?? {}
  const workers = payload.worker_names?.length ? payload.worker_names : ['']
  const workerCount = Math.max(1, workers.filter(Boolean).length)
  const workMinutesPerPerson = Math.max(0, Number(totals.effective_minutes ?? totals.total_minutes ?? 0))
  const teamTotalMinutes = workMinutesPerPerson * workerCount
  const taskGerman = await getGermanText(payload.task, payload.task_de)
  const damageGerman = await getGermanText(payload.damage_description, payload.damage_description_de)
  const customerFeedbackGerman = await getGermanText(payload.customer_feedback, payload.customer_feedback_de)

  page.drawRectangle({ x: 0, y: height - 105, width, height: 105, color: rgb(0.04, 0.11, 0.19) })
  page.drawRectangle({ x: 0, y: height - 110, width, height: 5, color: rgb(0.04, 0.66, 0.78) })
  page.drawText('Voqenti', { x: 42, y: height - 52, size: 12, font: helveticaBold, color: rgb(0.68, 0.9, 0.96) })
  page.drawText('Tagesbericht', { x: 42, y: height - 84, size: 27, font: helveticaBold, color: rgb(1, 1, 1) })
  page.drawText(`Bericht Nr. ${email.id}`, { x: width - 150, y: height - 54, size: 10, font: helvetica, color: rgb(0.82, 0.88, 0.94) })
  if (payload.status) {
    page.drawText(`Status: ${sanitizePdfText(payload.status)}`, { x: width - 150, y: height - 72, size: 9, font: helveticaBold, color: rgb(0.82, 0.88, 0.94) })
  }

  const left = 42
  const right = width - 42
  let y = height - 145
  const colWidth = (right - left - 24) / 3

  drawLabelValue(page, 'Datum', toGermanDate(payload.work_date), left, y, colWidth, helvetica, helveticaBold)
  drawLabelValue(page, 'Auftragsnummer', payload.auftragsnummer ?? '-', left + colWidth + 12, y, colWidth, helvetica, helveticaBold)
  drawLabelValue(page, 'Objekt', payload.object_name ?? '-', left + (colWidth + 12) * 2, y, colWidth, helvetica, helveticaBold)

  y -= 58
  drawLabelValue(page, 'Von', `${toGermanTime(payload.start_time)} Uhr`, left, y, colWidth, helvetica, helveticaBold)
  drawLabelValue(page, 'Bis', `${toGermanTime(payload.end_time)} Uhr`, left + colWidth + 12, y, colWidth, helvetica, helveticaBold)
  drawWorkerBlock(page, workers, left + (colWidth + 12) * 2, y, colWidth, helvetica, helveticaBold)

  y -= 72
  page.drawText('Arbeitszeit', { x: left, y, size: 12, font: helveticaBold, color: rgb(0.08, 0.11, 0.18) })
  y -= 30
  const boxGap = 10
  const boxWidth = (right - left - boxGap * 3) / 4
  const timeBoxes = [
    ['Arbeitszeit / Person', minutesToText(workMinutesPerPerson)],
    ['Mitarbeiter', String(workerCount)],
    ['Team gesamt', minutesToText(teamTotalMinutes)],
    ['davon Fahrzeit', minutesToText(totals.fahrzeit_minutes)],
  ]
  timeBoxes.forEach(([label, value], index) => {
    const x = left + index * (boxWidth + boxGap)
    page.drawRectangle({ x, y: y - 38, width: boxWidth, height: 50, color: index === 2 ? rgb(0.9, 0.98, 0.94) : rgb(0.96, 0.98, 1) })
    page.drawText(label, { x: x + 10, y: y - 5, size: 8, font: helveticaBold, color: rgb(0.38, 0.45, 0.55) })
    page.drawText(value, { x: x + 10, y: y - 27, size: 15, font: helveticaBold, color: index === 2 ? rgb(0.05, 0.5, 0.26) : rgb(0.08, 0.11, 0.18) })
  })
  page.drawText(`Pause abgezogen: ${minutesToText(totals.pause_minutes)}`, {
    x: left,
    y: y - 58,
    size: 8,
    font: helvetica,
    color: rgb(0.38, 0.45, 0.55),
  })
  const entryTypeText = payload.entry_type === 'manual'
    ? `Zeiterfassung: Manuell${payload.correction_reason ? ` - ${sanitizePdfText(payload.correction_reason)}` : ''}`
    : 'Zeiterfassung: Automatisch'
  page.drawText(entryTypeText, {
    x: left + 170,
    y: y - 58,
    size: 8,
    font: helveticaBold,
    color: rgb(0.38, 0.45, 0.55),
  })

  y -= 82
  page.drawText('Offene Aufgaben', { x: left, y, size: 11, font: helveticaBold, color: rgb(0.08, 0.11, 0.18) })
  y -= 18
  const checklistRows: Array<[boolean | undefined, string]> = [
    [payload.checklist?.work_done, 'Arbeit ordnungsgemaess ausgefuehrt'],
    [payload.checklist?.work_time, 'Arbeitszeit erfasst'],
  ]
  checklistRows.forEach(([checked, label], index) => {
    const x = left + (index % 2) * 250
    const rowY = y - Math.floor(index / 2) * 16
    page.drawText(`${checked ? '[x]' : '[ ]'} ${label}`, {
      x,
      y: rowY,
      size: 8,
      font: checked ? helveticaBold : helvetica,
      color: checked ? rgb(0.05, 0.5, 0.26) : rgb(0.38, 0.45, 0.55),
    })
  })

  y -= 48
  page.drawText('Beschreibung der Arbeiten', { x: left, y, size: 13, font: helveticaBold, color: rgb(0.08, 0.11, 0.18) })
  y -= 23
  const description = [
    payload.object_name ? `Objekt: ${payload.object_name}` : '',
    taskGerman,
  ].filter(Boolean).join('\n')
  y = drawWrappedText(page, description || '-', left, y, right - left, helvetica, 10)
  if (translationDebugMessage) {
    y -= 14
    page.drawText(`Uebersetzung: ${sanitizePdfText(translationDebugMessage)}`, {
      x: left,
      y,
      size: 7,
      font: helvetica,
      color: rgb(0.7, 0.12, 0.12),
    })
  }

  if (payload.damage_present) {
    y -= 26
    page.drawRectangle({ x: left, y: y - 90, width: right - left, height: 110, color: rgb(1, 0.94, 0.94) })
    page.drawText('Schaden / Maengel', { x: left + 14, y, size: 12, font: helveticaBold, color: rgb(0.7, 0.12, 0.12) })
    y -= 22
    const damageText = damageGerman || 'Schaden gemeldet'
    drawWrappedText(page, damageText, left + 14, y, right - left - 28, helvetica, 10, rgb(0.28, 0.08, 0.08))
    if (payload.damage_image_url) {
      page.drawText('Foto vorhanden', { x: left + 14, y: y - 58, size: 9, font: helveticaBold, color: rgb(0.7, 0.12, 0.12) })
    }
    y -= 116
  } else {
    y -= 22
  }

  if (payload.customer_satisfied === false) {
    y -= 10
    page.drawRectangle({ x: left, y: y - 58, width: right - left, height: 76, color: rgb(1, 0.98, 0.9) })
    page.drawText('Beanstandung des Kunden', { x: left + 14, y, size: 11, font: helveticaBold, color: rgb(0.62, 0.36, 0.02) })
    y -= 20
    drawWrappedText(page, customerFeedbackGerman || '-', left + 14, y, right - left - 28, helvetica, 9, rgb(0.25, 0.18, 0.08))
    y -= 76
  }

  const damageImage = await embedImageFromUrl(pdfDoc, payload.damage_image_url)
  if (damageImage && y > 245) {
    const imageWidth = 170
    const imageHeight = Math.min(125, imageWidth / damageImage.width * damageImage.height)
    page.drawText('Schadenfoto', { x: left, y, size: 11, font: helveticaBold, color: rgb(0.08, 0.11, 0.18) })
    page.drawImage(damageImage, { x: left, y: y - imageHeight - 12, width: imageWidth, height: imageHeight })
  }

  const footerY = 85
  page.drawLine({ start: { x: left, y: footerY + 80 }, end: { x: right, y: footerY + 80 }, thickness: 0.8, color: rgb(0.86, 0.89, 0.93) })
  page.drawText('Abnahme', { x: left, y: footerY + 58, size: 11, font: helveticaBold, color: rgb(0.08, 0.11, 0.18) })
  page.drawText(payload.customer_satisfied === false ? 'Der Kunde hat eine Beanstandung eingetragen.' : 'Die Arbeiten wurden ordnungsgemaess ausgefuehrt und hiermit abgenommen.', {
    x: left,
    y: footerY + 38,
    size: 9,
    font: helvetica,
    color: rgb(0.24, 0.3, 0.38),
  })

  if (payload.client_signature_data_url?.startsWith('data:image/png')) {
    const signatureBytes = dataUrlToBytes(payload.client_signature_data_url)
    if (signatureBytes) {
      const signature = await pdfDoc.embedPng(signatureBytes)
      page.drawText('Unterschrift Kunde', { x: right - 190, y: footerY + 58, size: 8, font: helveticaBold, color: rgb(0.38, 0.45, 0.55) })
      page.drawImage(signature, { x: right - 190, y: footerY, width: 170, height: 45 })
      if (payload.customer_signed_at) {
        page.drawText(`Signiert: ${toGermanDate(payload.customer_signed_at.slice(0, 10))} ${toGermanTime(payload.customer_signed_at)} Uhr`, {
          x: right - 190,
          y: footerY - 12,
          size: 7,
          font: helvetica,
          color: rgb(0.38, 0.45, 0.55),
        })
      }
    }
  }

  const pdfBytes = await pdfDoc.save()
  return bytesToBase64(pdfBytes)
}

const buildReportAttachments = async (email: EmailOutbox) => {
  const attachments = [
    {
      filename: `tagesbericht-${email.id}.pdf`,
      content: await buildCompanyPdfBase64(email),
    },
  ]

  const imageUrls = [
    ...(email.payload?.damage_image_url ? [email.payload.damage_image_url] : []),
    ...(Array.isArray(email.payload?.attachment_urls) ? email.payload.attachment_urls : []),
  ]
  const uniqueImageUrls = Array.from(new Set(imageUrls.filter((url): url is string => Boolean(url))))

  for (let index = 0; index < uniqueImageUrls.length; index += 1) {
    const attachment = await buildImageAttachment(uniqueImageUrls[index], index + 1)
    if (attachment) attachments.push(attachment)
  }

  return attachments
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  let supabaseClient: ReturnType<typeof createClient> | null = null
  let outboxId: number | null = null

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const emailFrom = Deno.env.get('EMAIL_FROM') ?? 'Voqenti <onboarding@resend.dev>'

    if (!resendApiKey || !supabaseUrl || !serviceRoleKey) {
      throw new Error('Missing RESEND_API_KEY, SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    }

    const body = await req.json()
    outboxId = body.outbox_id
    if (!outboxId) throw new Error('Missing outbox_id')

    supabaseClient = createClient(supabaseUrl, serviceRoleKey)
    const { data: email, error: readError } = await supabaseClient
      .from('email_outbox')
      .select('*')
      .eq('id', outboxId)
      .single<EmailOutbox>()

    if (readError || !email) throw readError ?? new Error('Email not found')
    const senderEmail = email.payload?.creator_email ?? undefined
    if (email.report_id) {
      const { data: report } = await supabaseClient
        .from('tagesbericht')
        .select('email_sent,status')
        .eq('id', email.report_id)
        .maybeSingle()
      if (report?.email_sent || report?.status === 'Versendet') {
        throw new Error('Tagesbericht wurde bereits versendet')
      }
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: buildSender(emailFrom, email.payload?.creator_name ?? email.payload?.creator_email),
        to: [email.recipient],
        reply_to: senderEmail,
        subject: email.subject,
        html: email.html_body ?? '<p>Guten Tag,</p><p>anbei erhalten Sie den Tagesbericht als PDF.</p><p>Mit freundlichen Gruessen<br>Voqenti</p>',
        attachments: await buildReportAttachments(email),
      }),
    })

    const resendResult = await response.json()
    if (!response.ok) {
      throw new Error(resendResult?.message ?? 'Resend email failed')
    }

    await supabaseClient
      .from('email_outbox')
      .update({ status: 'sent', sent_at: new Date().toISOString(), error_message: translationDebugMessage })
      .eq('id', email.id)

    if (email.report_id) {
      await supabaseClient
        .from('tagesbericht')
        .update({ status: 'Versendet', email_sent: true, email_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', email.report_id)
    }

    return new Response(JSON.stringify({ ok: true, resend: resendResult }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    if (supabaseClient && outboxId) {
      await supabaseClient
        .from('email_outbox')
        .update({ status: 'error', error_message: message })
        .eq('id', outboxId)
    }

    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
