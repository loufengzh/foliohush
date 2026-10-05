import type { CSSProperties } from 'react'
import { Check, Monitor } from 'lucide-react'
import { THEMES, type ThemePreference } from './lib/themes'

export function ThemePicker({
  preference,
  chooseTheme,
  storageError,
}: {
  preference: ThemePreference
  chooseTheme: (theme: ThemePreference) => void
  storageError: boolean
}) {
  return (
    <>
      <p className="dialog-intro theme-intro">
        A different atmosphere for every kind of thought. Choose a desk and see it change instantly.
      </p>
      <div className="theme-grid" aria-label="Writing desk themes">
        {THEMES.map((theme) => (
          <button
            key={theme.id}
            className="theme-card"
            aria-pressed={preference === theme.id}
            onClick={() => chooseTheme(theme.id)}
            aria-label={theme.name}
          >
            <span
              aria-hidden="true"
              className="theme-preview"
              style={
                {
                  '--preview-paper': theme.tokens.paper,
                  '--preview-sidebar': theme.tokens.sidebar,
                  '--preview-ink': theme.tokens.ink,
                  '--preview-accent': theme.tokens.accent,
                } as CSSProperties
              }
            >
              <span className="theme-preview-side">
                <i />
                <i />
                <i />
                <i />
              </span>
              <span className="theme-preview-page">
                <b>Aa</b>
                <i />
                <i />
                <i />
              </span>
            </span>
            <span className="theme-card-label">
              <strong>{theme.name}</strong>
              {preference === theme.id ? (
                <Check aria-hidden="true" size={14} />
              ) : (
                <span className="theme-mode">{theme.mode}</span>
              )}
            </span>
            <small>{theme.description}</small>
          </button>
        ))}
      </div>
      <button
        className="theme-system"
        aria-label="Follow system"
        aria-pressed={preference === 'system'}
        onClick={() => chooseTheme('system')}
      >
        <Monitor size={17} />
        <span>
          Follow system <span className="theme-mode"> · Botanical / Midnight</span>
        </span>
        {preference === 'system' && <Check size={15} />}
      </button>
      <p className="fine-print theme-footnote">
        Saved for this browser. Your documents, snapshots, and exports stay the same.
      </p>
      {storageError && (
        <p className="error-text" role="status">
          This theme is active, but browser storage is unavailable. Your choice may reset when you
          reload.
        </p>
      )}
    </>
  )
}
