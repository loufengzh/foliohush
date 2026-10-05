// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type { Editor } from '@tiptap/react'
import { FolioEditor } from './FolioEditor'
import { EMPTY_CONTENT } from '../lib/documents'
let editor: Editor
beforeEach(() => {
  editor = undefined as unknown as Editor
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  )
  Range.prototype.getBoundingClientRect = () => ({
    left: 10,
    top: 10,
    right: 10,
    bottom: 10,
    width: 0,
    height: 0,
    x: 10,
    y: 10,
    toJSON() {},
  })
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
it('mounts the real editor, emits JSON, and retains undo/redo', async () => {
  const onChange = vi.fn()
  render(
    <FolioEditor
      initialContent={EMPTY_CONTENT}
      onReady={(e) => {
        editor = e
      }}
      onChange={onChange}
    />,
  )
  await waitFor(() => expect(editor).toBeDefined())
  act(() => {
    editor.commands.insertContent('A real transaction')
  })
  expect(screen.getByRole('textbox', { name: 'Document body' })).toHaveTextContent(
    'A real transaction',
  )
  expect(onChange).toHaveBeenCalled()
  act(() => {
    editor.commands.undo()
  })
  expect(editor.getText().trim()).toBe('')
  act(() => {
    editor.commands.redo()
  })
  expect(editor.getText()).toBe('A real transaction')
})
it('opens slash options and applies a keyboard-selected heading', async () => {
  render(
    <FolioEditor
      initialContent={EMPTY_CONTENT}
      onReady={(e) => {
        editor = e
      }}
    />,
  )
  await screen.findByRole('textbox', { name: 'Document body' })
  await waitFor(() => expect(editor?.isDestroyed).toBe(false))
  act(() => {
    editor.commands.insertContent('/heading 2')
  })
  await screen.findByRole('listbox', { name: 'Insert a block' })
  act(() => {
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    editor.view.dom.dispatchEvent(event)
  })
  expect(editor.getJSON().content?.[0].type).toBe('heading')
  expect(editor.getJSON().content?.[0].attrs?.level).toBe(2)
  expect(editor.getText().trim()).toBe('')
})
it('rejects unsupported transactions before they replace the draft', async () => {
  const onRejectedEdit = vi.fn()
  render(
    <FolioEditor
      initialContent={EMPTY_CONTENT}
      onReady={(e) => {
        editor = e
      }}
      onRejectedEdit={onRejectedEdit}
    />,
  )
  await waitFor(() => expect(editor).toBeDefined())
  act(() => {
    editor.commands.insertContent('Keep this sentence')
  })
  act(() => {
    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'orderedList',
          attrs: { start: -1 },
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Rejected' }] }],
            },
          ],
        },
      ],
    })
  })
  expect(editor.getText()).toBe('Keep this sentence')
  expect(onRejectedEdit).toHaveBeenCalled()
})
it('does not treat mounting or editability changes as document edits', async () => {
  const onChange = vi.fn()
  const onReady = (instance: Editor) => {
    editor = instance
  }
  const { rerender } = render(
    <FolioEditor initialContent={EMPTY_CONTENT} onReady={onReady} onChange={onChange} />,
  )
  await waitFor(() => expect(editor).toBeDefined())
  expect(onChange).not.toHaveBeenCalled()
  rerender(
    <FolioEditor
      initialContent={EMPTY_CONTENT}
      editable={false}
      onReady={onReady}
      onChange={onChange}
    />,
  )
  await waitFor(() => expect(editor.isEditable).toBe(false))
  expect(onChange).not.toHaveBeenCalled()
  rerender(
    <FolioEditor initialContent={EMPTY_CONTENT} editable onReady={onReady} onChange={onChange} />,
  )
  await waitFor(() => expect(editor.isEditable).toBe(true))
  expect(onChange).not.toHaveBeenCalled()
  act(() => {
    editor.commands.insertContent('An actual edit')
  })
  expect(onChange).toHaveBeenCalledTimes(1)
})
