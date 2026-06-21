import { useCallback, useLayoutEffect, useRef, useState } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'vk-theme'
const TRANSITION_SUPPRESS_CLASS = 'vk-theme-changing'

let transitionFrame = 0
let transitionFallbackTimer = 0

function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark'
  } catch {
    /* ignore */
  }
  return 'light'
}

function persistTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    /* ignore */
  }
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
}

function releaseTransitionSuppression() {
  const root = document.documentElement
  root.classList.remove(TRANSITION_SUPPRESS_CLASS)

  if (transitionFrame) {
    window.cancelAnimationFrame(transitionFrame)
    transitionFrame = 0
  }
  if (transitionFallbackTimer) {
    window.clearTimeout(transitionFallbackTimer)
    transitionFallbackTimer = 0
  }
}

function applyThemeWithoutTransitions(theme: Theme) {
  const root = document.documentElement
  root.classList.add(TRANSITION_SUPPRESS_CLASS)
  root.getBoundingClientRect()
  applyTheme(theme)

  if (transitionFrame) window.cancelAnimationFrame(transitionFrame)
  if (transitionFallbackTimer) window.clearTimeout(transitionFallbackTimer)

  transitionFrame = window.requestAnimationFrame(() => {
    transitionFrame = window.requestAnimationFrame(releaseTransitionSuppression)
  })
  transitionFallbackTimer = window.setTimeout(releaseTransitionSuppression, 140)
}

/** 明暗主题：持久化到 localStorage 并切换 <html> 的 .dark 类。 */
export function useTheme(): {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggle: () => void
} {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme)
  const themeRef = useRef(theme)

  useLayoutEffect(() => {
    themeRef.current = theme
    applyTheme(theme)
    persistTheme(theme)
  }, [theme])

  const setTheme = useCallback((next: Theme) => {
    if (themeRef.current === next) return
    themeRef.current = next
    applyThemeWithoutTransitions(next)
    persistTheme(next)
    setThemeState(next)
  }, [])

  const toggle = useCallback(() => {
    setTheme(themeRef.current === 'dark' ? 'light' : 'dark')
  }, [setTheme])

  return { theme, setTheme, toggle }
}
