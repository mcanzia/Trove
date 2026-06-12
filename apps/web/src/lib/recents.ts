const KEY = 'trove-recent'
const MAX = 5

/** Recently visited category names, most-recent-first (max 5, deduped). */
export function getRecents(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** Record a visited category, moving it to the front (deduped, capped at 5). */
export function pushRecent(name: string): void {
  if (typeof window === 'undefined' || !name) return
  try {
    const next = [name, ...getRecents().filter((n) => n !== name)].slice(0, MAX)
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* ignore quota / serialization errors */
  }
}
