import { parseTurnusSheet } from './turnusSheet'

const PDFJS_BASE = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build'
const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/+esm'

function isPdf(file) {
  const name = String(file?.name || '').toLowerCase()
  return file?.type === 'application/pdf' || name.endsWith('.pdf')
}

function importUrl(url) {
  return import(/* @vite-ignore */ url)
}

async function loadPdfjs() {
  const module = await importUrl(`${PDFJS_BASE}/pdf.min.mjs`)
  const pdfjs = module?.getDocument ? module : module?.default
  if (!pdfjs?.getDocument) throw new Error('pdf.js konnte nicht geladen werden')
  pdfjs.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/pdf.worker.min.mjs`
  return pdfjs
}

async function loadTesseract() {
  try {
    return await import('tesseract.js')
  } catch {
    const module = await importUrl(TESSERACT_URL)
    return module?.createWorker ? module : module?.default
  }
}

function canvasToBlob(canvas) {
  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.85)
  })
}

function loadImage(source) {
  if (source && typeof source.width === 'number' && typeof source.getContext === 'function') return Promise.resolve(source)
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    if (typeof source === 'string') image.src = source
    else image.src = URL.createObjectURL(source)
  })
}

async function prepareImage(source) {
  const image = await loadImage(source)
  const scale = image.width && image.width < 1400 ? 2 : 1.35
  const canvas = globalThis.document.createElement('canvas')
  canvas.width = Math.round((image.width || 1) * scale)
  canvas.height = Math.round((image.height || 1) * scale)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = pixels.data
  for (let index = 0; index < data.length; index += 4) {
    const gray = (data[index] * 0.3) + (data[index + 1] * 0.59) + (data[index + 2] * 0.11)
    const value = gray < 165 ? 0 : 255
    data[index] = value
    data[index + 1] = value
    data[index + 2] = value
  }
  ctx.putImageData(pixels, 0, 0)
  return canvas
}

function wordsFrom(result, offsetY = 0) {
  return (result?.data?.words || []).map(word => ({
    text: word.text,
    x: word.bbox?.x0 ?? 0,
    y: (word.bbox?.y0 ?? 0) + offsetY,
    r: word.bbox?.x1 ?? 0,
    b: (word.bbox?.y1 ?? 0) + offsetY,
  }))
}

async function recognizeSource(source) {
  const prepared = await prepareImage(source).catch(() => source)
  const { createWorker } = await loadTesseract()
  const worker = await createWorker('deu')
  try {
    await worker.setParameters({ tessedit_pageseg_mode: '6' })
    const result = await worker.recognize(prepared)
    return {
      text: result.data?.text || '',
      words: wordsFrom(result),
    }
  } finally {
    await worker.terminate()
  }
}

async function pdfText(document) {
  const pages = []
  const max = Math.min(document.numPages, 3)
  for (let index = 1; index <= max; index += 1) {
    const page = await document.getPage(index)
    const content = await page.getTextContent()
    pages.push((content.items || []).map(item => item.str).join(' '))
  }
  return pages.join('\n')
}

async function renderPdf(file) {
  const pdfjs = await loadPdfjs()
  const data = new Uint8Array(await file.arrayBuffer())
  const document = await pdfjs.getDocument({ data }).promise
  const canvases = []
  const max = Math.min(document.numPages, 3)
  for (let index = 1; index <= max; index += 1) {
    const page = await document.getPage(index)
    const viewport = page.getViewport({ scale: 2 })
    const canvas = globalThis.document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
    canvases.push(canvas)
  }
  return {
    text: await pdfText(document),
    canvases,
    preview: canvases[0] ? await canvasToBlob(canvases[0]) : null,
  }
}

export async function readTurnusFile(file) {
  if (!file) return { title: '', rows: [], previewBlob: null }
  if (isPdf(file)) {
    const rendered = await renderPdf(file)
    const fromText = parseTurnusSheet({ text: rendered.text, words: [] })
    if (fromText.rows.length) return { ...fromText, previewBlob: rendered.preview }
    const words = []
    const texts = []
    let offset = 0
    for (const canvas of rendered.canvases) {
      const ocr = await recognizeSource(canvas)
      texts.push(ocr.text)
      words.push(...ocr.words.map(word => ({ ...word, y: word.y + offset, b: word.b + offset })))
      offset += canvas.height + 24
    }
    return {
      ...parseTurnusSheet({ text: texts.join('\n'), words }),
      previewBlob: rendered.preview,
    }
  }
  const ocr = await recognizeSource(file)
  return {
    ...parseTurnusSheet(ocr),
    previewBlob: file,
  }
}
