import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appPath = path.join(__dirname, '../src/App.jsx')
const lines = fs.readFileSync(appPath, 'utf8').split(/\r?\n/)

// 1-based line numbers to remove (inclusive), bottom to top
const ranges = [
  [4690, 5218],
  [1646, 3466],
]

let result = [...lines]
for (const [start, end] of ranges) {
  result.splice(start - 1, end - start + 1)
}

let text = result.join('\n')

text = text.replace(
  "import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'\nimport pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'\n\npdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker\n\n",
  '',
)

text = text.replace(
  "const storeNames = ['Netto', 'Norma', 'Lidl', 'Aldi', 'Rewe', 'Kaufland', 'Edeka', 'dm', 'Rossmann', 'Globus']\n",
  '',
)

text = text.replace(
  "import { Pantry } from './components/Pantry'\n",
  "import { Pantry } from './components/Pantry'\nimport { SmartShopping } from './components/SmartShopping'\nimport { inferOfferCategory, normalizeOfferPayload, normalizeProduct } from './lib/shoppingHelpers'\n",
)

fs.writeFileSync(appPath, text)
console.log('App.jsx spliced. Lines:', text.split(/\r?\n/).length)
