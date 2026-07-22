import type { DesktopLibraryItem, DesktopLibraryItemType } from './types'
import { DESKTOP_LIBRARY_ITEM_TYPES } from './types'

export function isDesktopLibraryItemType(value: unknown): value is DesktopLibraryItemType {
  return typeof value === 'string' && (DESKTOP_LIBRARY_ITEM_TYPES as readonly string[]).includes(value)
}

/** Family-safe identity — never dedupe by raw id alone. */
export function libraryItemIdentity(type: DesktopLibraryItemType, id: string): string {
  return `${type}:${id.trim()}`
}

export function libraryItemKey(item: Pick<DesktopLibraryItem, 'type' | 'id'>): string {
  return libraryItemIdentity(item.type, item.id)
}

export function parseLibraryIdentity(identity: string): { type: DesktopLibraryItemType; id: string } | null {
  const trimmed = identity.trim()
  const sep = trimmed.indexOf(':')
  if (sep <= 0) return null
  const type = trimmed.slice(0, sep)
  const id = trimmed.slice(sep + 1).trim()
  if (!isDesktopLibraryItemType(type) || !id) return null
  return { type, id }
}
