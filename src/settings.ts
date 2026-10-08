import { useCallback, useState } from 'react'

/**
 * Device-only preferences. Kept out of the journal document on purpose so the
 * API key is never synced to the cloud or included in exports.
 */
export interface Settings {
  /** Personal Anthropic API key used to read scorecard photos. */
  anthropicApiKey: string
  /** How the golfer's name or initials usually appear on their scorecards. */
  playerName: string
}

const SETTINGS_KEY = 'golf-journal-settings'

const defaults: Settings = { anthropicApiKey: '', playerName: '' }

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        return {
          anthropicApiKey: typeof parsed.anthropicApiKey === 'string' ? parsed.anthropicApiKey : '',
          playerName: typeof parsed.playerName === 'string' ? parsed.playerName : '',
        }
      }
    }
  } catch {
    // fall through
  }
  return defaults
}

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch }
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
      return next
    })
  }, [])
  return [settings, update]
}
