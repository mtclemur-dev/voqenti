/**
 * Motion settings for KlarBudget.
 * Controls animation level: 'full' | 'reduced' | 'none'
 *
 * Applies a CSS class to <html>: motion-full | motion-reduced | motion-none
 * Always respects browser prefers-reduced-motion (sets 'reduced' as max).
 */

import { useEffect, useState, useCallback } from 'react'

const LS_KEY = 'kb_motion'
const VALID = ['full', 'reduced', 'none']

function systemPrefersReduced() {
  return typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

function clampForSystem(value) {
  if (systemPrefersReduced() && value === 'full') return 'reduced'
  return value
}

function applyMotionClass(value) {
  if (typeof document === 'undefined') return
  document.documentElement.classList.remove('motion-full', 'motion-reduced', 'motion-none')
  document.documentElement.classList.add(`motion-${value}`)
}

function readStored() {
  try {
    const stored = localStorage.getItem(LS_KEY)
    if (VALID.includes(stored)) return stored
  } catch { /* noop */ }
  return 'full'
}

export function useMotionSettings() {
  const [motion, setMotionState] = useState(() => {
    const stored = readStored()
    return clampForSystem(stored)
  })

  // Apply class on mount and when motion changes
  useEffect(() => {
    applyMotionClass(motion)
  }, [motion])

  const setMotion = useCallback((value) => {
    if (!VALID.includes(value)) return
    const clamped = clampForSystem(value)
    try { localStorage.setItem(LS_KEY, value) } catch { /* noop */ }
    setMotionState(clamped)
  }, [])

  const cycleMotion = useCallback(() => {
    setMotion(motion === 'full' ? 'reduced' : motion === 'reduced' ? 'none' : 'full')
  }, [motion, setMotion])

  return { motion, setMotion, cycleMotion }
}

const LABELS = {
  full:    { icon: '✨', label: 'Animații: Normal' },
  reduced: { icon: '🌿', label: 'Animații: Redus' },
  none:    { icon: '⏹️',  label: 'Animații: Oprit' },
}

export function motionLabel(motion) {
  return LABELS[motion] || LABELS.full
}
