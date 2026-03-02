import type { ReactNode } from 'react'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'

export type ThemeMode = 'dark' | 'light'

type ThemeContextValue = {
  themeMode: ThemeMode
  toggleTheme: () => void
}

const THEME_STORAGE_KEY = 'app-theme-mode'

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

const resolveInitialTheme = (): ThemeMode => {
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === 'dark' || stored === 'light') {
    return stored
  }
  return 'dark'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeMode, setThemeMode] = useState<ThemeMode>(resolveInitialTheme)

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, themeMode)
    document.documentElement.setAttribute('data-theme', themeMode)
    document.documentElement.style.colorScheme = themeMode
  }, [themeMode])

  const value = useMemo(
    () => ({
      themeMode,
      toggleTheme: () => setThemeMode((prev) => (prev === 'dark' ? 'light' : 'dark')),
    }),
    [themeMode]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}
