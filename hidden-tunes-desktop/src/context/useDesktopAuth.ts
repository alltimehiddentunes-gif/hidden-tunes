import { useContext } from 'react'
import { DesktopAuthContext } from './desktopAuthContext'

export function useDesktopAuth() {
  const value = useContext(DesktopAuthContext)
  if (!value) {
    throw new Error('useDesktopAuth must be used within DesktopAuthProvider')
  }
  return value
}
