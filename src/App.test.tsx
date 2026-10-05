// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import App from './App'
import { STORAGE_KEY } from './lib/documents'

beforeEach(() => {
  localStorage.clear()
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
  vi.unstubAllGlobals()
})
async function mount() {
  render(<App />)
  await screen.findByRole('textbox', { name: 'Document body' })
  await waitFor(() => expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull())
}
describe('writing desk integration (jsdom, not layout/browser QA)', () => {
  it('renders and saves the example workspace', async () => {
    await mount()
    expect(screen.getByLabelText('Document title')).toHaveValue('The art of a quiet beginning')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).documents).toHaveLength(1)
  })
  it('keeps title spaces and reloads the saved title', async () => {
    await mount()
    fireEvent.change(screen.getByLabelText('Document title'), {
      target: { value: 'A quiet room ' },
    })
    expect(screen.getByLabelText('Document title')).toHaveValue('A quiet room ')
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).documents[0].title).toBe(
        'A quiet room ',
      ),
    )
    cleanup()
    await mount()
    expect(screen.getByLabelText('Document title')).toHaveValue('A quiet room ')
  })
  it('creates distinct documents with independent state', async () => {
    await mount()
    fireEvent.click(screen.getByRole('button', { name: /New document/ }))
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).documents).toHaveLength(2),
    )
    expect(screen.getByLabelText('Document title')).toHaveValue('Untitled')
    fireEvent.click(screen.getByRole('button', { name: /The art of a quiet beginning/ }))
    expect(screen.getByLabelText('Document title')).toHaveValue('The art of a quiet beginning')
  })
  it('restores snapshots while retaining the replaced draft', async () => {
    await mount()
    fireEvent.click(screen.getByRole('button', { name: /Snapshots/ }))
    fireEvent.change(screen.getByLabelText('Snapshot name'), { target: { value: 'Original' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save snapshot' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }))
    fireEvent.change(screen.getByLabelText('Document title'), {
      target: { value: 'Revised title' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Snapshots/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
    expect(screen.getByLabelText('Document title')).toHaveValue('The art of a quiet beginning')
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).documents[0].snapshots[0].title).toBe(
        'Revised title',
      ),
    )
  })
  it('closes export through Escape without altering data', async () => {
    await mount()
    const before = localStorage.getItem(STORAGE_KEY)
    fireEvent.click(screen.getByRole('button', { name: 'Export' }))
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before)
  })
  it('never overwrites a corrupt workspace', async () => {
    localStorage.setItem(STORAGE_KEY, '{bad')
    render(<App />)
    await screen.findByRole('textbox', { name: 'Document body' })
    expect(screen.getByRole('alert')).toHaveTextContent('Your words need a backup')
    fireEvent.change(screen.getByLabelText('Document title'), { target: { value: 'Unsaved' } })
    expect(localStorage.getItem(STORAGE_KEY)).toBe('{bad')
    fireEvent.click(screen.getByRole('button', { name: 'Export' }))
    expect(screen.getByRole('button', { name: /Emergency plain text/ })).toBeInTheDocument()
  })
  it('detects stale storage even before the storage event arrives', async () => {
    await mount()
    const newer = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    newer.documents[0].title = 'Changed elsewhere'
    const raw = JSON.stringify(newer)
    localStorage.setItem(STORAGE_KEY, raw)
    fireEvent.change(screen.getByLabelText('Document title'), { target: { value: 'Local fork' } })
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('another tab'))
    expect(localStorage.getItem(STORAGE_KEY)).toBe(raw)
  })
  it('handles externally cleared storage without rewriting it', async () => {
    await mount()
    localStorage.clear()
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: null })))
    fireEvent.change(screen.getByLabelText('Document title'), {
      target: { value: 'Keep in memory' },
    })
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(screen.getByRole('alert')).toHaveTextContent('another tab')
  })
})
it('reselecting the active page does not lose the editor handle', async () => {
  await mount()
  fireEvent.click(screen.getByRole('button', { name: /The art of a quiet beginning/ }))
  fireEvent.change(screen.getByLabelText('Block style'), { target: { value: 'heading2' } })
  await waitFor(() =>
    expect(
      screen.getByRole('textbox', { name: 'Document body' }).querySelector('h2'),
    ).toHaveTextContent('A small, quiet place'),
  )
})
it('a delayed import never hijacks a newer document selection', async () => {
  await mount()
  const original = JSON.parse(localStorage.getItem(STORAGE_KEY)!).documents[0]
  const backup = JSON.stringify({ format: 'foliohush', version: 1, document: original })
  let finish!: (value: string) => void
  const pending = new Promise<string>((resolve) => {
    finish = resolve
  })
  fireEvent.change(screen.getByLabelText('Import JSON document'), {
    target: { files: [{ name: 'draft.json', size: backup.length, text: () => pending }] },
  })
  fireEvent.click(screen.getByRole('button', { name: /New document/ }))
  await act(async () => {
    finish(backup)
    await pending
  })
  await waitFor(() =>
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).documents).toHaveLength(3),
  )
  expect(screen.getByLabelText('Document title')).toHaveValue('Untitled')
})
it('concurrent imports cannot overflow the workspace capacity', async () => {
  const { createDocument, createWorkspace } = await import('./lib/documents')
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(
      createWorkspace(Array.from({ length: 49 }, (_, index) => createDocument(`Draft ${index}`))),
    ),
  )
  await mount()
  const original = JSON.parse(localStorage.getItem(STORAGE_KEY)!).documents[0]
  const backup = JSON.stringify({ format: 'foliohush', version: 1, document: original })
  let finish!: (value: string) => void
  const pending = new Promise<string>((resolve) => {
    finish = resolve
  })
  for (let i = 0; i < 2; i++)
    fireEvent.change(screen.getByLabelText('Import JSON document'), {
      target: { files: [{ name: `draft${i}.json`, size: backup.length, text: () => pending }] },
    })
  fireEvent.click(screen.getByRole('button', { name: /New document/ }))
  await act(async () => {
    finish(backup)
    await pending
  })
  await waitFor(() =>
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).documents).toHaveLength(50),
  )
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Import was not added')
})
