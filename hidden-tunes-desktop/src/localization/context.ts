import { createContext, useContext } from 'react'

import type { LocalizationContextValue } from './types'

export const LocalizationContext = createContext<LocalizationContextValue | null>(null)

export function useLocalization(): LocalizationContextValue {
  const value = useContext(LocalizationContext)
  if (!value) throw new Error('useLocalization must be used within LocalizationProvider')
  return value
}

export function useLocalizationOptional(): LocalizationContextValue | null {
  return useContext(LocalizationContext)
}
