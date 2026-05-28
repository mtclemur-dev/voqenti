import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './supabaseClient'
import { DateTime } from 'luxon'
import { languages as i18nLanguages, uiTranslations } from './i18n'

function App() {
  const [oraStart, setOraStart] = useState(null)
  const [inLucru, setInLucru] = useState(false)
  const [currentId, setCurrentId] = useState(null)
  const [activeSession, setActiveSession] = useState(null)
  const [activeReportId, setActiveReportId] = useState(null)
  const [istoric, setIstoric] = useState([])
  const [nowTick, setNowTick] = useState(0) // used to refresh UI while a session is active
  const [user, setUser] = useState(null)
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [language, setLanguage] = useState('de')
  const [view, setView] = useState('pontaj') // 'pontaj' | 'reports' | 'times' | 'materials'
  const [reports, setReports] = useState([])
  const [reportObject, setReportObject] = useState('')
  const [dashboardObjectId, setDashboardObjectId] = useState('')
  const [dashboardAuftrag, setDashboardAuftrag] = useState('')
  const [objects, setObjects] = useState([])
  const [objectsError, setObjectsError] = useState('')
  const [selectedObjectId, setSelectedObjectId] = useState('')
  const [workers, setWorkers] = useState([])
  const [selectedWorkerIds, setSelectedWorkerIds] = useState([])
  const [workerPickerOpen, setWorkerPickerOpen] = useState(false)
  const [workerSearch, setWorkerSearch] = useState('')
  const [reportTask, setReportTask] = useState('')
  const [selectedWorkTemplates, setSelectedWorkTemplates] = useState([])
  const [workPickerOpen, setWorkPickerOpen] = useState(false)
  const [reportDamage, setReportDamage] = useState(false)
  const [reportDamageDescription, setReportDamageDescription] = useState('')
  const [reportDamageImage, setReportDamageImage] = useState(null)
  const [customerSatisfied, setCustomerSatisfied] = useState(true)
  const [customerFeedback, setCustomerFeedback] = useState('')
  const [reportFahrzeitMinutes, setReportFahrzeitMinutes] = useState('')
  const [reportAuftragsnummer, setReportAuftragsnummer] = useState('')
  const [reportStart, setReportStart] = useState(new Date().toISOString().slice(0,16))
  const [reportEnd, setReportEnd] = useState('')
  const [reportPauseMinutes, setReportPauseMinutes] = useState('0')
  const [reportEntryType, setReportEntryType] = useState('automatic')
  const [reportCorrectionReason, setReportCorrectionReason] = useState('')
  const [reportChecklist, setReportChecklist] = useState({
    workTime: false,
    workDone: false,
    equipmentBack: false,
    materialsBack: false,
  })
  const [editingReportId, setEditingReportId] = useState(null)
  const [existingDamageImageUrl, setExistingDamageImageUrl] = useState(null)
  const [workerEntries, setWorkerEntries] = useState([])
  const [dashboardPontaj, setDashboardPontaj] = useState([])
  const [dashboardReports, setDashboardReports] = useState([])
  const [dashboardEmails, setDashboardEmails] = useState([])
  const [dashboardMaterialCount, setDashboardMaterialCount] = useState(0)
  const [materialItems, setMaterialItems] = useState([])
  const [materialRequests, setMaterialRequests] = useState([])
  const [materialRequestObject, setMaterialRequestObject] = useState('')
  const [materialRequestObjectId, setMaterialRequestObjectId] = useState('')
  const [materialRequestDate, setMaterialRequestDate] = useState(DateTime.now().setZone('Europe/Berlin').toISODate())
  const [selectedMaterialRequestIds, setSelectedMaterialRequestIds] = useState([])
  const [materialRequestAmounts, setMaterialRequestAmounts] = useState({})
  const [materialRequestUnits, setMaterialRequestUnits] = useState({})
  const [materialRequestFreeText, setMaterialRequestFreeText] = useState('')
  const [materialSummarySending, setMaterialSummarySending] = useState(false)
  const [editingMaterialRequestId, setEditingMaterialRequestId] = useState(null)
  const [inventoryItems, setInventoryItems] = useState([])
  const [openCheckouts, setOpenCheckouts] = useState([])
  const [equipmentPanelOpen, setEquipmentPanelOpen] = useState(false)
  const [equipmentReturnAllOk, setEquipmentReturnAllOk] = useState(false)
  const [equipmentReturnNote, setEquipmentReturnNote] = useState('')
  const [workerSearchDate, setWorkerSearchDate] = useState(DateTime.now().setZone('Europe/Berlin').toISODate())
  const [workerSearchId, setWorkerSearchId] = useState('')
  const [isSigning, setIsSigning] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)
  const [reportSignatureDataUrl, setReportSignatureDataUrl] = useState(null)
  const [customerSignedAt, setCustomerSignedAt] = useState(null)
  const [signatureModalOpen, setSignatureModalOpen] = useState(false)
  const [isModalSigning, setIsModalSigning] = useState(false)
  const [notificationPermission, setNotificationPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
  )
  const signatureRef = useRef(null)
  const modalSignatureRef = useRef(null)
  const notifiedReviewIdsRef = useRef(new Set())
  const isAdmin = user?.email?.toLowerCase() === 'mtclemur@gmail.com'
  const currentWorker = workers.find(worker => worker.email?.toLowerCase() === user?.email?.toLowerCase())
  const isVorarbeiter = currentWorker?.role?.toLowerCase() === 'vorarbeiter' || currentWorker?.name?.toLowerCase().includes('plamadeala victor')
  const canEditLockedReports = isAdmin || isVorarbeiter
  const t = useCallback((key) => uiTranslations[language]?.[key] ?? uiTranslations.de[key] ?? key, [language])
  const isReviewStatus = useCallback((status) => status === 'In Prüfung' || status === 'In PrÃ¼fung', [])
  const reportStatusLabel = useCallback((status) => {
    const key = {
      ['In Prüfung']: 'inReview',
      ['In PrÃ¼fung']: 'inReview',
      'In Bearbeitung': 'inProgress',
      'Erfolgreich erfasst': 'successfullyRecorded',
      'Vom Kunden unterschrieben': 'customerSignedStatus',
      Versendet: 'sent',
      Gespeichert: 'saved',
      Entwurf: 'draft',
      'Bereit zum Versand': 'readyToSend',
    }[status]
    return key ? t(key) : (status || t('saved'))
  }, [t])
  const reportCardStatus = useCallback((report) => {
    if (report.email_sent || report.status === 'Versendet') {
      return { label: `⚫ ${t('sent')}`, tone: 'bg-slate-800 text-slate-200' }
    }
    if (report.locked_by_signature || report.customer_signed_at) {
      return { label: `🟢 ${t('customerAcceptanceDone')}`, tone: 'bg-emerald-500/15 text-emerald-200' }
    }
    if (isReviewStatus(report.status)) {
      return { label: `🟡 ${t('waitingForReview')}`, tone: 'bg-amber-500/15 text-amber-200' }
    }
    if (report.status === 'In Bearbeitung') {
      return { label: `🔵 ${t('inProgress')}`, tone: 'bg-cyan-500/15 text-cyan-200' }
    }
    return { label: `🔵 ${reportStatusLabel(report.status)}`, tone: 'bg-cyan-500/15 text-cyan-200' }
  }, [isReviewStatus, reportStatusLabel, t])
  const notifyReviewNeeded = useCallback((report) => {
    if (!canEditLockedReports || !report?.id || !isReviewStatus(report.status)) return
    if (notifiedReviewIdsRef.current.has(report.id)) return
    notifiedReviewIdsRef.current.add(report.id)

    const title = t('reviewNotificationTitle')
    const body = `${report.object_name || t('report')} ${t('reviewNotificationBody')}`

    if (navigator.vibrate) navigator.vibrate([180, 90, 180])
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(title, { body, tag: `tagesbericht-${report.id}` })
    }
  }, [canEditLockedReports, isReviewStatus, t])
  const handleEnableNotifications = async () => {
    if (typeof Notification === 'undefined') {
      alert(t('notificationsUnsupported'))
      return
    }
    const permission = await Notification.requestPermission()
    setNotificationPermission(permission)
    if (permission === 'granted' && navigator.vibrate) navigator.vibrate(120)
  }
  const materialRequestUnitsList = ['Stueck', 'Rolle', 'Karton', 'Flasche', 'Kanister', 'Packung', 'Liter', 'Paar', 'Set']
  const workTemplateOptions = [
    'Unterhaltsreinigung',
    'Grundreinigung',
    'Grundreinigung mit 2-Schicht-Beschichtung',
    'Glas- und Rahmenreinigung',
    'Bauendreinigung',
    'Industriereinigung',
    'Sonderreinigung',
  ]
  const correctionReasons = ['Start vergessen', 'Stop vergessen', 'Handy leer', 'Keine Internetverbindung', 'Nachtrag durch Mitarbeiter']

  const secondsBetween = (start, end) => {
    if (!start) return 0
    const startTime = new Date(start).getTime()
    const endTime = new Date(end).getTime()
    if (Number.isNaN(startTime) || Number.isNaN(endTime)) return 0
    return Math.max(0, Math.floor((endTime - startTime) / 1000))
  }

  const formatDurationSeconds = (seconds = 0) => {
    const safeSeconds = Math.max(0, Math.floor(seconds))
    const hours = Math.floor(safeSeconds / 3600)
    const minutes = Math.floor((safeSeconds % 3600) / 60)
    return `${hours}h ${minutes}m`
  }

  const formatDurationMinutes = (minutes = 0) => formatDurationSeconds(minutesToSeconds(minutes))

  const minutesToSeconds = (minutes = 0) => Math.max(0, Number(minutes || 0) * 60)

  const secondsToMinutes = (seconds = 0) => Math.max(0, Math.round(Number(seconds || 0) / 60))

  const selectedReportObject = objects.find(object => object.id === selectedObjectId)
  const selectedWorkersForReport = workers.filter(worker => selectedWorkerIds.includes(worker.id))
  const workerSummary = selectedWorkersForReport.length === 0
    ? ''
    : `${selectedWorkersForReport.slice(0, 2).map(worker => worker.name).join(', ')}${selectedWorkersForReport.length > 2 ? ` +${selectedWorkersForReport.length - 2}` : ''}`
  const filteredWorkers = workers.filter(worker => worker.name.toLowerCase().includes(workerSearch.trim().toLowerCase()))
  const workSummary = selectedWorkTemplates.length === 0
    ? ''
    : `${selectedWorkTemplates.slice(0, 2).join(', ')}${selectedWorkTemplates.length > 2 ? ` +${selectedWorkTemplates.length - 2}` : ''}`
  const currentObjectForEquipment = selectedReportObject ?? objects.find(object => object.name.toLowerCase() === reportObject.trim().toLowerCase())

  const getStoredSeconds = (record, minutesKey, secondsKey) => {
    const minutesValue = Number(record?.[minutesKey] ?? 0)
    if (minutesValue > 0) return minutesToSeconds(minutesValue)
    return Number(record?.[secondsKey] ?? 0)
  }

  const compressImageFile = (file, { maxWidth = 1200, quality = 0.7 } = {}) =>
    new Promise((resolve, reject) => {
      if (!file?.type?.startsWith('image/')) {
        resolve(file)
        return
      }

      const image = new Image()
      const url = URL.createObjectURL(file)

      image.onload = () => {
        try {
          const scale = Math.min(1, maxWidth / image.width)
          const width = Math.max(1, Math.round(image.width * scale))
          const height = Math.max(1, Math.round(image.height * scale))
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          ctx.drawImage(image, 0, 0, width, height)

          const finish = (blob, extension) => {
            URL.revokeObjectURL(url)
            if (!blob) {
              resolve(file)
              return
            }
            const cleanName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9._-]/g, '_')
            resolve(new File([blob], `${cleanName}.${extension}`, { type: blob.type, lastModified: Date.now() }))
          }

          canvas.toBlob(
            blob => {
              if (blob) finish(blob, 'webp')
              else canvas.toBlob(jpgBlob => finish(jpgBlob, 'jpg'), 'image/jpeg', quality)
            },
            'image/webp',
            quality,
          )
        } catch (error) {
          URL.revokeObjectURL(url)
          reject(error)
        }
      }

      image.onerror = () => {
        URL.revokeObjectURL(url)
        resolve(file)
      }

      image.src = url
    })

  const buildMinuteTotals = (totals) => ({
    total_minutes: secondsToMinutes(totals.total_seconds),
    pause_minutes: secondsToMinutes(totals.pause_seconds),
    auto_pause_minutes: secondsToMinutes(totals.auto_pause_seconds),
    fahrzeit_minutes: secondsToMinutes(totals.fahrzeit_seconds),
    effective_minutes: secondsToMinutes(totals.effective_seconds),
  })

  const getBerlinDateISO = (iso) => DateTime.fromISO(iso, { zone: 'utc' }).setZone('Europe/Berlin').toISODate()

  const isTodayBerlin = (iso) => {
    if (!iso) return false
    return getBerlinDateISO(iso) === DateTime.now().setZone('Europe/Berlin').toISODate()
  }

  const getRequiredPauseSeconds = (totalSeconds) => {
    if (totalSeconds >= 9 * 60 * 60) return 60 * 60
    if (totalSeconds > 5 * 60 * 60) return 30 * 60
    return 0
  }

  const calculateSessionTotals = (session, endIso) => {
    const savedTotal = getStoredSeconds(session, 'total_minutes', 'total_seconds')
    const currentInterval = session?.status === 'activ'
      ? secondsBetween(session?.mode_changed_at ?? session?.Uhrzeit_Start, endIso)
      : 0
    const total = savedTotal + currentInterval
    const savedPause = getStoredSeconds(session, 'pause_minutes', 'pause_seconds')
    const savedAutoPause = getStoredSeconds(session, 'auto_pause_minutes', 'auto_pause_seconds')
    let manualPause = Math.max(0, savedPause - savedAutoPause)
    let fahrzeit = getStoredSeconds(session, 'fahrzeit_minutes', 'fahrzeit_seconds')

    const requiredPause = getRequiredPauseSeconds(total)
    const autoPause = Math.max(0, requiredPause - manualPause)
    const totalPause = manualPause + autoPause

    return {
      total_seconds: total,
      pause_seconds: totalPause,
      manual_pause_seconds: manualPause,
      auto_pause_seconds: autoPause,
    fahrzeit_seconds: fahrzeit,
      effective_seconds: Math.max(0, total - totalPause),
    }
  }

  const calculateReportTotals = (session, endIso, fahrzeitSeconds = 0) => {
    const total = secondsBetween(session?.mode_changed_at ?? session?.Uhrzeit_Start, endIso)
    const autoPause = getRequiredPauseSeconds(total)

    return {
      total_seconds: total,
      pause_seconds: autoPause,
      manual_pause_seconds: 0,
      auto_pause_seconds: autoPause,
      fahrzeit_seconds: fahrzeitSeconds,
      effective_seconds: Math.max(0, total - autoPause),
    }
  }

  const calculateStandaloneReportTotals = (startIso, endIso, fahrzeitSeconds = 0) => {
    const total = secondsBetween(startIso, endIso)
    const autoPause = getRequiredPauseSeconds(total)

    return {
      total_seconds: total,
      pause_seconds: autoPause,
      manual_pause_seconds: 0,
      auto_pause_seconds: autoPause,
      fahrzeit_seconds: fahrzeitSeconds,
      effective_seconds: Math.max(0, total - autoPause),
    }
  }

  const formatDateBerlin = useCallback((iso) => {
    if (!iso) return ''
    try {
      return DateTime.fromISO(iso, { zone: 'utc' }).setZone('Europe/Berlin').toFormat("ccc d LLL")
    } catch {
      return new Date(iso).toLocaleDateString('ro-RO')
    }
  }, [])

  const formatTimeBerlin = useCallback((iso) => {
    if (!iso) return ''
    try {
      return DateTime.fromISO(iso, { zone: 'utc' }).setZone('Europe/Berlin').toFormat('HH:mm')
    } catch {
      return new Date(iso).toLocaleTimeString()
    }
  }, [])

  const incarcaIstoric = useCallback(async () => {
    if (!user) {
      setIstoric([])
      return
    }
    const { data, error } = await supabase
      .from('pontaj')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5)

    if (!error) setIstoric(data)
  }, [user])

  const incarcaDashboardSummary = useCallback(async () => {
    if (!user) {
      setDashboardPontaj([])
      setDashboardReports([])
      setDashboardEmails([])
      setDashboardMaterialCount(0)
      return
    }

    const today = DateTime.now().setZone('Europe/Berlin').toISODate()

    const { data: pontajData, error: pontajError } = await supabase
      .from('pontaj')
      .select('id, Uhrzeit_Start, Uhrzeit_Ende, status, report_id, total_minutes, pause_minutes, auto_pause_minutes, fahrzeit_minutes, effective_minutes, entry_type, correction_reason, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)

    if (!pontajError) {
      setDashboardPontaj((pontajData ?? []).filter(row => isTodayBerlin(row.Uhrzeit_Start ?? row.created_at)))
    } else {
      setDashboardPontaj([])
    }

    const { data: reportData, error: reportError } = await supabase
      .from('tagesbericht')
      .select('id, start_time, end_time, object_name, auftragsnummer, damage_image_url, pontaj_id, status, email_sent, email_sent_at, checklist_work_time, checklist_work_done, checklist_equipment_back, checklist_materials_back, created_at')
      .order('created_at', { ascending: false })
      .limit(20)

    const todayReports = !reportError
      ? (reportData ?? []).filter(row => isTodayBerlin(row.start_time ?? row.created_at))
      : []
    setDashboardReports(todayReports)

    if (todayReports.length > 0) {
      const reportIds = todayReports.map(report => report.id)
      const { data: emailData, error: emailError } = await supabase
        .from('email_outbox')
        .select('report_id, status, sent_at, created_at')
        .in('report_id', reportIds)
        .order('created_at', { ascending: false })

      setDashboardEmails(emailError ? [] : (emailData ?? []))
    } else {
      setDashboardEmails([])
    }

    const { count, error: materialError } = await supabase
      .from('material_requests')
      .select('id', { count: 'exact', head: true })
      .eq('request_date', today)

    setDashboardMaterialCount(materialError ? 0 : (count ?? 0))
  }, [user])

  const verificaSesiuneActiva = useCallback(async () => {
    if (!user) return
    const { data, error } = await supabase
      .from('pontaj')
      .select('*')
      .eq('status', 'activ')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)

    if (!error && data && data.length > 0) {
      const sesiune = data[0]
      setCurrentId(sesiune.id)
      setActiveSession(sesiune)
      setInLucru(true)
      setNowTick(new Date().getTime())
      setActiveReportId(sesiune.report_id ?? null)
      setOraStart(formatTimeBerlin(sesiune.mode_changed_at ?? sesiune.Uhrzeit_Start))
    } else {
      setInLucru(false)
      setCurrentId(null)
      setActiveSession(null)
      setActiveReportId(null)
      setOraStart(null)
    }
  }, [formatTimeBerlin, user])

  const incarcaReports = useCallback(async () => {
    if (!user) {
      setReports([])
      return
    }
    const { data, error } = await supabase
      .from('tagesbericht')
      .select('id, user_id, start_time, end_time, object_id, object_name, auftragsnummer, worker_ids, worker_names, task, task_de, damage_present, damage_description, damage_description_de, damage_image_url, customer_satisfied, customer_feedback, customer_feedback_de, worker_email, total_minutes, pause_minutes, auto_pause_minutes, fahrzeit_minutes, effective_minutes, pontaj_id, status, email_sent, email_sent_at, entry_type, correction_reason, checklist_work_time, checklist_work_done, checklist_equipment_back, checklist_materials_back, customer_signed_at, locked_by_signature, locked_at, locked_reason, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(10)

    if (!error) setReports(data)
  }, [user])

  const incarcaObjects = useCallback(async () => {
    setObjectsError('')
    const { data, error } = await supabase
      .from('objects')
      .select('id, name, address')
      .order('name', { ascending: true })
    if (error) {
      console.error('Objects load error:', error)
      setObjects([])
      setObjectsError(error.message)
    } else {
      setObjects(data ?? [])
    }
  }, [])

  const incarcaWorkers = useCallback(async () => {
    const { data, error } = await supabase
      .from('workers')
      .select('id, name, email, role, active')
      .eq('active', true)
      .order('name', { ascending: true })

    if (!error) setWorkers(data ?? [])
  }, [])

  const incarcaMaterialbedarf = useCallback(async () => {
    const { data: itemsData, error: itemsError } = await supabase
      .from('material_items')
      .select('*')
      .eq('active', true)
      .order('name', { ascending: true })

    if (itemsError) {
      console.error('Material items load error:', itemsError)
      setMaterialItems([])
    } else {
      setMaterialItems(itemsData ?? [])
    }

    const { data: requestData, error: requestError } = await supabase
      .from('material_requests')
      .select('*, material_request_items(*, material_items(name))')
      .eq('request_date', materialRequestDate)
      .order('created_at', { ascending: false })
      .limit(50)

    if (requestError) {
      console.error('Material request load error:', requestError)
      setMaterialRequests([])
    } else {
      setMaterialRequests(requestData ?? [])
    }
  }, [materialRequestDate])

  const incarcaInventory = useCallback(async () => {
    if (!user) {
      setInventoryItems([])
      setOpenCheckouts([])
      return
    }

    const { data: itemsData, error: itemsError } = await supabase
      .from('inventory_items')
      .select('*')
      .order('category', { ascending: true })
      .order('name', { ascending: true })

    if (itemsError) {
      console.error('Inventory load error:', itemsError)
      setInventoryItems([])
    } else {
      setInventoryItems(itemsData ?? [])
    }

    let checkoutQuery = supabase
      .from('inventory_checkouts')
      .select('*, inventory_items(name, category, image_url)')
      .is('returned_at', null)
      .order('taken_at', { ascending: false })

    if (!isAdmin && !isVorarbeiter) {
      checkoutQuery = checkoutQuery.eq('user_id', user.id)
    }

    const { data: checkoutData, error: checkoutError } = await checkoutQuery
    if (checkoutError) {
      console.error('Inventory checkout load error:', checkoutError)
      setOpenCheckouts([])
    } else {
      setOpenCheckouts(checkoutData ?? [])
    }
  }, [isAdmin, isVorarbeiter, user])

  const incarcaWorkerEntries = useCallback(async () => {
    if (!user) {
      setWorkerEntries([])
      return
    }

    let query = supabase
      .from('worker_time_entries')
      .select('*')
      .eq('work_date', workerSearchDate)
      .order('worker_name', { ascending: true })
      .order('object_name', { ascending: true })

    if (isAdmin && workerSearchId) {
      query = query.eq('worker_id', workerSearchId)
    } else if (!isAdmin && currentWorker?.id) {
      query = query.eq('worker_id', currentWorker.id)
    } else if (!isAdmin && user?.email) {
      query = query.eq('worker_name', user.email)
    }

    const { data, error } = await query
    if (error) {
      console.error('Worker time entries load error:', error)
      setWorkerEntries([])
    } else {
      setWorkerEntries(data ?? [])
    }
  }, [currentWorker, isAdmin, user, workerSearchDate, workerSearchId])

  // Initialize auth and listen for changes
  useEffect(() => {
    const initAuth = async () => {
      const { data } = await supabase.auth.getUser()
      const u = data?.user ?? null
      setUser(u)
      if (u) {
        setLanguage(u.user_metadata?.preferred_language ?? 'de')
        setView('pontaj')
      }
    }
    initAuth()

    const { data: { subscription } = {} } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        setLanguage(session.user.user_metadata?.preferred_language ?? 'de')
        setView('pontaj')
      }
    })

    return () => subscription?.unsubscribe()
  }, [])

  // Load data and subscribe to realtime changes for the current user
  useEffect(() => {
    incarcaIstoric()
    incarcaDashboardSummary()
    verificaSesiuneActiva()

    const channel = supabase
      .channel(`pontaj-listener-${user?.id ?? 'anon'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pontaj' }, (payload) => {
        // only react to changes for the current user
        const record = payload?.new ?? payload?.old
        if (user && record && record.user_id !== user.id) return
        incarcaIstoric()
        incarcaDashboardSummary()
        verificaSesiuneActiva()
      })
      .subscribe()

    return () => {
      try {
        supabase.removeChannel(channel)
      } catch {
        channel.unsubscribe()
      }
    }
  }, [incarcaDashboardSummary, incarcaIstoric, user, verificaSesiuneActiva])

  useEffect(() => {
    if (view === 'reports') {
      incarcaReports()
      incarcaObjects()
      incarcaWorkers()
      incarcaInventory()
    }
    if (view === 'pontaj') {
      incarcaObjects()
    }
    if (view === 'times') {
      incarcaWorkers()
      incarcaWorkerEntries()
    }
    if (view === 'materials') {
      incarcaObjects()
      incarcaMaterialbedarf()
      incarcaInventory()
    }
  }, [incarcaInventory, incarcaMaterialbedarf, incarcaObjects, incarcaReports, incarcaWorkerEntries, incarcaWorkers, view, user])

  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel(`dashboard-summary-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tagesbericht' }, (payload) => {
        const report = payload?.new
        if (report) notifyReviewNeeded(report)
        incarcaDashboardSummary()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'email_outbox' }, () => {
        incarcaDashboardSummary()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'material_requests' }, () => {
        incarcaDashboardSummary()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_checkouts' }, () => {
        incarcaInventory()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items' }, () => {
        incarcaInventory()
      })
      .subscribe()

    return () => {
      try {
        supabase.removeChannel(channel)
      } catch {
        channel.unsubscribe()
      }
    }
  }, [incarcaDashboardSummary, incarcaInventory, notifyReviewNeeded, user])

  const getSignatureDataUrl = () => {
    return reportSignatureDataUrl
  }

  const signatureIsLocked = Boolean(editingReportId && customerSignedAt && !canEditLockedReports)

  const openSignatureModal = () => {
    if (signatureIsLocked) {
      alert(t('signedLocked'))
      return
    }
    setSignatureModalOpen(true)
    setTimeout(() => {
      const canvas = modalSignatureRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      if (reportSignatureDataUrl) {
        const img = new Image()
        img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        img.src = reportSignatureDataUrl
      }
    }, 0)
  }

  const getModalCanvasPoint = (event) => {
    const canvas = modalSignatureRef.current
    const rect = canvas.getBoundingClientRect()
    const source = event.touches?.[0] ?? event
    return {
      x: (source.clientX - rect.left) * (canvas.width / rect.width),
      y: (source.clientY - rect.top) * (canvas.height / rect.height),
    }
  }

  const startModalSignature = (event) => {
    event.preventDefault()
    const canvas = modalSignatureRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const point = getModalCanvasPoint(event)
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(point.x, point.y)
    setIsModalSigning(true)
  }

  const drawModalSignature = (event) => {
    if (!isModalSigning) return
    event.preventDefault()
    const canvas = modalSignatureRef.current
    const ctx = canvas.getContext('2d')
    const point = getModalCanvasPoint(event)
    ctx.lineTo(point.x, point.y)
    ctx.stroke()
  }

  const stopModalSignature = () => setIsModalSigning(false)

  const clearModalSignature = () => {
    const canvas = modalSignatureRef.current
    if (!canvas) return
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
  }

  const applyModalSignature = () => {
    const canvas = modalSignatureRef.current
    if (!canvas) return
    setReportSignatureDataUrl(canvas.toDataURL('image/png'))
    setCustomerSignedAt(new Date().toISOString())
    setHasSignature(true)
    setSignatureModalOpen(false)
  }

  const getCanvasPoint = (event) => {
    const canvas = signatureRef.current
    const rect = canvas.getBoundingClientRect()
    const source = event.touches?.[0] ?? event
    return {
      x: (source.clientX - rect.left) * (canvas.width / rect.width),
      y: (source.clientY - rect.top) * (canvas.height / rect.height),
    }
  }

  const startSignature = (event) => {
    event.preventDefault()
    const canvas = signatureRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const point = getCanvasPoint(event)
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(point.x, point.y)
    setIsSigning(true)
    setHasSignature(true)
  }

  const drawSignature = (event) => {
    if (!isSigning) return
    event.preventDefault()
    const canvas = signatureRef.current
    const ctx = canvas.getContext('2d')
    const point = getCanvasPoint(event)
    ctx.lineTo(point.x, point.y)
    ctx.stroke()
  }

  const stopSignature = () => setIsSigning(false)

  const clearSignature = () => {
    if (signatureIsLocked) {
      alert(t('signedLocked'))
      return
    }
    setReportSignatureDataUrl(null)
    setCustomerSignedAt(null)
    setHasSignature(false)
    setIsSigning(false)
  }

  const resetReportForm = () => {
    setEditingReportId(null)
    setExistingDamageImageUrl(null)
    setReportObject('')
    setSelectedObjectId('')
    setReportTask('')
    setSelectedWorkTemplates([])
    setReportDamage(false)
    setReportDamageDescription('')
    setReportDamageImage(null)
    setCustomerSatisfied(true)
    setCustomerFeedback('')
    setReportFahrzeitMinutes('')
    setReportAuftragsnummer('')
    setReportEnd('')
    setReportPauseMinutes('0')
    setReportEntryType('automatic')
    setReportCorrectionReason('')
    setReportChecklist({ workTime: false, workDone: false, equipmentBack: false, materialsBack: false })
    setEquipmentReturnAllOk(false)
    setEquipmentReturnNote('')
    setReportSignatureDataUrl(null)
    setCustomerSignedAt(null)
    setSignatureModalOpen(false)
    setSelectedWorkerIds([])
    setWorkerPickerOpen(false)
    setWorkerSearch('')
    setReportStart(new Date().toISOString().slice(0,16))
    clearSignature()
  }

  const handleEditReport = async (report) => {
    const lockedBySignature = Boolean(report.locked_by_signature || report.customer_signed_at)
    if ((report.email_sent || report.status === 'Versendet' || lockedBySignature) && !canEditLockedReports) {
      alert(lockedBySignature ? t('signedLocked') : t('sentAlready'))
      return
    }

    const { data: fullReport, error } = await supabase
      .from('tagesbericht')
      .select('*')
      .eq('id', report.id)
      .single()

    if (error || !fullReport) {
      alert(`${t('reportLoadError')} ${error?.message ?? ''}`)
      return
    }

    setEditingReportId(fullReport.id)
    setExistingDamageImageUrl(fullReport.damage_image_url ?? null)
    setReportObject(fullReport.object_name ?? '')
    setSelectedObjectId(fullReport.object_id ?? '')
    setReportTask(fullReport.task ?? '')
    setSelectedWorkTemplates([])
    setReportDamage(Boolean(fullReport.damage_present))
    setReportDamageDescription(fullReport.damage_description ?? '')
    setReportDamageImage(null)
    setCustomerSatisfied(fullReport.customer_satisfied !== false)
    setCustomerFeedback(fullReport.customer_feedback ?? '')
    setReportFahrzeitMinutes(String(fullReport.fahrzeit_minutes ?? ''))
    setReportAuftragsnummer(fullReport.auftragsnummer ?? '')
    setReportEnd(fullReport.end_time ? DateTime.fromISO(fullReport.end_time, { zone: 'utc' }).setZone('Europe/Berlin').toFormat("yyyy-MM-dd'T'HH:mm") : '')
    setReportPauseMinutes(String(fullReport.pause_minutes ?? 0))
    setReportEntryType(fullReport.entry_type ?? 'automatic')
    setReportCorrectionReason(fullReport.correction_reason ?? '')
    setReportSignatureDataUrl(fullReport.customer_signature_data ?? fullReport.client_signature_data_url ?? null)
    setCustomerSignedAt(fullReport.customer_signed_at ?? null)
    setHasSignature(Boolean(fullReport.customer_signature_data ?? fullReport.client_signature_data_url))
    setReportChecklist({
      workTime: Boolean(fullReport.checklist_work_time ?? fullReport.checklist?.workTime),
      workDone: Boolean(fullReport.checklist_work_done ?? fullReport.checklist?.workDone),
      equipmentBack: Boolean(fullReport.checklist_equipment_back ?? fullReport.checklist?.equipmentBack),
      materialsBack: Boolean(fullReport.checklist_materials_back ?? fullReport.checklist?.materialsBack),
    })
    setSelectedWorkerIds(Array.isArray(fullReport.worker_ids) ? fullReport.worker_ids : [])
    setReportStart(fullReport.start_time ? DateTime.fromISO(fullReport.start_time, { zone: 'utc' }).setZone('Europe/Berlin').toFormat("yyyy-MM-dd'T'HH:mm") : new Date().toISOString().slice(0,16))
    setView('reports')
  }

  const markReportTimeManual = () => {
    setReportEntryType('manual')
  }

  const handleReportChecklistToggle = (key) => {
    setReportChecklist(current => ({ ...current, [key]: !current[key] }))
  }

  const translateToGerman = async (text) => {
    const cleanText = text?.trim()
    if (!cleanText) return null

    const { data, error } = await supabase.functions.invoke('translate-to-german', {
      body: { text: cleanText },
    })

    if (error) {
      console.error('Translation error:', error)
      return null
    }

    return data
  }

  const handleReportObjectChange = (value) => {
    setReportObject(value)
    const matchedObject = objects.find(object => object.name.toLowerCase() === value.trim().toLowerCase())
    setSelectedObjectId(matchedObject?.id ?? '')
  }

  const handleWorkerToggle = (workerId) => {
    setSelectedWorkerIds(current =>
      current.includes(workerId)
        ? current.filter(id => id !== workerId)
        : [...current, workerId]
    )
  }

  const handleWorkTemplateToggle = (template) => {
    setSelectedWorkTemplates(current => {
      if (current.includes(template)) return current.filter(item => item !== template)
      const next = [...current, template]
      if (!reportTask.trim()) {
        setReportTask(`${template} - `)
      } else if (!reportTask.trim().startsWith(template)) {
        setReportTask(`${template} - ${reportTask.trim()}`)
      }
      return next
    })
  }

  const handleMaterialRequestObjectChange = (value) => {
    setMaterialRequestObject(value)
    const matchedObject = objects.find(object => object.name.toLowerCase() === value.trim().toLowerCase())
    setMaterialRequestObjectId(matchedObject?.id ?? '')
  }

  const handleMaterialRequestToggle = (itemId) => {
    setSelectedMaterialRequestIds(current =>
      current.includes(itemId)
        ? current.filter(id => id !== itemId)
        : [...current, itemId]
    )
  }

  const handleSaveMaterialRequest = async (event) => {
    event?.preventDefault()
    if (!user) return alert(t('loginRequired'))
    if (!materialRequestObject.trim()) return alert(t('objectRequired'))
    if (selectedMaterialRequestIds.length === 0 && !materialRequestFreeText.trim()) return alert(t('materialRequired'))

    const selectedItems = materialItems.filter(item => selectedMaterialRequestIds.includes(item.id))
    const requestPayload = {
        objekt_id: materialRequestObjectId || null,
        objekt_name: materialRequestObject.trim(),
        auftrag_id: null,
        reporter_name: currentWorker?.name ?? user.email ?? 'Benutzer',
        reporter_email: user.email ?? null,
        request_date: materialRequestDate,
        note: null,
        updated_at: new Date().toISOString(),
      }

    const requestQuery = editingMaterialRequestId
      ? supabase
        .from('material_requests')
        .update(requestPayload)
        .eq('id', editingMaterialRequestId)
        .eq('user_id', user.id)
        .eq('summary_sent', false)
        .select('id')
        .single()
      : supabase
        .from('material_requests')
        .insert([{
          ...requestPayload,
          user_id: user.id,
          status: 'offen',
        }])
      .select('id')
      .single()

    const { data: requestData, error: requestError } = await requestQuery

    if (requestError) {
      alert(`${t('materialSaveError')} ${requestError.message}`)
      return
    }

    const rows = selectedItems.map(item => ({
      material_request_id: requestData.id,
      material_item_id: item.id,
      unit: materialRequestUnits[item.id] || item.unit || null,
      quantity: materialRequestAmounts[item.id] ? Math.max(1, Math.round(Number(materialRequestAmounts[item.id]))) : null,
      note: null,
    }))

    if (materialRequestFreeText.trim()) {
      rows.push({
        material_request_id: requestData.id,
        custom_name: materialRequestFreeText.trim(),
        quantity: null,
        unit: null,
        note: null,
      })
    }

    if (editingMaterialRequestId) {
      const { error: deleteError } = await supabase
        .from('material_request_items')
        .delete()
        .eq('material_request_id', requestData.id)
      if (deleteError) {
        alert(`${t('materialPositionsError')} ${deleteError.message}`)
        return
      }
    }

    if (rows.length > 0) {
      const { error: itemError } = await supabase.from('material_request_items').insert(rows)
      if (itemError) {
        alert(`${t('materialPositionsError')} ${itemError.message}`)
        return
      }
    }

    setSelectedMaterialRequestIds([])
    setMaterialRequestAmounts({})
    setMaterialRequestUnits({})
    setMaterialRequestFreeText('')
    setMaterialRequestObject('')
    setMaterialRequestObjectId('')
    setEditingMaterialRequestId(null)
    incarcaMaterialbedarf()
    alert(t('requestSaved'))
  }

  const handleEditMaterialRequest = (request) => {
    if (request.summary_sent) {
      alert(t('materialSentAlready'))
      return
    }
    setEditingMaterialRequestId(request.id)
    setMaterialRequestObject(request.objekt_name ?? '')
    setMaterialRequestObjectId(request.objekt_id ?? '')
    setMaterialRequestDate(request.request_date ?? materialRequestDate)
    const itemIds = []
    const amounts = {}
    const units = {}
    const freeText = []

    ;(request.material_request_items ?? []).forEach(item => {
      if (item.material_item_id) {
        itemIds.push(item.material_item_id)
        amounts[item.material_item_id] = item.quantity ? String(Math.max(1, Math.round(Number(item.quantity)))) : ''
        units[item.material_item_id] = item.unit ?? ''
      } else if (item.custom_name) {
        freeText.push(item.custom_name)
      }
    })

    setSelectedMaterialRequestIds(itemIds)
    setMaterialRequestAmounts(amounts)
    setMaterialRequestUnits(units)
    setMaterialRequestFreeText(freeText.join('\n'))
  }

  const resetMaterialRequestForm = () => {
    setEditingMaterialRequestId(null)
    setMaterialRequestObject('')
    setMaterialRequestObjectId('')
    setSelectedMaterialRequestIds([])
    setMaterialRequestAmounts({})
    setMaterialRequestUnits({})
    setMaterialRequestFreeText('')
  }

  const handleMaterialRequestStatus = async (requestId, status) => {
    if (!isAdmin && !isVorarbeiter) return
    const { error } = await supabase
      .from('material_requests')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', requestId)

    if (error) {
      alert(`${t('statusSaveError')} ${error.message}`)
      return
    }
    incarcaMaterialbedarf()
  }

  const handleSendMaterialSummary = async () => {
    if (!user) return alert(t('loginRequired'))
    setMaterialSummarySending(true)
    try {
      const { data, error } = await supabase.functions.invoke('send-materialbedarf-summary', {
        body: { request_date: materialRequestDate },
      })

      if (error) {
        alert(`${t('materialSendError')} ${error.message}`)
        return
      }
      if (data?.ok === false) {
        alert(`${t('materialSendError')} ${data?.error ?? ''}`)
        return
      }

      await incarcaMaterialbedarf()
      alert(t('materialSummarySent'))
    } finally {
      setMaterialSummarySending(false)
    }
  }

  const handleTakeEquipment = async (item) => {
    if (!user) return alert(t('loginRequired'))
    const selectedObject = currentObjectForEquipment
    const { error: checkoutError } = await supabase.from('inventory_checkouts').insert([{
      inventory_item_id: item.id,
      user_id: user.id,
      worker_name: currentWorker?.name ?? user.email ?? 'Benutzer',
      worker_email: user.email ?? null,
      object_id: selectedObject?.id ?? null,
      object_name: selectedObject?.name ?? (reportObject || null),
      taken_at: new Date().toISOString(),
      status: 'unterwegs',
    }])

    if (checkoutError) {
      alert(`${t('equipmentTakeError')} ${checkoutError.message}`)
      return
    }

    const { error: updateError } = await supabase
      .from('inventory_items')
      .update({ status: 'unterwegs', updated_at: new Date().toISOString() })
      .eq('id', item.id)
      .eq('status', 'verfuegbar')

    if (updateError) {
      alert(`${t('equipmentStatusError')} ${updateError.message}`)
    }
    incarcaInventory()
  }

  const handleUndoEquipmentCheckout = async (checkout) => {
    if (!user) return alert(t('loginRequired'))
    if (!window.confirm(t('equipmentUndoConfirm'))) return

    const now = new Date().toISOString()
    const { error: checkoutError } = await supabase
      .from('inventory_checkouts')
      .update({
        returned_at: now,
        return_clean: true,
        return_functional: true,
        return_note: 'Korrektur: versehentlich mitgenommen',
        status: 'verfuegbar',
        updated_at: now,
      })
      .eq('id', checkout.id)

    if (checkoutError) {
      alert(`${t('equipmentUndoError')} ${checkoutError.message}`)
      return
    }

    const { error: itemError } = await supabase
      .from('inventory_items')
      .update({ status: 'verfuegbar', updated_at: now })
      .eq('id', checkout.inventory_item_id)

    if (itemError) {
      alert(`${t('equipmentUndoError')} ${itemError.message}`)
      return
    }

    incarcaInventory()
  }

  const saveEquipmentReturns = async () => {
    const ownOpenCheckouts = openCheckouts.filter(row => row.user_id === user?.id)
    const note = equipmentReturnNote.trim()
    if (ownOpenCheckouts.length === 0 || (!equipmentReturnAllOk && !note)) return

    const nextStatus = equipmentReturnAllOk ? 'verfuegbar' : 'pruefen'

    for (const checkout of ownOpenCheckouts) {
      await supabase
        .from('inventory_checkouts')
        .update({
          returned_at: new Date().toISOString(),
          return_clean: equipmentReturnAllOk,
          return_functional: equipmentReturnAllOk,
          return_note: note || null,
          status: nextStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', checkout.id)

      await supabase
        .from('inventory_items')
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq('id', checkout.inventory_item_id)
    }

    setEquipmentReturnAllOk(false)
    setEquipmentReturnNote('')
    incarcaInventory()
  }

  const handleLanguageChange = async (nextLanguage) => {
    setLanguage(nextLanguage)
    if (user) {
      const { error } = await supabase.auth.updateUser({
        data: { preferred_language: nextLanguage },
      })
      if (error) {
        console.error('Language update error:', error)
      }
    }
  }

  const handleCreateReport = async (e) => {
    e?.preventDefault()
    if (!user) return alert(t('loginRequired'))
    if (!reportChecklist.workDone || !reportChecklist.workTime) {
      alert(t('completionRequired'))
      return
    }
    try {
      const hasCustomerSignature = Boolean(reportSignatureDataUrl)
      if (hasCustomerSignature && !editingReportId && !window.confirm(t('saveAndLockConfirm'))) {
        return
      }
      if (hasCustomerSignature && editingReportId && !customerSignedAt && !window.confirm(t('saveAndLockConfirm'))) {
        return
      }
      let damageImageUrl = existingDamageImageUrl
      let damageImagePath = null

      if (reportDamage && reportDamageImage) {
        const compressedImage = await compressImageFile(reportDamageImage)
        damageImagePath = `${user.id}/${Date.now()}-${compressedImage.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
        const { error: uploadError } = await supabase.storage
          .from('report-images')
          .upload(damageImagePath, compressedImage, {
            contentType: compressedImage.type || 'image/webp',
            upsert: false,
          })

        if (uploadError) {
          alert(`${t('imageUploadError')} ${uploadError.message}`)
          return
        }

        const { data: publicData } = supabase.storage.from('report-images').getPublicUrl(damageImagePath)
        damageImageUrl = publicData?.publicUrl ?? null
      }

      const startIso = new Date(reportStart).toISOString()
      const endIsoFromForm = reportEnd ? new Date(reportEnd).toISOString() : null
      const selectedObj = objects.find(o => o.id === selectedObjectId)
      const objectName = selectedObj ? selectedObj.name : reportObject
      const fahrzeitMinutes = Math.max(0, Math.round(Number(reportFahrzeitMinutes || 0)))
      const pauseMinutes = Math.max(0, Math.round(Number(reportPauseMinutes || 0)))
      const selectedWorkers = workers.filter(worker => selectedWorkerIds.includes(worker.id))
      const reportTaskText = [...selectedWorkTemplates, reportTask.trim()].filter(Boolean).join('\n')
      const taskTranslation = await translateToGerman(reportTaskText)
      const damageTranslation = reportDamage ? await translateToGerman(reportDamageDescription) : null
      const customerFeedbackTranslation = !customerSatisfied ? await translateToGerman(customerFeedback) : null
      const reportPayload = {
        user_id: user.id,
        start_time: startIso,
        worker_email: user.email ?? 'Benutzer',
        object_name: objectName,
        auftragsnummer: reportAuftragsnummer,
        worker_ids: selectedWorkerIds,
        worker_names: selectedWorkers.map(worker => worker.name),
        end_time: endIsoFromForm,
        task: reportTaskText,
        task_de: taskTranslation?.translated_text ?? null,
        damage_present: reportDamage,
        damage_description: reportDamage ? reportDamageDescription : null,
        damage_description_de: damageTranslation?.translated_text ?? null,
        customer_satisfied: customerSatisfied,
        customer_feedback: !customerSatisfied ? customerFeedback : null,
        customer_feedback_de: customerFeedbackTranslation?.translated_text ?? null,
        source_language: taskTranslation?.source_language ?? damageTranslation?.source_language ?? customerFeedbackTranslation?.source_language ?? null,
        translated_at: (taskTranslation?.translated_text || damageTranslation?.translated_text || customerFeedbackTranslation?.translated_text) ? new Date().toISOString() : null,
        damage_image_url: damageImageUrl,
        damage_image_path: damageImagePath,
        pause_minutes: pauseMinutes,
        fahrzeit_minutes: fahrzeitMinutes,
        client_signature_data_url: getSignatureDataUrl(),
        customer_signature_data: getSignatureDataUrl(),
        customer_signed_at: hasCustomerSignature ? (customerSignedAt ?? new Date().toISOString()) : null,
        locked_by_signature: hasCustomerSignature,
        locked_at: hasCustomerSignature ? new Date().toISOString() : null,
        locked_reason: hasCustomerSignature ? 'Kundenunterschrift' : null,
        locked_by: hasCustomerSignature ? user.id : null,
        status: canEditLockedReports ? 'Erfolgreich erfasst' : 'In Prüfung',
        entry_type: reportEntryType,
        correction_reason: reportEntryType === 'manual' ? (reportCorrectionReason || null) : null,
        checklist_work_time: reportChecklist.workTime,
        checklist_work_done: reportChecklist.workDone,
        checklist_equipment_back: reportChecklist.equipmentBack,
        checklist_materials_back: reportChecklist.materialsBack,
        updated_at: new Date().toISOString(),
      }

      if (selectedObjectId) {
        reportPayload.object_id = selectedObjectId
      }
      if (editingReportId) {
        delete reportPayload.user_id
      }
      if (currentId) {
        reportPayload.pontaj_id = currentId
      }

      let reportRequest = editingReportId
        ? supabase
            .from('tagesbericht')
            .update(reportPayload)
            .eq('id', editingReportId)
            .select()
            .single()
        : supabase.from('tagesbericht').insert([reportPayload]).select().single()
      if (editingReportId && !canEditLockedReports) {
        reportRequest = reportRequest.eq('user_id', user.id)
      }
      if (editingReportId && !canEditLockedReports) {
        reportRequest = supabase
          .from('tagesbericht')
          .update(reportPayload)
          .eq('id', editingReportId)
          .eq('user_id', user.id)
          .eq('locked_by_signature', false)
          .neq('status', 'Versendet')
          .select()
          .single()
      }

      const { data, error } = await reportRequest
      if (error) {
        console.error(error)
        alert(`${t('reportSaveError')} ${error.message}`)
      } else {
        await saveEquipmentReturns()
        if (!editingReportId && inLucru && currentId && data?.id) {
          const { error: updateError } = await supabase
            .from('pontaj')
            .update({ report_id: data.id })
            .eq('id', currentId)
            .eq('user_id', user.id)

          if (updateError) {
            console.error(updateError)
            alert(`${t('reportTimeLinkWarning')} ${updateError.message}`)
          } else {
            setActiveReportId(data.id)
            setActiveSession(session => session ? { ...session, report_id: data.id } : session)
          }
        }
        if (!inLucru && data?.id && endIsoFromForm) {
          const totalSeconds = secondsBetween(startIso, endIsoFromForm)
          const totals = {
            total_seconds: totalSeconds,
            pause_seconds: minutesToSeconds(pauseMinutes),
            auto_pause_seconds: 0,
            fahrzeit_seconds: minutesToSeconds(fahrzeitMinutes),
            effective_seconds: Math.max(0, totalSeconds - minutesToSeconds(pauseMinutes)),
          }
          const { error: updateReportError } = await supabase
            .from('tagesbericht')
            .update({
              ...buildMinuteTotals(totals),
            })
            .eq('id', data.id)
            .eq('user_id', user.id)

          const finishedReport = {
            ...data,
            end_time: endIsoFromForm,
            ...buildMinuteTotals(totals),
          }

          if (updateReportError) {
            alert(`${t('reportTimeUpdateWarning')} ${updateReportError.message}`)
          } else {
            await saveWorkerTimeEntries(data.id, finishedReport, totals, endIsoFromForm)
          }
        }
        resetReportForm()
        incarcaReports()
        incarcaDashboardSummary()
        setView('reports')
        alert(t('savedReportSuccess'))
      }
    } catch (err) {
      console.error(err)
        alert(t('unexpectedError'))
    }
  }


  // Verifică în DB dacă există o sesiune activă (status = 'activ') și restabilește starea
  // Funcție care calculează diferența de timp
  const saveWorkerTimeEntries = async (reportId, reportData, totals, endIso) => {
    if (!user || !reportId) return
    const minuteTotals = buildMinuteTotals(totals)
    const reportWorkerIds = Array.isArray(reportData?.worker_ids) ? reportData.worker_ids : []
    const reportWorkerNames = Array.isArray(reportData?.worker_names) ? reportData.worker_names : []
    const fallbackName = user.email ?? 'Benutzer'
    const selectedWorkers = reportWorkerIds.length > 0
      ? reportWorkerIds.map((workerId, index) => ({
        worker_id: workerId,
        worker_name: reportWorkerNames[index] ?? fallbackName,
      }))
      : [{ worker_id: null, worker_name: reportWorkerNames[0] ?? fallbackName }]

    const rows = selectedWorkers.map(worker => ({
      user_id: user.id,
      report_id: reportId,
      worker_id: worker.worker_id,
      worker_name: worker.worker_name,
      work_date: getBerlinDateISO(reportData?.start_time ?? endIso),
      object_id: reportData?.object_id ?? null,
      object_name: reportData?.object_name ?? null,
      auftragsnummer: reportData?.auftragsnummer ?? null,
      ...minuteTotals,
    }))

    const { error } = await supabase
      .from('worker_time_entries')
      .upsert(rows, { onConflict: 'report_id,worker_name' })

    if (error) {
      console.error('Worker time entries save error:', error)
      alert(`${t('workerTimeSaveError')} ${error.message}`)
    }
  }

  const buildReportHtml = (reportData, _totals, endIso) => {
    const reportDate = getBerlinDateISO(reportData?.start_time ?? endIso)
    return `
      <p>Guten Tag,</p>
      <p>anbei erhalten Sie den Tagesbericht vom ${reportDate} als PDF.</p>
      <p>Mit freundlichen Gruessen<br>Voqenti</p>
    `
  }

  const queueReportEmail = async (reportId, reportData, totals, endIso, sessionStartIso) => {
    if (!user || !reportId) return
    if (!canEditLockedReports) return alert(t('reviewRequired'))
    if (reportData?.email_sent || reportData?.status === 'Versendet') {
      alert(t('sentAlready'))
      return
    }
    const reportDate = getBerlinDateISO(reportData?.start_time ?? endIso)
    const subject = `Tagesbericht ${reportDate} - ${reportData?.object_name ?? 'Objekt'}`
    const payload = {
      report_id: reportId,
      work_date: reportDate,
      start_time: sessionStartIso ?? reportData?.start_time ?? null,
      end_time: endIso,
      creator_email: user.email ?? null,
      creator_name: reportData?.worker_names?.[0] ?? user.email ?? 'Benutzer',
      object_name: reportData?.object_name ?? null,
      auftragsnummer: reportData?.auftragsnummer ?? null,
      worker_names: reportData?.worker_names ?? [],
      task: reportData?.task ?? null,
      damage_present: reportData?.damage_present ?? false,
      damage_description: reportData?.damage_description ?? null,
      damage_description_de: reportData?.damage_description_de ?? null,
      damage_image_url: reportData?.damage_image_url ?? null,
      customer_satisfied: reportData?.customer_satisfied ?? true,
      customer_feedback: reportData?.customer_feedback ?? null,
      customer_feedback_de: reportData?.customer_feedback_de ?? null,
      task_de: reportData?.task_de ?? null,
      client_signature_data_url: reportData?.client_signature_data_url ?? null,
      customer_signed_at: reportData?.customer_signed_at ?? null,
      status: reportData?.status ?? null,
      entry_type: reportData?.entry_type ?? reportData?.time_entry_type ?? 'automatic',
      correction_reason: reportData?.correction_reason ?? null,
      checklist: {
        work_time: Boolean(reportData?.checklist_work_time),
        work_done: Boolean(reportData?.checklist_work_done),
        equipment_back: Boolean(reportData?.checklist_equipment_back),
        materials_back: Boolean(reportData?.checklist_materials_back),
      },
      totals: buildMinuteTotals(totals),
      pdf_note: 'PDF wird aus dem aktuellen Voqenti-Layout erzeugt.',
    }

    const { data, error } = await supabase
      .from('email_outbox')
      .insert([{
        user_id: user.id,
        report_id: reportId,
        recipient: 'mtclemur@gmail.com',
        subject,
        html_body: buildReportHtml(reportData, totals, endIso),
        payload,
      }])
      .select('id')
      .single()

    if (error) {
      console.error('Email outbox error:', error)
      alert(`${t('emailJobCreateWarning')} ${error.message}`)
      return
    }

    const { error: sendError } = await supabase.functions.invoke('send-tagesbericht-email', {
      body: { outbox_id: data.id },
    })

    if (sendError) {
      console.error('Email send function error:', sendError)
      alert(`${t('emailJobSendWarning')} ${sendError.message}`)
    } else {
      await supabase
        .from('tagesbericht')
        .update({ status: 'Versendet', email_sent: true, email_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', reportId)
        .eq('user_id', user.id)
    }
    incarcaDashboardSummary()
  }

  const handleSendReport = async (report) => {
    if (!user || !report?.id) return
    if (!canEditLockedReports) {
      alert(t('reviewRequired'))
      return
    }
    if (report.email_sent || report.status === 'Versendet') {
      alert(t('sentAlready'))
      return
    }
    const { data: fullReport, error: reportLoadError } = await supabase
      .from('tagesbericht')
      .select('*')
      .eq('id', report.id)
      .single()

    if (reportLoadError || !fullReport) {
        alert(`${t('reportLoadError')} ${(reportLoadError?.message ?? '')}`)
      return
    }

    const startIso = fullReport.start_time ?? new Date().toISOString()
    const endIso = fullReport.end_time ?? new Date().toISOString()
    const totals = {
      total_seconds: minutesToSeconds(fullReport.total_minutes),
      pause_seconds: minutesToSeconds(fullReport.pause_minutes),
      auto_pause_seconds: minutesToSeconds(fullReport.auto_pause_minutes),
      fahrzeit_seconds: minutesToSeconds(fullReport.fahrzeit_minutes),
      effective_seconds: minutesToSeconds(fullReport.effective_minutes),
    }

    await supabase
      .from('tagesbericht')
      .update({ status: 'Erfolgreich erfasst', updated_at: new Date().toISOString() })
      .eq('id', report.id)
      .neq('status', 'Versendet')

    await queueReportEmail(report.id, { ...fullReport, status: 'Erfolgreich erfasst' }, totals, endIso, startIso)
    incarcaReports()
  }

  const openCurrentReport = async () => {
    const reportId = activeSession?.report_id ?? activeReportId
    if (!reportId) {
      setView('reports')
      return
    }
    const knownReport = dashboardReports.find(report => report.id === reportId) ?? reports.find(report => report.id === reportId) ?? { id: reportId }
    await handleEditReport(knownReport)
  }

  const calculeazaDurata = (start, end) => {
    if (!start) return ''
    const s = new Date(start)
    const e = end ? new Date(end) : new Date()
    const diff = Math.abs(e - s)
    const ore = Math.floor(diff / (1000 * 60 * 60))
    const minute = Math.floor((diff / (1000 * 60)) % 60)
    return `${ore}h ${minute}m`
  }

  // Keep UI updating while a session is active so durations refresh
  useEffect(() => {
    if (!inLucru) return
    const id = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(id)
  }, [inLucru])

  // Helpers pentru afișare în fusul orar Germania (Europe/Berlin)
  const handleStart = async () => {
    const { data: sessionData } = await supabase.auth.getSession()
    const sessionUser = sessionData?.session?.user

    if (!sessionUser) {
      alert(t('loginRequired'))
      return
    }
    if (activeSession) {
      alert(t('activeSessionExists'))
      return
    }
    const selectedObject = objects.find(object => object.id === dashboardObjectId)
    if (!selectedObject) {
      alert(t('selectObjectBeforeStart'))
      return
    }
    if (!window.confirm(t('confirmStart'))) return
    const acumISO = new Date().toISOString()
    const { data: reportData, error: reportError } = await supabase
      .from('tagesbericht')
      .insert([{
        user_id: sessionUser.id,
        start_time: acumISO,
        worker_email: sessionUser.email ?? 'Benutzer',
        object_id: selectedObject.id,
        object_name: selectedObject.name,
        auftragsnummer: dashboardAuftrag.trim() || null,
        status: 'In Bearbeitung',
        entry_type: 'automatic',
        pause_minutes: 0,
        fahrzeit_minutes: 0,
        total_minutes: 0,
        effective_minutes: 0,
      }])
      .select()
      .single()

    if (reportError || !reportData) {
      alert(`${t('reportSaveError')} ${reportError?.message ?? ''}`)
      return
    }

    const { data, error } = await supabase
      .rpc('start_work_session', {
        p_name_nutzer: sessionUser.email ?? 'Benutzer',
        p_start_time: acumISO,
        p_report_id: reportData.id,
      })

    if (error) {
      await supabase.from('tagesbericht').delete().eq('id', reportData.id).eq('user_id', sessionUser.id)
      alert(`${t('errorPrefix')} ${error.message}`)
    } else {
      const startedSession = Array.isArray(data) ? data[0] : data
      setCurrentId(startedSession.id)
      setActiveSession(startedSession)
      setInLucru(true)
      setActiveReportId(reportData.id)
      setNowTick(new Date().getTime())
      setOraStart(new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' }))
      incarcaIstoric()
      incarcaDashboardSummary()
    }
  }

  const handleStop = async () => {
    if (!user || !activeSession) return
    const acumISO = new Date().toISOString()
    const reportId = activeSession.report_id ?? activeReportId
    const stopMessage = reportId ? t('confirmStop') : t('confirmStopWithoutReport')
    if (!window.confirm(stopMessage)) return
    const baseTotals = calculateSessionTotals(activeSession, acumISO)
    let reportFahrzeitSeconds = 0
    let linkedReport = null

    if (reportId) {
      const { data: reportData, error: reportReadError } = await supabase
        .from('tagesbericht')
        .select('start_time, end_time, fahrzeit_minutes, worker_ids, worker_names, object_id, object_name, auftragsnummer, task, task_de, damage_present, damage_description, damage_description_de, damage_image_url, customer_satisfied, customer_feedback, customer_feedback_de, client_signature_data_url, status, email_sent, email_sent_at, entry_type, correction_reason')
        .eq('id', reportId)
        .eq('user_id', user.id)
        .single()

      if (!reportReadError) {
        linkedReport = reportData
        reportFahrzeitSeconds = getStoredSeconds(reportData, 'fahrzeit_minutes', 'fahrzeit_seconds')
      }
    }

    const dailyTotals = {
      ...baseTotals,
      fahrzeit_seconds: reportFahrzeitSeconds,
      effective_seconds: Math.max(0, baseTotals.total_seconds - baseTotals.pause_seconds),
    }
    const reportTotals = calculateReportTotals(activeSession, acumISO, reportFahrzeitSeconds)

    const { error } = await supabase
      .from('pontaj')
        .update({
          Uhrzeit_Ende: acumISO,
          status: 'finalizat',
          current_mode: 'work',
          mode_changed_at: acumISO,
          entry_type: 'automatic',
          correction_reason: null,
          updated_at: new Date().toISOString(),
          ...buildMinuteTotals(dailyTotals),
        })
      .eq('id', currentId)
      .eq('user_id', user.id)

    if (error) {
      alert(`${t('errorPrefix')} ${error.message}`)
    } else {
      if (reportId) {
        const { error: reportError } = await supabase
          .from('tagesbericht')
          .update({
            end_time: acumISO,
            worker_email: user.email ?? 'Benutzer',
            pontaj_id: currentId,
            entry_type: 'automatic',
            correction_reason: null,
            updated_at: new Date().toISOString(),
            ...buildMinuteTotals(reportTotals),
          })
          .eq('id', reportId)
          .eq('user_id', user.id)

        if (reportError) {
          alert(`${t('reportStopUpdateWarning')} ${reportError.message}`)
        } else if (linkedReport) {
          await saveWorkerTimeEntries(reportId, linkedReport, reportTotals, acumISO)
        }
      }
      setInLucru(false)
      setOraStart(null)
      setCurrentId(null)
      setActiveSession(null)
      setActiveReportId(null)
      incarcaIstoric()
      incarcaReports()
      incarcaWorkerEntries()
      incarcaDashboardSummary()
    }
  }

  // Auth helpers
  const handleSignUp = async () => {
    if (!authEmail || !authPassword) {
      alert(t('authMissing'))
      return
    }
    if (authPassword.length < 6) {
      alert(t('authPasswordShort'))
      return
    }
    try {
      const { error } = await supabase.auth.signUp({
        email: authEmail,
        password: authPassword,
        options: {
          data: { preferred_language: language },
        },
      })
      if (error) {
        console.error('Sign up error:', error)
        alert(`${t('signUpError')} ${error.message}`)
      } else {
        alert(t('authSignUpSuccess'))
        setAuthEmail('')
        setAuthPassword('')
      }
    } catch (err) {
      console.error('Unexpected error:', err)
      alert(`${t('unexpectedError')} ${err?.message || t('connectionCheck')}`)
    }
  }

  const handleSignIn = async () => {
    if (!authEmail || !authPassword) {
      alert(t('authMissing'))
      return
    }
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword })
      if (error) {
        console.error('Sign in error:', error)
        alert(`${t('signInError')} ${error.message}`)
      } else {
        setAuthPassword('')
        setAuthEmail('')
      }
    } catch (err) {
      console.error('Unexpected error:', err)
      alert(`${t('unexpectedError')} ${err?.message || t('connectionCheck')}`)
    }
  }

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut()
      setUser(null)
    } catch (err) {
      console.error('Sign out error:', err)
    }
  }

  const activeTotals = activeSession
    ? calculateSessionTotals(activeSession, new Date(nowTick || new Date(activeSession.Uhrzeit_Start).getTime()).toISOString())
    : { total_seconds: 0, pause_seconds: 0, fahrzeit_seconds: 0, effective_seconds: 0 }
  const workerEntriesTotalMinutes = workerEntries.reduce((sum, entry) => sum + Number(entry.effective_minutes ?? 0), 0)
  const inactiveDashboardRows = dashboardPontaj.filter(row => row.id !== activeSession?.id)
  const todayEffectiveSeconds = inactiveDashboardRows.reduce((sum, row) => sum + minutesToSeconds(row.effective_minutes), 0) + (activeSession ? activeTotals.effective_seconds : 0)
  const todayPauseSeconds = inactiveDashboardRows.reduce((sum, row) => sum + minutesToSeconds(row.pause_minutes), 0) + (activeSession ? activeTotals.pause_seconds : 0)
  const reportFormDurationSeconds = reportStart && reportEnd
    ? Math.max(0, secondsBetween(new Date(reportStart).toISOString(), new Date(reportEnd).toISOString()) - minutesToSeconds(reportPauseMinutes))
    : 0
  const activeReport = dashboardReports.find(report => report.id === (activeSession?.report_id ?? activeReportId))
  const latestReport = activeReport ?? dashboardReports[0] ?? null
  const currentOrderText = activeReport
    ? (activeReport.object_name || activeReport.auftragsnummer || t('noActiveOrder'))
    : t('noActiveOrder')
  const selectedDashboardObject = objects.find(object => object.id === dashboardObjectId)
  const latestEmail = latestReport ? dashboardEmails.find(email => email.report_id === latestReport.id) : null
  const reportStatusText = !latestReport
    ? t('reportOpen')
    : latestReport.email_sent || latestReport.status === 'Versendet' || latestEmail?.status === 'sent'
      ? t('sent')
      : reportStatusLabel(latestReport.status ?? (activeReport ? 'Entwurf' : 'Gespeichert'))
  const todayPhotoCount = dashboardReports.filter(report => report.damage_image_url).length
  const reviewReports = dashboardReports.filter(report => !report.email_sent && isReviewStatus(report.status))
  const dashboardCards = [
    { label: t('workTimeToday'), value: formatDurationSeconds(todayEffectiveSeconds), tone: 'text-white' },
    { label: t('pause'), value: formatDurationSeconds(todayPauseSeconds), tone: 'text-amber-300' },
    { label: t('currentOrder'), value: currentOrderText, tone: 'text-cyan-100' },
    { label: t('reportStatus'), value: reportStatusText, tone: latestReport ? 'text-emerald-300' : 'text-amber-300' },
    { label: t('photosToday'), value: todayPhotoCount > 0 ? `${todayPhotoCount} Fotos` : t('noPhotos'), tone: todayPhotoCount > 0 ? 'text-cyan-100' : 'text-slate-300' },
  ]

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-6"
      style={{
        background: 'radial-gradient(circle at 15% 20%, rgba(56,189,248,0.28), transparent 24%), radial-gradient(circle at 80% 10%, rgba(236,72,153,0.22), transparent 18%), linear-gradient(135deg, #020617 0%, #0f172a 40%, #1d4ed8 100%)'
      }}
    >
      <div className="relative w-full max-w-5xl">
        <img
          src="/heico-logo.jpg"
          alt="HEICO Service GmbH"
          className="pointer-events-none absolute -right-10 top-4 hidden w-72 opacity-[0.07] mix-blend-screen sm:block lg:w-96"
        />
        <div className="absolute inset-0 rounded-[2.5rem] bg-white/5 shadow-[inset_0_0_120px_rgba(255,255,255,0.06)] pointer-events-none" />
        <div className="relative grid gap-8 lg:grid-cols-[1.2fr_0.95fr]">
          <div className="bg-white/10 border border-white/10 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)] rounded-[2rem] p-8 backdrop-blur-xl text-left overflow-hidden">
            <div className="mb-8">
              <p className="inline-flex rounded-full bg-cyan-500/20 text-cyan-200 text-[11px] uppercase tracking-[0.3em] font-semibold px-4 py-2 mb-4">
                {t('appTag')}</p>
              <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight">Voqenti</h1>
              <p className="mt-3 text-sm sm:text-base text-slate-300 max-w-xl">
                {t('subtitle')}
              </p>
              <div className="mt-4">
                {user ? (
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm text-slate-200 mb-4">
                    <div>{t('signedIn')}: <span className="font-semibold text-white">{user.email}</span></div>
                    <div className="flex gap-2">
                      <select value={language} onChange={e => handleLanguageChange(e.target.value)} className="px-3 py-2 bg-slate-800 rounded-md text-slate-100 text-sm">
                        {i18nLanguages.map(item => <option key={item.code} value={item.code}>{item.label}</option>)}
                      </select>
                      {canEditLockedReports && notificationPermission !== 'granted' && (
                        <button onClick={handleEnableNotifications} className="px-4 py-2 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-300/20 rounded-md text-amber-100 text-sm w-full sm:w-auto">
                          {t('enableNotifications')}
                        </button>
                      )}
                      <button onClick={handleSignOut} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-md text-slate-100 text-sm w-full sm:w-auto">{t('signOut')}</button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        value={authEmail}
                        onChange={e => setAuthEmail(e.target.value)}
                        placeholder={t('email')}
                        type="email"
                        className="px-3 py-2 rounded-md bg-slate-800 text-slate-100 text-sm flex-1"
                      />
                      <input
                        type="password"
                        value={authPassword}
                        onChange={e => setAuthPassword(e.target.value)}
                        placeholder={t('password')}
                        className="px-3 py-2 rounded-md bg-slate-800 text-slate-100 text-sm flex-1"
                      />
                      <select value={language} onChange={e => handleLanguageChange(e.target.value)} className="px-3 py-2 rounded-md bg-slate-800 text-slate-100 text-sm">
                        {i18nLanguages.map(item => <option key={item.code} value={item.code}>{item.label}</option>)}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={handleSignIn} className="flex-1 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-md text-white text-sm font-medium">{t('signIn')}</button>
                      <button onClick={handleSignUp} className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-md text-white text-sm font-medium">{t('signUp')}</button>
                    </div>
                  </div>
                )}
              </div>
            </div>

	            {user && (
	              <div className="mb-6 flex flex-wrap gap-2">
	                <button onClick={() => setView('pontaj')} className={`px-3 py-2 rounded-md text-sm ${view==='pontaj' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-200'}`}>{t('timeTracking')}</button>
	                <button onClick={() => { setView('reports'); incarcaReports(); }} className={`relative px-3 py-2 rounded-md text-sm ${view==='reports' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-200'}`}>
                    {t('report')}
                    {canEditLockedReports && reviewReports.length > 0 && (
                      <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-black text-slate-950">
                        {reviewReports.length}
                      </span>
                    )}
                  </button>
	                <button onClick={() => { setView('times'); incarcaWorkerEntries(); }} className={`px-3 py-2 rounded-md text-sm ${view==='times' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-200'}`}>{t('workTimes')}</button>
	                <button onClick={() => { setView('materials'); incarcaMaterialbedarf(); incarcaInventory(); }} className={`px-3 py-2 rounded-md text-sm ${view==='materials' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-200'}`}>{t('materials')}</button>
	              </div>
	            )}

            {view === 'pontaj' ? (
              <>
                {canEditLockedReports && reviewReports.length > 0 && (
                  <button
                    type="button"
                    onClick={() => { setView('reports'); incarcaReports(); }}
                    className="mb-4 w-full rounded-2xl border border-amber-300/35 bg-amber-400/12 px-4 py-3 text-left shadow-lg shadow-amber-950/20"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-amber-200">{t('urgentReview')}</p>
                        <p className="mt-1 text-sm font-semibold text-white">
                          {reviewReports.length} {t('reportsNeedReview')}
                        </p>
                      </div>
                      <span className="rounded-full bg-amber-300 px-3 py-1 text-xs font-black text-slate-950">
                        {t('checkNow')}
                      </span>
                    </div>
                  </button>
                )}
                <div className="mb-4 rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.25em] text-slate-500">{t('currentOrder')}</p>
                      {inLucru && activeReport ? (
                        <p className="mt-1 text-sm font-bold text-cyan-100">{activeReport.object_name}</p>
                      ) : (
                        <p className="mt-1 text-xs text-slate-400">{t('selectBeforeStart')}</p>
                      )}
                    </div>
                    {inLucru && (
                      <button
                        type="button"
                        onClick={openCurrentReport}
                        className="rounded-md bg-cyan-500/15 px-3 py-2 text-xs font-bold text-cyan-100 ring-1 ring-cyan-300/20"
                      >
                        {t('toCurrentReport')}
                      </button>
                    )}
                  </div>
                  {!inLucru ? (
                    <div className="grid gap-2 sm:grid-cols-[1.4fr_1fr]">
                      <select
                        value={dashboardObjectId}
                        onChange={e => setDashboardObjectId(e.target.value)}
                        className="w-full rounded-md bg-slate-950 px-3 py-2 text-sm text-slate-100 ring-1 ring-slate-700"
                      >
                        <option value="">{t('objectOrderSelect')}</option>
                        {objects.map(object => (
                          <option key={object.id} value={object.id}>
                            {object.name}{object.address ? ` - ${object.address}` : ''}
                          </option>
                        ))}
                      </select>
                      <input
                        value={dashboardAuftrag}
                        onChange={e => setDashboardAuftrag(e.target.value)}
                        placeholder={t('orderNumber')}
                        className="w-full rounded-md bg-slate-950 px-3 py-2 text-sm text-slate-100 ring-1 ring-slate-700"
                      />
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400">
                      {activeReport?.auftragsnummer && <span>{t('order')}: {activeReport.auftragsnummer} · </span>}
                      {t('start')}: {oraStart || '-'}
                    </div>
                  )}
                  {!inLucru && selectedDashboardObject?.address && (
                    <div className="mt-2 text-xs text-slate-400">{selectedDashboardObject.address}</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={inLucru ? handleStop : handleStart}
                  className={`mb-8 w-full rounded-[1.75rem] p-6 text-left shadow-xl backdrop-blur transition-transform active:scale-[0.99] ${
                    inLucru
                      ? 'bg-emerald-500/15 hover:bg-emerald-500/20 ring-1 ring-emerald-300/30 shadow-emerald-950/20'
                      : 'bg-rose-500/10 hover:bg-rose-500/15 ring-1 ring-rose-300/20 shadow-rose-950/20'
                  }`}
                >
                  <span className="text-[11px] uppercase tracking-[0.3em] font-semibold text-slate-300 block mb-5">{t('currentStatus')}</span>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-3">
                        <span className={`h-3.5 w-3.5 rounded-full ${inLucru ? 'bg-emerald-300 animate-pulse' : 'bg-rose-300'}`} />
                        <span className={`text-2xl sm:text-3xl font-extrabold ${inLucru ? 'text-emerald-100' : 'text-rose-100'}`}>
                          {inLucru ? t('stopWork') : t('startWork')}
                        </span>
                      </div>
                      <p className={`mt-3 text-xs font-semibold uppercase tracking-[0.2em] ${inLucru ? 'text-emerald-200/80' : 'text-rose-200/75'}`}>
                        {inLucru ? t('runningStatus') : t('notRunningStatus')}
                      </p>
                      {inLucru && (
                        <p className="mt-2 text-sm font-semibold text-emerald-100/90">
                          {formatDurationSeconds(activeTotals.total_seconds)}
                        </p>
                      )}
                    </div>
                    {oraStart && (
                      <div className="text-right text-xs font-medium text-slate-200/80">
                        <span className="block uppercase tracking-[0.18em] text-slate-400">{t('start')}</span>
                        <span className="text-sm font-bold text-slate-100">{oraStart}</span>
                      </div>
                    )}
                  </div>
                </button>

                <div>
                  <button
                    type="button"
                    onClick={() => { setEquipmentPanelOpen(current => !current); incarcaInventory(); incarcaObjects(); }}
                    className="w-full rounded-2xl border border-cyan-500/30 bg-slate-900/80 px-4 py-3 text-sm font-semibold text-cyan-100 hover:bg-slate-800"
                  >
                    {t('takeEquipment')}
                  </button>
                  {equipmentPanelOpen && (
                    <div className="mt-3 rounded-2xl border border-slate-700 bg-slate-900/95 p-3">
                      <div className="mb-2 text-sm font-semibold text-white">{t('availableEquipment')}</div>
                      <div className="space-y-2 max-h-72 overflow-auto pr-1">
                        {inventoryItems.filter(item => item.status === 'verfuegbar').length === 0 ? (
                          <div className="rounded-md bg-slate-800 px-3 py-2 text-sm text-slate-400">{t('noEquipment')}</div>
                        ) : inventoryItems.filter(item => item.status === 'verfuegbar').map(item => (
                          <div key={item.id} className="flex items-center justify-between gap-3 rounded-md bg-slate-800 px-3 py-2">
                            <div>
                              <div className="text-sm font-semibold text-white">{item.name}</div>
                              <div className="text-xs text-slate-400">{item.category}</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleTakeEquipment(item)}
                              className="rounded-md bg-cyan-600 px-3 py-2 text-xs font-semibold text-white"
                            >
                              {t('take')}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {dashboardCards.map(card => (
                    <div key={card.label} className={`rounded-xl bg-slate-900/80 p-3 min-h-[82px] ${card.wide ? 'col-span-2 sm:col-span-3' : ''}`}>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{card.label}</p>
                      <p className={`mt-2 text-sm font-bold leading-snug break-words ${card.tone}`}>{card.value}</p>
                    </div>
                  ))}
                </div>
              </>
	            ) : view === 'reports' ? (
	              <div className="rounded-[1.75rem] p-6 bg-slate-900/85 ring-1 ring-slate-700">
	                <h3 className="text-white font-semibold mb-3">{editingReportId ? t('updateReport') : t('addReport')}</h3>
	                <form onSubmit={handleCreateReport} className="space-y-3">
	                  <div className="mt-2 rounded-md bg-slate-800/60 p-3">
	                    <label className="text-slate-100 text-sm font-semibold">🏢 {t('object')}</label>
	                    <input
	                      list="objects-list"
	                      value={reportObject}
	                      onChange={e=>handleReportObjectChange(e.target.value)}
	                      placeholder={t('objectSelect')}
	                      className="w-full mt-2 px-3 py-2 rounded-md bg-slate-900 text-slate-100"
	                    />
	                    <datalist id="objects-list">
	                      {objects.map(o => (
	                        <option key={o.id} value={o.name}>{o.address ?? ''}</option>
	                      ))}
	                    </datalist>
	                    {objectsError && (
	                      <p className="mt-2 text-xs text-rose-300">
	                        {t('objectsLoadError')}: {objectsError}
                      </p>
                    )}
                    {!objectsError && objects.length === 0 && (
                      <p className="mt-2 text-xs text-slate-400">
                        {t('noObjects')}
                      </p>
	                    )}
                      {selectedReportObject?.address && (
                        <div className="mt-2 text-xs text-slate-400">{selectedReportObject.address}</div>
                      )}
		                  </div>
	                  <div>
	                    <label className="text-slate-300 text-sm">{t('workers')}</label>
                      <button
                        type="button"
                        onClick={() => setWorkerPickerOpen(true)}
                        className="mt-1 w-full rounded-md bg-slate-800 px-3 py-3 text-left text-sm font-semibold text-slate-100"
                      >
                        {t('selectWorkers')} ({selectedWorkerIds.length} {t('selectedCount')})
                      </button>
                      {workerSummary && <p className="mt-2 text-xs text-slate-300">{workerSummary}</p>}
                      {workers.length === 0 && <div className="mt-2 text-xs text-slate-400">{t('noWorkers')}</div>}
	                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-md bg-slate-800/60 p-3">
                    <label className="block text-xs text-slate-400">
                      {t('dateTime')}
                      <input
                        type="date"
                        value={reportStart ? reportStart.slice(0, 10) : ''}
                        onChange={e => {
                          const timePart = reportStart?.slice(11, 16) || '07:00'
                          setReportStart(`${e.target.value}T${timePart}`)
                          markReportTimeManual()
                        }}
                        className="mt-1 w-full px-3 py-2 rounded-md bg-slate-900 text-slate-100"
                      />
                    </label>
                    <label className="block text-xs text-slate-400">
                      {t('order')}
                      <input
                        placeholder={t('orderNumber')}
                        value={reportAuftragsnummer}
                        onChange={e=>setReportAuftragsnummer(e.target.value)}
                        className="mt-1 w-full px-3 py-2 rounded-md bg-slate-900 text-slate-100"
                      />
                    </label>
                  </div>
		                  <input
		                    type="number"
	                    min="0"
	                    step="1"
	                    placeholder={t('drivingTime')}
	                    value={reportFahrzeitMinutes}
	                    onChange={e=>setReportFahrzeitMinutes(e.target.value)}
		                    className="w-full px-3 py-2 rounded-md bg-slate-800 text-slate-100"
		                  />
                  <div className="rounded-md bg-slate-800 p-3 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-slate-100 font-semibold text-sm">{t('workTimeRange')}</div>
                      <div className="rounded-full bg-slate-900 px-3 py-1 text-xs font-bold text-cyan-100">
                        ⏱ {formatDurationSeconds(reportFormDurationSeconds)}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <label className="text-xs text-slate-400">
                        🟢 {t('workStart')}
                        <input
                          type="datetime-local"
                          value={reportStart}
                          onChange={e => { setReportStart(e.target.value); markReportTimeManual() }}
                          className="mt-1 w-full px-3 py-2 rounded-md bg-slate-900 text-slate-100"
                        />
                      </label>
                      <label className="text-xs text-slate-400">
                        🔴 {t('workEnd')}
                        <input
                          type="datetime-local"
                          value={reportEnd}
                          onChange={e => { setReportEnd(e.target.value); markReportTimeManual() }}
                          className="mt-1 w-full px-3 py-2 rounded-md bg-slate-900 text-slate-100"
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={reportPauseMinutes}
                        onChange={e => { setReportPauseMinutes(e.target.value); markReportTimeManual() }}
                        placeholder={t('pause')}
                        className="px-3 py-2 rounded-md bg-slate-900 text-slate-100"
                      />
                      <select value={reportEntryType} onChange={e => setReportEntryType(e.target.value)} className="px-3 py-2 rounded-md bg-slate-900 text-slate-100">
                        <option value="automatic">{t('automatic')}</option>
                        <option value="manual">{t('manual')}</option>
                      </select>
                      <input
                        list="correction-reasons"
                        value={reportCorrectionReason}
                        onChange={e => { setReportCorrectionReason(e.target.value); setReportEntryType('manual') }}
                        placeholder={t('correctionNote')}
                        className="px-3 py-2 rounded-md bg-slate-900 text-slate-100"
                      />
                      <datalist id="correction-reasons">
                        {correctionReasons.map(reason => <option key={reason} value={reason}>{reason}</option>)}
                      </datalist>
                    </div>
                    {reportEntryType === 'manual' && reportCorrectionReason && (
                      <div className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                        {t('manual')}: {reportCorrectionReason}
                      </div>
                    )}
                  </div>
                  <div className="rounded-md bg-slate-800 p-3">
                    <div className="text-slate-100 font-semibold text-sm mb-3">{t('workTemplates')}</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {workTemplateOptions.map(option => {
                        const checked = selectedWorkTemplates.includes(option)
                        return (
                          <button
                            type="button"
                            key={option}
                            onClick={() => handleWorkTemplateToggle(option)}
                            className={`rounded-md border px-3 py-2 text-left text-xs font-semibold ${
                              checked
                                ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-100'
                                : 'border-slate-700 bg-slate-900 text-slate-300'
                            }`}
                          >
                            {checked ? '[x]' : '[ ]'} {option}
                          </button>
                        )
                      })}
                    </div>
                    {workSummary && <p className="mt-2 text-xs text-slate-300">{workSummary}</p>}
                  </div>
                  <div className="rounded-md bg-slate-800 p-3">
                    <div className="text-slate-100 font-semibold text-sm mb-3">{t('additionalNotes')}</div>
                    <textarea
                      placeholder={t('additionalNotes')}
                      value={reportTask}
                      onChange={e=>setReportTask(e.target.value)}
                      className="w-full px-3 py-2 rounded-md bg-slate-900 text-slate-100"
                      rows={3}
                    />
                  </div>
                  {openCheckouts.filter(row => row.user_id === user?.id).length > 0 && (
                    <div className="rounded-md bg-slate-800 p-3">
                      <div className="text-slate-100 font-semibold text-sm mb-3">{t('equipmentReturn')}</div>
                      <div className="rounded-md bg-slate-900 p-3">
                        <div className="text-xs text-slate-400">
                          {openCheckouts
                            .filter(row => row.user_id === user?.id)
                            .map(checkout => checkout.inventory_items?.name ?? checkout.inventory_item_id)
                            .join(', ')}
                        </div>
                        <div className="mt-3 space-y-2">
                          {openCheckouts
                            .filter(row => row.user_id === user?.id)
                            .map(checkout => (
                              <button
                                key={checkout.id}
                                type="button"
                                onClick={() => handleUndoEquipmentCheckout(checkout)}
                                className="w-full rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-left text-xs font-semibold text-emerald-100 hover:bg-emerald-500/20"
                              >
                                {checkout.inventory_items?.name ?? checkout.inventory_item_id}: {t('equipmentUndo')}
                              </button>
                            ))}
                        </div>
                        <label className="mt-3 flex items-center gap-2 rounded-md bg-slate-800 px-3 py-2 text-sm text-slate-100">
                          <input
                            type="checkbox"
                            checked={equipmentReturnAllOk}
                            onChange={e => setEquipmentReturnAllOk(e.target.checked)}
                          />
                          <span>{t('equipmentReturnAllOk')}</span>
                        </label>
                        {!equipmentReturnAllOk && (
                          <textarea
                            value={equipmentReturnNote}
                            onChange={e => setEquipmentReturnNote(e.target.value)}
                            placeholder={t('damageNote')}
                            className="mt-2 w-full rounded-md bg-slate-800 px-3 py-2 text-slate-100"
                            rows={2}
                          />
                        )}
                      </div>
                    </div>
                  )}
	                  <div className="rounded-md bg-slate-800 p-3">
	                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
	                      <label className="text-slate-300 text-sm">{t('damageQuestion')}</label>
	                      <div className="grid grid-cols-2 rounded-md overflow-hidden border border-slate-700 w-full sm:w-auto">
	                        <button
	                          type="button"
	                          onClick={() => { setReportDamage(false); setReportDamageDescription(''); setReportDamageImage(null) }}
	                          className={`px-3 py-2 text-sm ${!reportDamage ? 'bg-cyan-600 text-white' : 'bg-slate-900 text-slate-300'}`}
	                        >
	                          {t('damageNo')}
	                        </button>
	                        <button
	                          type="button"
	                          onClick={() => setReportDamage(true)}
	                          className={`px-3 py-2 text-sm ${reportDamage ? 'bg-rose-600 text-white' : 'bg-slate-900 text-slate-300'}`}
	                        >
	                          {t('damageYes')}
	                        </button>
	                      </div>
	                    </div>
	                    {reportDamage && (
	                      <div className="mt-3 space-y-3">
	                        <textarea
	                          value={reportDamageDescription}
	                          onChange={e => setReportDamageDescription(e.target.value)}
	                          placeholder={t('description')}
	                          className="w-full px-3 py-2 rounded-md bg-slate-900 text-slate-100"
	                          rows={3}
	                        />
	                        <label className="block text-slate-300 text-sm">
	                          {t('damagePhoto')}
	                          <input
	                            type="file"
	                            accept="image/*"
	                            onChange={e => setReportDamageImage(e.target.files?.[0] ?? null)}
	                            className="mt-1 w-full px-3 py-2 rounded-md bg-slate-900 text-slate-100"
	                          />
	                        </label>
	                      </div>
	                    )}
	                  </div>
	                  <div className="rounded-md bg-slate-800 p-3 border border-amber-500/20">
	                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
	                      <label className="text-slate-100 font-semibold text-sm">{t('customerAcceptance')}</label>
	                      <div className="grid grid-cols-1 sm:grid-cols-2 rounded-md overflow-hidden border border-slate-700 w-full sm:w-auto">
	                        <button
	                          type="button"
	                          onClick={() => { setCustomerSatisfied(true); setCustomerFeedback('') }}
	                          className={`px-3 py-3 text-sm ${customerSatisfied ? 'bg-cyan-600 text-white' : 'bg-slate-900 text-slate-300'}`}
	                        >
	                          {t('customerSatisfied')}
	                        </button>
	                        <button
	                          type="button"
	                          onClick={() => setCustomerSatisfied(false)}
	                          className={`px-3 py-3 text-sm ${!customerSatisfied ? 'bg-rose-600 text-white' : 'bg-slate-900 text-slate-300'}`}
	                        >
	                          {t('customerComplaint')}
	                        </button>
	                      </div>
	                    </div>
	                    {!customerSatisfied && (
	                      <textarea
	                        value={customerFeedback}
	                        onChange={e => setCustomerFeedback(e.target.value)}
	                        placeholder={t('customerFeedbackPlaceholder')}
	                        className="mt-3 w-full px-3 py-2 rounded-md bg-slate-900 text-slate-100"
	                        rows={3}
	                      />
	                    )}
	                  </div>
	                  <div>
	                    <label className="text-slate-300 text-sm">{t('clientSignature')}</label>
	                    <p className="mt-1 text-xs text-slate-400">
	                      {t('signatureText')}
	                    </p>
                      <button
                        type="button"
                        onClick={openSignatureModal}
                        className="mt-1 w-full rounded-md bg-slate-800 border border-slate-700 min-h-[76px] p-3 text-left"
                      >
                        {reportSignatureDataUrl ? (
                          <img src={reportSignatureDataUrl} alt="Unterschrift Kunde" className="w-full max-h-20 object-contain rounded-md bg-slate-900" />
                        ) : (
                          <span className="block py-5 text-center text-slate-400">{t('signatureOpen')}</span>
                        )}
                      </button>
                      {customerSignedAt && (
                        <p className="mt-2 text-xs text-emerald-300">{t('signedAt')}: {formatDateBerlin(customerSignedAt)} {formatTimeBerlin(customerSignedAt)}</p>
                      )}
	                    <button type="button" onClick={clearSignature} className="mt-2 px-3 py-2 bg-slate-700 rounded-md text-white text-sm">{t('clearSignature')}</button>
	                  </div>
                  <label className="flex items-center gap-2 rounded-md bg-slate-800/70 px-3 py-2 text-sm text-slate-100">
                    <input
                      type="checkbox"
                      checked={Boolean(reportChecklist.workDone && reportChecklist.workTime)}
                      onChange={e => setReportChecklist(current => ({
                        ...current,
                        workDone: e.target.checked,
                        workTime: e.target.checked,
                      }))}
                    />
                    <span>{t('completionCheckText')}</span>
                  </label>
	                    <div className="flex gap-2">
	                      <button type="submit" className="flex-1 px-4 py-2 bg-cyan-600 rounded-md text-white">{editingReportId ? t('updateReport') : t('saveReport')}</button>
		                      <button type="button" onClick={resetReportForm} className="flex-1 px-4 py-2 bg-slate-700 rounded-md text-white">{editingReportId ? t('cancelEdit') : t('reset')}</button>
	                    </div>
	                </form>
	              </div>
	            ) : view === 'times' ? (
	              <div className="rounded-[1.75rem] p-6 bg-slate-900/85 ring-1 ring-slate-700">
	                <h3 className="text-white font-semibold mb-3">{t('searchWorkTimes')}</h3>
	                <div className="space-y-3">
	                  <input
	                    type="date"
	                    value={workerSearchDate}
	                    onChange={e => setWorkerSearchDate(e.target.value)}
	                    className="w-full px-3 py-2 rounded-md bg-slate-800 text-slate-100"
	                  />
	                  <select
	                    value={workerSearchId}
	                    onChange={e => setWorkerSearchId(e.target.value)}
	                    disabled={!isAdmin}
	                    className="w-full px-3 py-2 rounded-md bg-slate-800 text-slate-100"
	                  >
	                    {isAdmin ? (
	                      <>
	                        <option value="">{t('allWorkers')}</option>
	                        {workers.map(worker => (
	                          <option key={worker.id} value={worker.id}>{worker.name}</option>
	                        ))}
	                      </>
	                    ) : (
	                      <option value={currentWorker?.id ?? ''}>{currentWorker?.name ?? user.email}</option>
	                    )}
	                  </select>
	                  {!isAdmin && (
	                    <p className="text-xs text-slate-400">{t('onlyOwnTimes')}</p>
	                  )}
	                  <button type="button" onClick={incarcaWorkerEntries} className="w-full px-4 py-3 bg-cyan-600 rounded-md text-white font-semibold">
	                    {t('search')}
	                  </button>
	                </div>
	              </div>
	            ) : view === 'materials' ? (
	              <div className="rounded-[1.75rem] p-6 bg-slate-900/85 ring-1 ring-slate-700">
	                <h3 className="text-white font-semibold mb-3">{t('materials')}</h3>
                  <form onSubmit={handleSaveMaterialRequest} className="mb-5 rounded-2xl border border-cyan-500/20 bg-slate-800/70 p-4 space-y-3">
                    <div className="text-sm font-semibold text-cyan-100">{t('materialNeed')}</div>
                    <input
                      list="material-objects-list"
                      value={materialRequestObject}
                      onChange={e => handleMaterialRequestObjectChange(e.target.value)}
                      placeholder={t('objectSelect')}
                      className="w-full rounded-md bg-slate-900 px-3 py-2 text-slate-100"
                    />
                    <datalist id="material-objects-list">
                      {objects.map(o => <option key={o.id} value={o.name}>{o.address ?? ''}</option>)}
                    </datalist>
                    <input
                      type="date"
                      value={materialRequestDate}
                      onChange={e => setMaterialRequestDate(e.target.value)}
                      className="w-full rounded-md bg-slate-900 px-3 py-2 text-slate-100"
                    />
                    <div className="space-y-2 max-h-80 overflow-auto pr-1">
                      {materialItems.length === 0 ? (
                        <div className="rounded-md bg-slate-900 px-3 py-3 text-sm text-slate-400">{t('noEntries')}</div>
                      ) : materialItems.map(item => (
                        <div key={item.id} className="rounded-md bg-slate-900 p-3">
                          <label className="flex items-start gap-2 text-sm text-slate-100">
                            <input
                              type="checkbox"
                              checked={selectedMaterialRequestIds.includes(item.id)}
                              onChange={() => handleMaterialRequestToggle(item.id)}
                              className="mt-1"
                            />
                            <span>
                              <span className="block font-semibold text-white">{item.name}</span>
                              <span className="block text-xs text-slate-400">{item.category}</span>
                            </span>
                          </label>
                          {selectedMaterialRequestIds.includes(item.id) && (
                            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <input
                                type="number"
                                min="1"
                                step="1"
                                inputMode="numeric"
                                value={materialRequestAmounts[item.id] ?? ''}
                                onChange={e => setMaterialRequestAmounts(current => ({
                                  ...current,
                                  [item.id]: e.target.value ? String(Math.max(1, Math.round(Number(e.target.value)))) : '',
                                }))}
                                placeholder={t('quantity')}
                                className="rounded-md bg-slate-800 px-3 py-2 text-slate-100"
                              />
                              <select
                                value={materialRequestUnits[item.id] ?? item.unit ?? ''}
                                onChange={e => {
                                  const nextUnit = e.target.value
                                  setMaterialRequestUnits(current => ({ ...current, [item.id]: nextUnit }))
                                }}
                                className="rounded-md bg-slate-800 px-3 py-2 text-slate-100"
                              >
                                <option value="">{t('unit')}</option>
                                {materialRequestUnitsList.map(unit => <option key={unit} value={unit}>{unit}</option>)}
                              </select>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <textarea
                      value={materialRequestFreeText}
                      onChange={e => setMaterialRequestFreeText(e.target.value)}
                      placeholder={t('miscMaterial')}
                      className="w-full rounded-md bg-slate-900 px-3 py-2 text-slate-100"
                      rows={2}
                    />
                    <button type="submit" className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white">
                      {editingMaterialRequestId ? t('updateRequest') : t('saveRequest')}
                    </button>
                    {editingMaterialRequestId && (
                      <button
                        type="button"
                        onClick={resetMaterialRequestForm}
                        className="w-full rounded-xl bg-slate-700 px-4 py-3 font-semibold text-white"
                      >
                        {t('cancel')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleSendMaterialSummary}
                      disabled={materialSummarySending}
                      className="w-full rounded-xl bg-cyan-600 px-4 py-3 font-semibold text-white disabled:bg-slate-700 disabled:text-slate-400"
                    >
                      {materialSummarySending ? '...' : t('sendMaterialSummary')}
                    </button>
                  </form>
	              </div>
	            ) : (
	              <div className="rounded-[1.75rem] p-6 bg-slate-900/85 ring-1 ring-slate-700 text-slate-300">
	                {t('noEntries')}
	              </div>
	            )}
          </div>

	          <div className="bg-slate-950/80 border border-slate-800 shadow-2xl rounded-[2rem] p-8 backdrop-blur-xl overflow-hidden">
	            <h2 className="text-sm uppercase tracking-[0.3em] font-bold text-slate-400 mb-6 text-center">{view==='pontaj' ? t('currentActivity') : view === 'reports' ? t('reports') : view === 'times' ? t('workTimes') : view === 'materials' ? t('materials') : t('currentActivity')}</h2>
	            <div className="space-y-4">
	              {view === 'pontaj' ? (
                istoric.length === 0 ? (
                  <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 text-center text-slate-400">
                    {t('noEntries')}
                  </div>
                ) : (
                  istoric.map((item) => (
                    <div key={item.id} className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-sm">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500 mb-1">
                            {formatDateBerlin(item.Uhrzeit_Start)}
                          </p>
                          <p className="text-sm font-semibold text-white">
                            {formatTimeBerlin(item.status === 'activ' ? (item.mode_changed_at ?? item.Uhrzeit_Start) : item.Uhrzeit_Start)}
                            {item.Uhrzeit_Ende ? ` – ${formatTimeBerlin(item.Uhrzeit_Ende)}` : ' …'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500 mb-1">{t('duration')}</p>
	                          <p className={`text-sm font-bold ${item.status === 'activ' ? 'text-emerald-400' : 'text-slate-200'}`}>
	                            {item.status === 'activ' ? 'LIVE' : item.effective_minutes > 0 ? formatDurationSeconds(minutesToSeconds(item.effective_minutes)) : calculeazaDurata(item.Uhrzeit_Start, item.Uhrzeit_Ende)}
	                          </p>
	                          {item.status !== 'activ' && !item.report_id && (
	                            <p className="mt-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-200">
	                              {t('unreportedTime')}
	                            </p>
	                          )}
                        </div>
                      </div>
	                      {item.status !== 'activ' && !item.report_id && (
	                        <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
	                          {t('missingReport')}
	                        </div>
	                      )}
                        {item.entry_type === 'manual' && (
                          <div className="mt-3 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-sm text-cyan-100">
                            Zeiterfassung: {t('manual')} - {item.correction_reason}
                          </div>
                        )}
                    </div>
                  ))
                )
	              ) : view === 'reports' ? (
	                reports.length === 0 ? (
	                  <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 text-center text-slate-400">{t('noReports')}</div>
	                ) : (
		                  reports.map(r => (
		                    <div key={r.id} className={`rounded-3xl border p-5 shadow-sm ${
                          isReviewStatus(r.status)
                            ? 'border-amber-300/40 bg-amber-400/10 shadow-amber-950/20'
                            : 'border-slate-800 bg-slate-900/80'
                        }`}>
			                      <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm text-slate-400 mb-1">{formatDateBerlin(r.start_time)} {formatTimeBerlin(r.start_time)}</div>
			                        <div className="text-white font-semibold">{r.object_name}</div>
                            </div>
                            <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${reportCardStatus(r).tone}`}>
                              {reportCardStatus(r).label}
                            </span>
                          </div>
			                      {r.auftragsnummer && <div className="text-xs text-slate-400 mt-1">{t('order')}: {r.auftragsnummer}</div>}
			                      {r.worker_names?.length > 0 && <div className="text-xs text-slate-400 mt-1">{t('team')}: {r.worker_names.join(', ')}</div>}
			                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
	                        <div className="rounded-lg bg-slate-950/70 p-2">
		                          <span className="block text-slate-500">{t('workedEffective')}</span>
		                          <span className="font-semibold text-emerald-300">{formatDurationSeconds(getStoredSeconds(r, 'effective_minutes', 'effective_seconds'))}</span>
	                        </div>
		                        <div className="rounded-lg bg-slate-950/70 p-2">
		                          <span className="block text-slate-500">{t('pause')} / {t('drivingTime')}</span>
		                          <span className="font-semibold text-slate-200">{formatDurationSeconds(getStoredSeconds(r, 'pause_minutes', 'pause_seconds') + getStoredSeconds(r, 'fahrzeit_minutes', 'fahrzeit_seconds'))}</span>
		                          {getStoredSeconds(r, 'auto_pause_minutes', 'auto_pause_seconds') > 0 && (
		                            <span className="block text-amber-300">{t('auto')} {t('pause')} {formatDurationSeconds(getStoredSeconds(r, 'auto_pause_minutes', 'auto_pause_seconds'))}</span>
		                          )}
		                        </div>
	                      </div>
			                      {r.worker_email && <div className="text-xs text-slate-500 mt-2">{t('workers')}: {r.worker_email}</div>}
                          <div className="text-xs text-slate-500 mt-1">Zeiterfassung: {r.entry_type === 'manual' ? `${t('manual')} - ${r.correction_reason ?? ''}` : t('automatic')}</div>
                          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                            <div className="rounded-lg bg-slate-950/70 p-2">
                              <span className="block text-slate-500">{t('workStart')}</span>
                              <span className="font-semibold text-slate-200">{formatTimeBerlin(r.start_time)}</span>
                            </div>
                            <div className="rounded-lg bg-slate-950/70 p-2">
                              <span className="block text-slate-500">{t('workEnd')}</span>
                              <span className="font-semibold text-slate-200">{r.end_time ? formatTimeBerlin(r.end_time) : '-'}</span>
                            </div>
                            <div className="rounded-lg bg-slate-950/70 p-2">
                              <span className="block text-slate-500">{t('pause')}</span>
                              <span className="font-semibold text-amber-300">{formatDurationMinutes(r.pause_minutes)}</span>
                            </div>
                          </div>
                          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                            {[
                              [r.checklist_work_time, t('checklistWorkTime')],
                              [r.checklist_work_done, t('checklistWorkDone')],
                            ].map(([checked, label]) => (
                              <div key={label} className={`rounded-lg border px-2 py-2 ${checked ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100' : 'border-slate-700 bg-slate-950/60 text-slate-400'}`}>
                                {checked ? '[x]' : '[ ]'} {label}
                              </div>
                            ))}
                          </div>
		                      <div className="text-slate-300 text-sm mt-2">{r.task}</div>
		                      {isAdmin && r.task_de && r.task_de !== r.task && (
		                        <div className="mt-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 p-3 text-sm text-cyan-100 whitespace-pre-wrap">
		                          <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-300 mb-1">Deutsch</div>
		                          {r.task_de}
		                        </div>
		                      )}
		                      {r.damage_present && (
		                        <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3">
		                          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-200">{t('damage')}</div>
		                          {r.damage_description && <div className="mt-2 text-sm text-slate-200 whitespace-pre-wrap">{r.damage_description}</div>}
		                          {isAdmin && r.damage_description_de && r.damage_description_de !== r.damage_description && (
		                            <div className="mt-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 p-3 text-sm text-cyan-100 whitespace-pre-wrap">
		                              <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-300 mb-1">Deutsch</div>
		                              {r.damage_description_de}
		                            </div>
		                          )}
		                          {r.damage_image_url && (
		                            <img src={r.damage_image_url} alt={t('damagePhoto')} className="mt-3 w-full rounded-md bg-slate-800 border border-slate-700" />
		                          )}
		                        </div>
		                      )}
		                      {r.customer_satisfied === false && (
		                        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
		                          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">{t('customerComplaint')}</div>
		                          {r.customer_feedback && <div className="mt-2 text-sm text-slate-200 whitespace-pre-wrap">{r.customer_feedback}</div>}
		                          {isAdmin && r.customer_feedback_de && r.customer_feedback_de !== r.customer_feedback && (
		                            <div className="mt-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 p-3 text-sm text-cyan-100 whitespace-pre-wrap">
		                              <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-300 mb-1">Deutsch</div>
		                              {r.customer_feedback_de}
		                            </div>
		                          )}
		                        </div>
		                      )}
		                      {r.client_signature_data_url && (
		                        <div className="mt-3">
		                          <div className="text-xs text-slate-500 mb-1">{t('clientSignature')}</div>
		                          <img src={r.client_signature_data_url} alt="Unterschrift Kunde" className="w-full rounded-md bg-slate-800 border border-slate-700" />
		                        </div>
		                      )}
                          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {(r.locked_by_signature || r.customer_signed_at) && !canEditLockedReports && (
                              <div className="px-3 py-2 rounded-md bg-amber-500/10 text-amber-200 text-sm font-semibold text-center">
                                {t('signedLocked')}
                              </div>
                            )}
                            {(!r.email_sent && r.status !== 'Versendet' && (!(r.locked_by_signature || r.customer_signed_at) || canEditLockedReports)) && (
                              <button type="button" onClick={() => handleEditReport(r)} className="px-3 py-2 rounded-md bg-slate-700 text-white text-sm font-semibold">
                                {(r.locked_by_signature || r.customer_signed_at) && canEditLockedReports ? t('adminEdit') : t('edit')}
                              </button>
                            )}
                            {canEditLockedReports && (!r.email_sent && r.status !== 'Versendet') ? (
                              <button type="button" onClick={() => handleSendReport(r)} className="px-3 py-2 rounded-md bg-cyan-600 text-white text-sm font-semibold">
                                {t('send')}
                              </button>
                            ) : (!canEditLockedReports && !r.email_sent && r.status !== 'Versendet') ? (
                              <div className="px-3 py-2 rounded-md bg-amber-500/10 text-amber-200 text-sm font-semibold text-center">
                                {t('waitingForReview')}
                              </div>
                            ) : (
                              <div className="px-3 py-2 rounded-md bg-emerald-500/10 text-emerald-200 text-sm font-semibold text-center">
                                {t('sentAlready')}
                              </div>
                            )}
                          </div>
		                    </div>
		                  ))
	                )
	              ) : view === 'times' ? (
	                workerEntries.length === 0 ? (
	                  <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 text-center text-slate-400">{t('noTimes')}</div>
	                ) : (
	                  <>
	                    <div className="rounded-3xl border border-cyan-500/30 bg-cyan-500/10 p-5">
	                      <div className="text-xs uppercase tracking-[0.25em] text-cyan-200">{t('workedEffective')}</div>
	                      <div className="mt-1 text-2xl font-black text-white">{formatDurationMinutes(workerEntriesTotalMinutes)}</div>
	                    </div>
	                    {workerEntries.map(entry => (
	                      <div key={entry.id} className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-sm">
	                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
	                          <div>
	                            <div className="text-white font-semibold">{entry.worker_name}</div>
	                            <div className="text-sm text-slate-300 mt-1">{entry.object_name ?? 'Ohne Objekt'}</div>
	                            {entry.auftragsnummer && <div className="text-xs text-slate-500 mt-1">{t('order')}: {entry.auftragsnummer}</div>}
	                          </div>
	                          <div className="text-left sm:text-right">
	                            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">{t('effective')}</div>
	                            <div className="text-sm font-bold text-emerald-300">{formatDurationMinutes(entry.effective_minutes)}</div>
	                          </div>
	                        </div>
	                        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
	                          <div className="rounded-lg bg-slate-950/70 p-2">
	                            <span className="block text-slate-500">{t('total')}</span>
	                            <span className="font-semibold text-slate-200">{formatDurationMinutes(entry.total_minutes)}</span>
	                          </div>
	                          <div className="rounded-lg bg-slate-950/70 p-2">
	                            <span className="block text-slate-500">{t('pause')}</span>
	                            <span className="font-semibold text-amber-300">{formatDurationMinutes(entry.pause_minutes)}</span>
	                          </div>
	                          <div className="rounded-lg bg-slate-950/70 p-2">
	                            <span className="block text-slate-500">{t('drivingTime')}</span>
	                            <span className="font-semibold text-slate-200">{formatDurationMinutes(entry.fahrzeit_minutes)}</span>
	                          </div>
	                        </div>
	                      </div>
	                    ))}
	                  </>
	                )
	              ) : view === 'materials' ? (
                  <>
                    <div className="rounded-3xl border border-cyan-500/20 bg-slate-900/80 p-5 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">{t('savedRequests')}</div>
                          <div className="mt-1 text-white font-semibold">{materialRequestDate}</div>
                        </div>
                        <span className="rounded-full bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-200">
                          {materialRequests.length}
                        </span>
                      </div>
                      <div className="mt-3 space-y-3">
                        {materialRequests.length === 0 ? (
                          <div className="rounded-lg bg-slate-950/70 px-3 py-3 text-sm text-slate-400">{t('noEntries')}</div>
                        ) : materialRequests.map(request => (
                          <div key={request.id} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-sm font-semibold text-white">{request.objekt_name}</div>
                                <div className="text-xs text-slate-500">{t('reportedBy')}: {request.reporter_name ?? request.reporter_email}</div>
                              </div>
                              {(isAdmin || isVorarbeiter) ? (
                                <select
                                  value={request.status ?? 'offen'}
                                  onChange={e => handleMaterialRequestStatus(request.id, e.target.value)}
                                  className="rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-100"
                                >
                                  {['offen', 'geplant', 'eingepackt', 'mitgenommen', 'erledigt'].map(status => <option key={status} value={status}>{status}</option>)}
                                </select>
                              ) : (
                                <span className="rounded-full bg-slate-800 px-2 py-1 text-[10px] font-semibold text-slate-300">{request.status ?? 'offen'}</span>
                              )}
                            </div>
                            <div className="mt-3 space-y-1 text-xs text-slate-300">
                              {(request.material_request_items ?? []).map(item => {
                                const itemName = item.custom_name ?? item.material_items?.name ?? materialItems.find(mat => mat.id === item.material_item_id)?.name ?? item.material_item_id
                                return (
                                  <div key={item.id}>- {itemName}{item.quantity ? `: ${Math.round(Number(item.quantity))}` : ''}{item.unit ? ` ${item.unit}` : ''}</div>
                                )
                              })}
                            </div>
                            {!request.summary_sent ? (
                              <button
                                type="button"
                                onClick={() => handleEditMaterialRequest(request)}
                                className="mt-3 w-full rounded-md bg-slate-800 px-3 py-2 text-sm font-semibold text-white"
                              >
                                {t('editRequest')}
                              </button>
                            ) : (
                              <div className="mt-3 rounded-md bg-emerald-500/10 px-3 py-2 text-center text-xs font-semibold text-emerald-200">
                                {t('sentAlready')}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                    {(isAdmin || isVorarbeiter) && (
                      <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-sm">
                        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">{t('adminInventory')}</div>
                        <div className="mt-3 space-y-2">
                          {openCheckouts.length === 0 ? (
                            <div className="rounded-lg bg-slate-950/70 px-3 py-2 text-sm text-slate-400">{t('noEntries')}</div>
                          ) : openCheckouts.map(checkout => (
                            <div key={checkout.id} className="rounded-lg bg-slate-950/70 px-3 py-2">
                              <div className="text-sm font-semibold text-white">{checkout.inventory_items?.name ?? checkout.inventory_item_id}</div>
                              <div className="text-xs text-slate-400">{t('workers')}: {checkout.worker_name ?? checkout.worker_email}</div>
                              {checkout.object_name && <div className="text-xs text-slate-400">Objekt: {checkout.object_name}</div>}
                              <div className="text-xs text-slate-500">Seit: {formatTimeBerlin(checkout.taken_at)}</div>
                              <button
                                type="button"
                                onClick={() => handleUndoEquipmentCheckout(checkout)}
                                className="mt-2 w-full rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/20"
                              >
                                {t('equipmentUndo')}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
	              ) : (
	                <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 text-center text-slate-400">{t('noEntries')}</div>
	              )}
            </div>
          </div>
        </div>
        {workerPickerOpen && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 p-4 flex items-end sm:items-center justify-center">
            <div className="w-full max-w-lg rounded-3xl border border-slate-700 bg-slate-900 p-4 shadow-2xl">
              <div className="flex items-center justify-between gap-3">
                <div className="text-white font-semibold">{t('selectWorkers')} ({selectedWorkerIds.length} {t('selectedCount')})</div>
                <button type="button" onClick={() => setWorkerPickerOpen(false)} className="rounded-md bg-slate-800 px-3 py-2 text-sm text-slate-100">
                  {t('cancel')}
                </button>
              </div>
              <input
                value={workerSearch}
                onChange={e => setWorkerSearch(e.target.value)}
                placeholder={t('workerSearch')}
                className="mt-3 w-full rounded-md bg-slate-800 px-3 py-2 text-slate-100"
              />
              <div className="mt-3 max-h-80 space-y-2 overflow-auto pr-1">
                {filteredWorkers.length === 0 ? (
                  <div className="rounded-md bg-slate-800 px-3 py-3 text-sm text-slate-400">{t('noWorkers')}</div>
                ) : filteredWorkers.map(worker => (
                  <label key={worker.id} className="flex items-center gap-3 rounded-md bg-slate-800 px-3 py-3 text-sm text-slate-100">
                    <input
                      type="checkbox"
                      checked={selectedWorkerIds.includes(worker.id)}
                      onChange={() => handleWorkerToggle(worker.id)}
                    />
                    <span>{worker.name}</span>
                  </label>
                ))}
              </div>
              <button type="button" onClick={() => setWorkerPickerOpen(false)} className="mt-3 w-full rounded-xl bg-cyan-600 px-4 py-3 font-semibold text-white">
                {t('confirmSelection')}
              </button>
            </div>
          </div>
        )}
        {workPickerOpen && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 p-4 flex items-end sm:items-center justify-center">
            <div className="w-full max-w-lg rounded-3xl border border-slate-700 bg-slate-900 p-4 shadow-2xl">
              <div className="flex items-center justify-between gap-3">
                <div className="text-white font-semibold">{t('selectWorkDone')} ({selectedWorkTemplates.length} {t('selectedCount')})</div>
                <button type="button" onClick={() => setWorkPickerOpen(false)} className="rounded-md bg-slate-800 px-3 py-2 text-sm text-slate-100">
                  {t('cancel')}
                </button>
              </div>
              <div className="mt-3 max-h-80 space-y-2 overflow-auto pr-1">
                {workTemplateOptions.map(template => (
                  <label key={template} className="flex items-center gap-3 rounded-md bg-slate-800 px-3 py-3 text-sm text-slate-100">
                    <input
                      type="checkbox"
                      checked={selectedWorkTemplates.includes(template)}
                      onChange={() => handleWorkTemplateToggle(template)}
                    />
                    <span>{template}</span>
                  </label>
                ))}
              </div>
              <button type="button" onClick={() => setWorkPickerOpen(false)} className="mt-3 w-full rounded-xl bg-cyan-600 px-4 py-3 font-semibold text-white">
                {t('confirmSelection')}
              </button>
            </div>
          </div>
        )}
        {signatureModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-950/95 p-4 flex flex-col">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <div className="text-white font-semibold">{t('clientSignature')}</div>
                <div className="text-xs text-slate-400">{t('signatureText')}</div>
              </div>
              <button type="button" onClick={() => setSignatureModalOpen(false)} className="px-3 py-2 rounded-md bg-slate-800 text-slate-100">
                {t('cancel')}
              </button>
            </div>
            <canvas
              ref={modalSignatureRef}
              width={1100}
              height={620}
              onMouseDown={startModalSignature}
              onMouseMove={drawModalSignature}
              onMouseUp={stopModalSignature}
              onMouseLeave={stopModalSignature}
              onTouchStart={startModalSignature}
              onTouchMove={drawModalSignature}
              onTouchEnd={stopModalSignature}
              className="flex-1 min-h-0 w-full rounded-2xl bg-slate-900 border border-slate-700 touch-none"
            />
            <div className="mt-3 grid grid-cols-3 gap-2">
              <button type="button" onClick={clearModalSignature} className="px-4 py-3 rounded-xl bg-slate-800 text-white font-semibold">
                {t('clearSignature')}
              </button>
              <button type="button" onClick={() => setSignatureModalOpen(false)} className="px-4 py-3 rounded-xl bg-slate-700 text-white font-semibold">
                {t('cancel')}
              </button>
              <button type="button" onClick={applyModalSignature} className="px-4 py-3 rounded-xl bg-cyan-600 text-white font-semibold">
                {t('apply')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
