// @vitest-environment jsdom
import type { Editor } from '@tiptap/react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { STORAGE_KEY } from './lib/documents'
import { THEMES, THEME_STORAGE_KEY } from './lib/themes'

let darkMode: MediaQueryList

beforeEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
  document.documentElement.removeAttribute('style')
  darkMode = Object.assign(new EventTarget(), {
    matches: false,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }) as unknown as MediaQueryList
  vi.stubGlobal('matchMedia', (query: string) =>
    query === '(prefers-color-scheme: dark)'
      ? darkMode
      : Object.assign(new EventTarget(), { matches: false, media: query }),
  )
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  )
  Range.prototype.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    x: 0,
    y: 0,
    toJSON() {},
  })
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete document.documentElement.dataset.theme
  document.documentElement.removeAttribute('style')
})

async function mount() {
  render(<App />)
  await screen.findByRole('textbox', { name: 'Document body' })
  await waitFor(() => expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull())
}

function openAppearance() {
  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }))
  return screen.getByRole('dialog', { name: 'Make room for your words' })
}

function setSystemDark(matches: boolean) {
  Object.defineProperty(darkMode, 'matches', { configurable: true, value: matches })
  act(() => darkMode.dispatchEvent(new Event('change')))
}

function externalPreference(value: string | null) {
  const oldValue = localStorage.getItem(THEME_STORAGE_KEY)
  if (value === null) localStorage.removeItem(THEME_STORAGE_KEY)
  else localStorage.setItem(THEME_STORAGE_KEY, value)
  act(() =>
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: THEME_STORAGE_KEY,
        oldValue,
        newValue: value,
        storageArea: localStorage,
      }),
    ),
  )
}

describe('appearance preferences (jsdom integration)', () => {
  it('offers exactly eight named themes with complete, consistent token sets', () => {
    expect(THEME_STORAGE_KEY).toBe('foliohush.theme.v1')
    expect(THEMES.map((theme) => theme.id)).toEqual([
      'botanical',
      'parchment',
      'porcelain',
      'rosewater',
      'midnight',
      'forest',
      'ink',
      'espresso',
    ])
    expect(new Set(THEMES.map((theme) => theme.name)).size).toBe(8)
    const tokenNames = Object.keys(THEMES[0].tokens).sort()
    expect(tokenNames.length).toBeGreaterThan(8)
    for (const theme of THEMES) {
      expect(['light', 'dark']).toContain(theme.mode)
      expect(Object.keys(theme.tokens).sort()).toEqual(tokenNames)
      expect(Object.values(theme.tokens).every((value) => value.trim().length > 0)).toBe(true)
    }
  })

  it('starts with Botanical and exposes the selected choice accessibly', async () => {
    await mount()
    expect(document.documentElement.dataset.theme).toBe('botanical')
    const dialog = openAppearance()
    expect(within(dialog).getByRole('button', { name: /Botanical/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(within(dialog).getByRole('button', { name: 'Follow system' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it.each(THEMES)('persists $name separately without rewriting the workspace', async (theme) => {
    await mount()
    const workspace = localStorage.getItem(STORAGE_KEY)
    const writes = vi.spyOn(Storage.prototype, 'setItem')
    const dialog = openAppearance()
    const choice = within(dialog).getByRole('button', { name: new RegExp(theme.name) })
    fireEvent.click(choice)
    expect(document.documentElement.dataset.theme).toBe(theme.id)
    expect(choice).toHaveAttribute('aria-pressed', 'true')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(theme.id)
    expect(localStorage.getItem(STORAGE_KEY)).toBe(workspace)
    expect(writes.mock.calls.filter(([key]) => key === STORAGE_KEY)).toHaveLength(0)
    cleanup()
    await mount()
    expect(document.documentElement.dataset.theme).toBe(theme.id)
    expect(localStorage.getItem(STORAGE_KEY)).toBe(workspace)
  })

  it.each(['unknown-theme', '"midnight"', '{broken', ''])(
    'falls back safely for invalid preference %j',
    async (preference) => {
      localStorage.setItem(THEME_STORAGE_KEY, preference)
      await mount()
      expect(document.documentElement.dataset.theme).toBe('botanical')
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    },
  )

  it('follows system changes only while the system preference is selected', async () => {
    await mount()
    const dialog = openAppearance()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Follow system' }))
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('system')
    expect(document.documentElement.dataset.theme).toBe('botanical')
    setSystemDark(true)
    expect(document.documentElement.dataset.theme).toBe('midnight')
    setSystemDark(false)
    expect(document.documentElement.dataset.theme).toBe('botanical')
    fireEvent.click(within(dialog).getByRole('button', { name: /Espresso/ }))
    setSystemDark(true)
    setSystemDark(false)
    expect(document.documentElement.dataset.theme).toBe('espresso')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('espresso')
  })

  it('restores a persisted system preference using the current OS setting', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'system')
    setSystemDark(true)
    await mount()
    expect(document.documentElement.dataset.theme).toBe('midnight')
    const dialog = openAppearance()
    expect(within(dialog).getByRole('button', { name: 'Follow system' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('syncs external appearance changes without pausing or rewriting the workspace', async () => {
    await mount()
    const workspace = localStorage.getItem(STORAGE_KEY)
    externalPreference('rosewater')
    expect(document.documentElement.dataset.theme).toBe('rosewater')
    expect(localStorage.getItem(STORAGE_KEY)).toBe(workspace)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    externalPreference('system')
    setSystemDark(true)
    expect(document.documentElement.dataset.theme).toBe('midnight')
    externalPreference('invalid')
    expect(document.documentElement.dataset.theme).toBe('botanical')
    externalPreference(null)
    expect(document.documentElement.dataset.theme).toBe('botanical')
    fireEvent.change(screen.getByLabelText('Document title'), {
      target: { value: 'Still writable after a theme change' },
    })
    await waitFor(() =>
      expect(localStorage.getItem(STORAGE_KEY)).toContain('Still writable after a theme change'),
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps editor identity, content, selection, and undo history through theme changes', async () => {
    await mount()
    const body = screen.getByRole('textbox', { name: 'Document body' }) as HTMLElement & {
      editor: Editor
    }
    const editor = body.editor
    const original = editor.getJSON()
    act(() => {
      editor.commands.setTextSelection(1)
      editor.commands.insertContent('A preserved thought. ')
    })
    const content = editor.getJSON()
    const selection = editor.state.selection.toJSON()
    const workspace = localStorage.getItem(STORAGE_KEY)
    const dialog = openAppearance()
    for (const theme of THEMES) {
      fireEvent.click(within(dialog).getByRole('button', { name: new RegExp(theme.name) }))
      expect(screen.getByRole('textbox', { name: 'Document body' })).toBe(body)
      expect(body.editor).toBe(editor)
      expect(editor.getJSON()).toEqual(content)
      expect(editor.state.selection.toJSON()).toEqual(selection)
    }
    expect(localStorage.getItem(STORAGE_KEY)).toBe(workspace)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close dialog' }))
    act(() => editor.commands.undo())
    expect(editor.getJSON()).toEqual(original)
    act(() => editor.commands.redo())
    expect(editor.getJSON()).toEqual(content)
  })

  it('can reopen and dismiss appearance repeatedly without altering the document', async () => {
    await mount()
    const workspace = localStorage.getItem(STORAGE_KEY)
    for (let count = 0; count < 3; count++) {
      const dialog = openAppearance()
      fireEvent.keyDown(dialog, { key: 'Escape' })
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    }
    expect(localStorage.getItem(STORAGE_KEY)).toBe(workspace)
  })
})
