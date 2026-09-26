import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const buildId = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VITE_APP_BUILD || `b${Date.now()}`
process.env.VITE_APP_BUILD = buildId

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'voqenti-version',
      closeBundle() {
        const dir = resolve('dist')
        mkdirSync(dir, { recursive: true })
        writeFileSync(resolve(dir, 'version.json'), `${JSON.stringify({ build: buildId })}\n`)
      },
    },
  ],
})
