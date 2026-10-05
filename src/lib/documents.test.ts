import { describe, expect, it } from 'vitest'
import type { JSONContent } from '@tiptap/core'
import { getSchema } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import {
  createDocument,
  createWorkspace,
  DocumentValidationError,
  EMPTY_CONTENT,
  exportHtml,
  exportMarkdown,
  importDocument,
  isSafeUrl,
  loadWorkspace,
  MAX_JSON_BYTES,
  MAX_SNAPSHOTS,
  RECOVERY_KEY,
  recoverWorkspace,
  restoreSnapshot,
  safeLink,
  saveWorkspace,
  serializeDocument,
  snapshotDocument,
  STORAGE_KEY,
  updateDocument,
  validateContent,
  validateDocument,
  validateWorkspace,
  type StorageLike,
} from './documents'

const NOW = '2026-10-05T07:00:00.000Z'
const LATER = '2026-10-05T08:00:00.000Z'
const textDoc = (text = 'A little room to think.'): JSONContent => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})
const draft = () => createDocument('Field notes', textDoc(), NOW, 'original')

class MemoryStorage implements StorageLike {
  values = new Map<string, string>()
  writes: string[] = []
  getItem(key: string) {
    return this.values.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.writes.push(key)
    this.values.set(key, value)
  }
}

describe('document and workspace validation', () => {
  it('creates independent, valid default documents and workspaces', () => {
    const first = createDocument()
    const second = createDocument()
    expect(first.id).not.toBe(second.id)
    expect(first.content).toEqual(EMPTY_CONTENT)
    first.content.content!.push({ type: 'paragraph' })
    expect(second.content.content).toHaveLength(1)
    expect(EMPTY_CONTENT.content).toHaveLength(1)
    expect(createWorkspace([draft()]).activeDocumentId).toBe('original')
  })

  it('updates without mutating the original and preserves intermediate title input', () => {
    const original = draft()
    const changed = updateDocument(original, { title: ' ', content: textDoc('New') }, LATER)
    expect(changed.title).toBe(' ')
    expect(changed.updatedAt).toBe(LATER)
    expect(original.title).toBe('Field notes')
    expect(original.updatedAt).toBe(NOW)
    expect(updateDocument(original, { title: 'Field ' }, LATER).title).toBe('Field ')
    expect(updateDocument(original, { title: '' }, LATER).title).toBe('')
    expect(validateDocument(createDocument('', textDoc(), NOW)).title).toBe('')
  })

  it('rejects invalid versions, identities, active documents and duplicate IDs', () => {
    const workspace = createWorkspace([draft()])
    expect(() => validateWorkspace({ ...workspace, version: 2 })).toThrow(/version/)
    expect(() => validateWorkspace({ ...workspace, activeDocumentId: 'absent' })).toThrow(
      /does not exist/,
    )
    expect(() => validateWorkspace({ ...workspace, documents: [draft(), draft()] })).toThrow(
      /unique/,
    )
    expect(() => validateWorkspace({ ...workspace, documents: [] })).toThrow(/between/)
    expect(() => validateDocument({ ...draft(), id: '../path' })).toThrow(/ID/)
    expect(() => validateDocument({ ...draft(), createdAt: 'yesterday' })).toThrow(/ISO/)
    expect(() => validateDocument({ ...draft(), title: 'x'.repeat(201) })).toThrow(/Title/)
  })

  it('rejects unknown, dangerous and prototype properties', () => {
    for (const node of [
      { type: 'image', attrs: { src: 'https://example.com/pixel' } },
      { type: 'iframe', attrs: { src: 'https://example.com' } },
      { type: 'paragraph', attrs: { onmouseover: 'alert(1)' } },
      { type: 'paragraph', attrs: { style: 'color:red' } },
      JSON.parse('{"type":"paragraph","__proto__":{"polluted":true}}'),
    ])
      expect(() => validateContent({ type: 'doc', content: [node] })).toThrow(
        DocumentValidationError,
      )
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('enforces node grammar and rejects cycles', () => {
    for (const content of [
      { type: 'doc', content: [{ type: 'text', text: 'unwrapped' }] },
      { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'paragraph' }] }] },
      { type: 'doc', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] },
      { type: 'doc', content: [{ type: 'bulletList', content: [{ type: 'paragraph' }] }] },
      { type: 'doc', content: [{ type: 'heading', attrs: { level: 4 } }] },
      {
        type: 'doc',
        content: [
          { type: 'codeBlock', content: [{ type: 'text', text: 'x', marks: [{ type: 'bold' }] }] },
        ],
      },
      { type: 'doc', content: [] },
    ])
      expect(() => validateContent(content)).toThrow(DocumentValidationError)
    const cyclic: JSONContent = { type: 'blockquote', content: [] }
    cyclic.content!.push(cyclic)
    expect(() => validateContent({ type: 'doc', content: [cyclic] })).toThrow(/cycle/)
  })

  it('bounds depth, node count and text length', () => {
    let content: JSONContent = { type: 'paragraph' }
    for (let index = 0; index < 35; index++) content = { type: 'blockquote', content: [content] }
    expect(() => validateContent({ type: 'doc', content: [content] })).toThrow(/deeply nested/)
    expect(() =>
      validateContent({
        type: 'doc',
        content: Array.from({ length: 20_001 }, () => ({ type: 'paragraph' })),
      }),
    ).toThrow(/too many nodes/)
    expect(() => validateContent(textDoc('x'.repeat(500_001)))).toThrow(/Text/)
  })

  it('round-trips the actual StarterKit and Highlight schema including default attrs', () => {
    const schema = getSchema([StarterKit.configure({ heading: { levels: [1, 2, 3] } }), Highlight])
    const source: JSONContent = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Heading' }] },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Linked',
              marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
            },
            { type: 'text', text: ' marked', marks: [{ type: 'highlight' }] },
            { type: 'text', text: ' underlined', marks: [{ type: 'underline' }] },
            { type: 'hardBreak' },
          ],
        },
        { type: 'codeBlock', content: [{ type: 'text', text: 'const x = 1' }] },
        { type: 'orderedList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] },
        { type: 'horizontalRule' },
      ],
    }
    const emitted = schema.nodeFromJSON(source).toJSON()
    const normalized = validateContent(emitted)
    expect(() => schema.nodeFromJSON(normalized).check()).not.toThrow()
    expect(normalized.content![1].content![0].marks![0].attrs?.href).toBe('https://example.com/')
  })

  it.each([null, '1', 'a', 'A', 'i', 'I'])(
    'preserves StarterKit zero-based ordered lists and safe type %s',
    (type) => {
      const schema = getSchema([StarterKit])
      const emitted = schema.nodes.doc
        .create(
          null,
          schema.nodes.orderedList.create(
            { start: 0, type },
            schema.nodes.listItem.create(
              null,
              schema.nodes.paragraph.create(null, schema.text('Zero')),
            ),
          ),
        )
        .toJSON()
      const normalized = validateContent(emitted)
      expect(() => schema.nodeFromJSON(normalized).check()).not.toThrow()
      expect(normalized.content![0].attrs?.start).toBe(0)
      expect(normalized.content![0].attrs?.type ?? null).toBe(type)
      const doc = createDocument('Zero-based notes', normalized, NOW, 'zero-list')
      const storage = new MemoryStorage()
      const workspace = createWorkspace([doc])
      expect(saveWorkspace(storage, workspace)).toMatchObject({ ok: true })
      expect(loadWorkspace(storage)).toEqual({ status: 'ok', workspace })
      expect(importDocument(serializeDocument(doc), LATER).content).toEqual(normalized)
      expect(exportMarkdown(doc)).toContain('0. Zero')
      expect(exportHtml(doc)).toContain(type ? `<ol start="0" type="${type}">` : '<ol start="0">')
    },
  )

  it('rejects invalid list starts and unsafe marker attributes', () => {
    for (const attrs of [
      { start: -1 },
      { start: 0.5 },
      { start: 1_000_001 },
      { start: '0' },
      { start: 0, type: 'a" onclick="alert(1)' },
      { start: 0, type: {} },
    ])
      expect(() =>
        validateContent({
          type: 'doc',
          content: [
            {
              type: 'orderedList',
              attrs,
              content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }],
            },
          ],
        }),
      ).toThrow(DocumentValidationError)
  })
})

describe('safe links', () => {
  it.each([
    'https://example.com/path?q=hello',
    'http://localhost:3000',
    'mailto:writer@example.com',
  ])('allows %s', (href) => {
    expect(isSafeUrl(href)).toBe(true)
    expect(safeLink(href)).toMatch(/^(https?:|mailto:)/)
  })

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,hello',
    'file:///etc/passwd',
    '//example.com',
    '/relative',
    'https:example.com',
    'https:///example.com',
    'https://user:pass@example.com',
    'https://example.com/\nattack',
    'java\tscript:alert(1)',
    'https://example.com/%0aevil',
    'https://example.com/"bad',
    'https:\\example.com',
    'mailto:',
    ' https://example.com',
  ])('rejects %s', (href) => {
    expect(isSafeUrl(href)).toBe(false)
    expect(() => safeLink(href)).toThrow(DocumentValidationError)
  })

  it('rejects unsafe links and arbitrary styling in imported marks', () => {
    for (const mark of [
      { type: 'link', attrs: { href: 'javascript:alert(1)' } },
      { type: 'link', attrs: { href: 'https://example.com', onclick: 'alert(1)' } },
      { type: 'highlight', attrs: { color: 'url(https://example.com)' } },
      { type: 'textStyle', attrs: { style: 'color:red' } },
    ]) {
      const content = textDoc()
      content.content![0].content![0].marks = [mark]
      expect(() => validateContent(content)).toThrow()
    }
  })
})

describe('versioned local storage and recovery', () => {
  it('loads an empty store and safely round-trips a workspace', () => {
    const storage = new MemoryStorage()
    expect(loadWorkspace(storage)).toEqual({ status: 'empty' })
    const workspace = createWorkspace([draft()])
    expect(saveWorkspace(storage, workspace)).toMatchObject({ ok: true })
    expect(loadWorkspace(storage)).toEqual({ status: 'ok', workspace })
  })

  it.each(['{broken', '', '{"version":2,"documents":[]}'])(
    'preserves corrupt or incompatible original bytes %s',
    (raw) => {
      const storage = new MemoryStorage()
      storage.values.set(STORAGE_KEY, raw)
      expect(loadWorkspace(storage)).toMatchObject({ status: 'corrupt', raw })
      expect(saveWorkspace(storage, createWorkspace([draft()]))).toMatchObject({ ok: false })
      expect(storage.values.get(STORAGE_KEY)).toBe(raw)
      expect(storage.writes).toHaveLength(0)
    },
  )

  it('handles storage read failures without pretending to save', () => {
    const storage = {
      getItem() {
        throw new Error('Access denied')
      },
      setItem() {
        throw new Error('must not write')
      },
    }
    expect(loadWorkspace(storage)).toMatchObject({ status: 'unavailable' })
    expect(saveWorkspace(storage, createWorkspace([draft()]))).toMatchObject({
      ok: false,
      error: expect.stringContaining('unavailable'),
    })
  })

  it('reports quota failures and leaves the old workspace intact', () => {
    const storage = new MemoryStorage()
    const original = createWorkspace([draft()])
    saveWorkspace(storage, original)
    storage.setItem = () => {
      throw new Error('QuotaExceededError')
    }
    const changed = createWorkspace([updateDocument(draft(), { title: 'Changed' }, LATER)])
    expect(saveWorkspace(storage, changed)).toMatchObject({
      ok: false,
      error: expect.stringContaining('QuotaExceededError'),
    })
    expect(loadWorkspace(storage)).toEqual({ status: 'ok', workspace: original })
  })

  it('backs up corrupt bytes before explicit recovery and refuses to replace an older backup', () => {
    const storage = new MemoryStorage()
    storage.values.set(STORAGE_KEY, 'corrupt original')
    const workspace = createWorkspace([draft()])
    expect(recoverWorkspace(storage, workspace)).toMatchObject({ ok: true })
    expect(storage.writes).toEqual([RECOVERY_KEY, STORAGE_KEY])
    expect(storage.values.get(RECOVERY_KEY)).toBe('corrupt original')
    expect(loadWorkspace(storage)).toEqual({ status: 'ok', workspace })
    storage.values.set(STORAGE_KEY, 'another corrupt original')
    expect(recoverWorkspace(storage, workspace)).toMatchObject({ ok: false })
    expect(storage.values.get(STORAGE_KEY)).toBe('another corrupt original')
    expect(storage.values.get(RECOVERY_KEY)).toBe('corrupt original')
  })

  it('does not overwrite corrupt data if its recovery backup fails', () => {
    const storage = new MemoryStorage()
    storage.values.set(STORAGE_KEY, 'recover me')
    storage.setItem = () => {
      throw new Error('Quota exceeded')
    }
    expect(recoverWorkspace(storage, createWorkspace([draft()]))).toMatchObject({ ok: false })
    expect(storage.values.get(STORAGE_KEY)).toBe('recover me')
  })

  it('rejects oversized JSON before parsing', () => {
    const storage = new MemoryStorage()
    storage.values.set(STORAGE_KEY, 'x'.repeat(MAX_JSON_BYTES + 1))
    expect(loadWorkspace(storage)).toMatchObject({
      status: 'corrupt',
      error: expect.stringContaining('4 MB'),
    })
    expect(() => importDocument('🪴'.repeat(MAX_JSON_BYTES / 3))).toThrow(/4 MB/)
  })
})

describe('snapshots and import', () => {
  it('keeps snapshots independent, newest first and bounded', () => {
    let doc = draft()
    for (let index = 0; index < MAX_SNAPSHOTS + 5; index++)
      doc = snapshotDocument(doc, `Version ${index}`, NOW)
    expect(doc.snapshots).toHaveLength(MAX_SNAPSHOTS)
    expect(doc.snapshots[0].label).toBe(`Version ${MAX_SNAPSHOTS + 4}`)
    doc.content.content![0].content![0].text = 'Changed in place'
    expect(doc.snapshots[0].content).toEqual(textDoc())
  })

  it('takes a recoverable current snapshot before restoring content and title', () => {
    const saved = snapshotDocument(draft(), 'First version', NOW)
    const edited = updateDocument(
      saved,
      { title: 'New title', content: textDoc('Current text') },
      LATER,
    )
    const restored = restoreSnapshot(edited, saved.snapshots[0].id, LATER)
    expect(restored.title).toBe('Field notes')
    expect(restored.content).toEqual(textDoc())
    expect(restored.snapshots[0]).toMatchObject({
      label: 'Before restore',
      title: 'New title',
      content: textDoc('Current text'),
    })
    const undone = restoreSnapshot(restored, restored.snapshots[0].id, LATER)
    expect(undone.content).toEqual(edited.content)
    expect(undone.title).toBe(edited.title)
    expect(() => restoreSnapshot(restored, 'missing', LATER)).toThrow(/no longer exists/)
  })

  it('imports only a validated export and always creates a new identity', () => {
    const original = snapshotDocument(draft(), 'Saved', NOW)
    const imported = importDocument(serializeDocument(original), LATER, 'imported')
    expect(imported.id).toBe('imported')
    expect(imported.id).not.toBe(original.id)
    expect(imported.createdAt).toBe(LATER)
    expect(imported.updatedAt).toBe(LATER)
    expect(imported.title).toBe(original.title)
    expect(imported.content).toEqual(original.content)
    expect(imported.snapshots[0].id).not.toBe(original.snapshots[0].id)
    expect(() => importDocument(JSON.stringify(original))).toThrow()
    expect(() => importDocument('{"format":"foliohush","version":2}')).toThrow(/version 1/)
  })

  it('rejects invalid or malicious snapshot content as well as current content', () => {
    const doc = snapshotDocument(draft(), 'Saved', NOW)
    doc.snapshots[0].content = {
      type: 'doc',
      content: [{ type: 'image', attrs: { src: 'https://tracking.test' } }],
    }
    expect(() =>
      importDocument(JSON.stringify({ format: 'foliohush', version: 1, document: doc })),
    ).toThrow(/Unsupported node/)
  })
})

describe('safe Markdown and HTML exports', () => {
  it('uses readable fallback titles without losing an empty title in JSON backups', () => {
    const doc = createDocument(' ', textDoc(), NOW, 'untitled')
    expect(exportHtml(doc)).toContain('<h1>Untitled document</h1>')
    expect(exportMarkdown(doc)).toMatch(/^# Untitled document\n/)
    expect(importDocument(serializeDocument(doc), NOW).title).toBe(' ')
    expect(snapshotDocument(doc, 'Blank title', NOW).snapshots[0].title).toBe(' ')
  })

  it('escapes HTML in titles, ordinary text, code and link attributes', () => {
    const doc = createDocument(
      '<script>alert("title")</script>',
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: '<img src=x onerror="alert(1)"> &',
                marks: [{ type: 'link', attrs: { href: 'https://example.com/?a=1&b=2' } }],
              },
            ],
          },
          { type: 'codeBlock', content: [{ type: 'text', text: '</code><script>bad()</script>' }] },
        ],
      },
      NOW,
      'escape',
    )
    const html = exportHtml(doc)
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
    expect(html).toContain('href="https://example.com/?a=1&amp;b=2"')
    expect(html).toContain('&lt;/code&gt;&lt;script&gt;')
    expect(html).toContain('<!doctype html>')
  })

  it('preserves block structure, marks, ordered starts, nested lists and safe links', () => {
    const content: JSONContent = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Ideas' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Strong', marks: [{ type: 'bold' }] },
            {
              type: 'text',
              text: ' link',
              marks: [{ type: 'link', attrs: { href: 'https://example.com/a(b)' } }],
            },
            { type: 'hardBreak' },
            { type: 'text', text: 'Next' },
          ],
        },
        {
          type: 'blockquote',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Thought' }] }],
        },
        {
          type: 'orderedList',
          attrs: { start: 3 },
          content: [
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Third' }] },
                {
                  type: 'bulletList',
                  content: [
                    {
                      type: 'listItem',
                      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nested' }] }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        { type: 'horizontalRule' },
      ],
    }
    const doc = createDocument('Notes', content, NOW, 'blocks')
    const markdown = exportMarkdown(doc)
    expect(markdown).toContain('## Ideas')
    expect(markdown).toContain('**Strong**')
    expect(markdown).toContain('[ link](<https://example.com/a%28b%29>)')
    expect(markdown).toContain('> Thought')
    expect(markdown).toContain('3. Third')
    expect(markdown).toContain('   - Nested')
    expect(exportHtml(doc)).toContain('<ol start="3">')
  })

  it('prevents text from becoming raw HTML or Markdown syntax', () => {
    const markdown = exportMarkdown(
      createDocument(
        'Title',
        textDoc('<script>alert(1)</script> [x](javascript:bad) **bold**'),
        NOW,
        'literal',
      ),
    )
    expect(markdown).toContain('\\<script\\>')
    expect(markdown).toContain('\\[x\\]')
    expect(markdown).toContain('\\*\\*bold\\*\\*')
  })

  it('uses longer fences when inline or block code contains backticks', () => {
    const doc = createDocument(
      'Code',
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: '`value`', marks: [{ type: 'code' }] }],
          },
          {
            type: 'codeBlock',
            attrs: { language: 'js' },
            content: [{ type: 'text', text: '```\n<script>alert(1)</script>' }],
          },
        ],
      },
      NOW,
      'code',
    )
    const markdown = exportMarkdown(doc)
    expect(markdown).toContain('`` `value` ``')
    expect(markdown).toContain('````js\n```\n<script>alert(1)</script>\n````')
  })
})
