import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const lines = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8').split(/\r?\n/)

const exportFns = [
  'normalizeSearchTerm', 'findProductSynonym', 'productMatch', 'parseOfferText', 'parseReceiptText',
  'parseReceiptLine', 'splitOfferLines', 'extractTextFromPdf', 'normalizePdfText', 'offerPreviewKey',
  'mergePreviewRows', 'parseOfferLine', 'normalizeOfferPayload', 'detectStore', 'detectValidity',
  'normalizeUnit', 'normalizedUnitLabel', 'offerUnitPrice', 'inferOfferCategory', 'normalizeProduct',
  'offerCompareValue', 'offerDayValue', 'getOfferValidityStatus', 'formatOfferDate', 'offerValidityText',
  'buildShoppingHistory', 'bestShoppingMatches', 'buildStoreRecommendations',
]

let helpersBody = lines.slice(4689, 5027).join('\n')
for (const fn of exportFns) {
  helpersBody = helpersBody.replace(new RegExp(`^function ${fn}\\(`, 'm'), `export function ${fn}(`)
}

const helpersHeader = `import { toNumber } from './finance'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker

export const storeNames = ['Netto', 'Norma', 'Lidl', 'Aldi', 'Rewe', 'Kaufland', 'Edeka', 'dm', 'Rossmann', 'Globus']

`

fs.writeFileSync(path.join(root, 'src/lib/shoppingHelpers.js'), helpersHeader + helpersBody)

const componentHeader = `import { useMemo, useState } from 'react'
import { EntityList } from './EntityList'
import { formatMoney, isoDate, toNumber } from '../lib/finance'
import {
  storeNames,
  productMatch,
  parseOfferText,
  parseReceiptText,
  detectStore,
  mergePreviewRows,
  extractTextFromPdf,
  offerPreviewKey,
  getOfferValidityStatus,
  formatOfferDate,
  offerValidityText,
  buildShoppingHistory,
  bestShoppingMatches,
  buildStoreRecommendations,
} from '../lib/shoppingHelpers'

`

const part1 = lines.slice(1645, 3466).join('\n')
const part2 = lines.slice(5030, 5139).join('\n')
const componentFooter = '\nexport { SmartShopping }\n'

fs.writeFileSync(
  path.join(root, 'src/components/SmartShopping.jsx'),
  componentHeader + part1 + '\n' + part2 + componentFooter,
)

console.log('Wrote shoppingHelpers.js and SmartShopping.jsx')
