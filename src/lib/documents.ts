import type { JSONContent } from '@tiptap/core'

/** The format and storage key are deliberately versioned. Unknown versions are never replaced. */
export const STORAGE_KEY = 'foliohush.workspace.v1'
export const RECOVERY_KEY = `${STORAGE_KEY}.recovery`
export const MAX_JSON_BYTES = 4 * 1024 * 1024
export const MAX_SNAPSHOTS = 12
export const EMPTY_CONTENT: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] }

export interface Snapshot {
  id: string
  title: string
  content: JSONContent
  createdAt: string
  label: string
}

export interface WritingDocument {
  id: string
  title: string
  content: JSONContent
  createdAt: string
  updatedAt: string
  snapshots: Snapshot[]
}

export interface Workspace {
  version: 1
  activeDocumentId: string
  documents: WritingDocument[]
}

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export type LoadResult =
  | { status: 'ok'; workspace: Workspace }
  | { status: 'empty' }
  | { status: 'corrupt'; raw: string; error: string }
  | { status: 'unavailable'; error: string }

export type SaveResult = { ok: true; raw: string } | { ok: false; error: string }

export class DocumentValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DocumentValidationError'
  }
}

function fail(message: string): never {
  throw new DocumentValidationError(message)
}
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Unknown storage error.'
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const nowISO = () => new Date().toISOString()
let fallbackId = 0
const newId = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  `doc-${Date.now()}-${++fallbackId}-${Math.random().toString(36).slice(2, 10)}`

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail(`${name} must be an object.`)
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) fail(`${name} must be a plain object.`)
  return value as Record<string, unknown>
}

function keys(value: Record<string, unknown>, allowed: string[], name: string) {
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) fail(`Unsupported ${name} property: ${key}.`)
}

function string(value: unknown, name: string, max: number, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())) {
    fail(`${name} must be ${allowEmpty ? 'a' : 'a non-empty'} string of at most ${max} characters.`)
  }
  return value as string
}

function identifier(value: unknown): string {
  const result = string(value, 'ID', 100)
  if (!/^[a-zA-Z0-9_-]+$/.test(result)) fail('Invalid document or snapshot ID.')
  return result
}

function date(value: unknown): string {
  const result = string(value, 'Date', 40)
  const parsed = new Date(result)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== result)
    fail('Dates must use ISO 8601 UTC format.')
  return result
}

/** Return a canonical absolute URL. Relative, executable and encoded-control URLs are rejected. */
export function safeLink(value: unknown): string {
  const href = string(value, 'Link', 2048)
  if (/[\s\u0000-\u001f\u007f<>"\\]/.test(href) || /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(href)) {
    fail('Links cannot contain whitespace or control characters.')
  }
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return fail('Links must be absolute http, https, or mailto URLs.')
  }
  if (!['http:', 'https:', 'mailto:'].includes(url.protocol))
    fail('Only http, https, and mailto links are allowed.')
  if (url.protocol !== 'mailto:' && !/^https?:\/\/[^/]/i.test(href))
    fail('Web links must start with http:// or https:// and a host.')
  if (
    (url.protocol === 'http:' || url.protocol === 'https:') &&
    (!url.hostname || url.username || url.password)
  ) {
    fail('Web links must have a host and cannot contain credentials.')
  }
  if (url.protocol === 'mailto:' && !url.pathname) fail('Mail links need a recipient.')
  return url.href
}

export function isSafeUrl(value: string): boolean {
  try {
    safeLink(value)
    return true
  } catch {
    return false
  }
}

const blockTypes = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'bulletList',
  'orderedList',
  'codeBlock',
  'horizontalRule',
])
const inlineTypes = new Set(['text', 'hardBreak'])
const markTypes = new Set(['bold', 'italic', 'strike', 'underline', 'code', 'highlight', 'link'])

/** Validate and reconstruct rather than trusting unknown node/attribute objects. */
export function validateContent(value: unknown): JSONContent {
  const seen = new WeakSet<object>()
  let nodeCount = 0
  let characterCount = 0

  function visit(input: unknown, depth: number): JSONContent {
    if (depth > 32 || ++nodeCount > 20_000)
      fail('Document is too deeply nested or has too many nodes.')
    const node = record(input, 'Node')
    if (seen.has(node)) fail('Document contains a cycle or a repeated node object.')
    seen.add(node)
    keys(node, ['type', 'attrs', 'content', 'marks', 'text'], 'node')
    const type = string(node.type, 'Node type', 30)
    if (!blockTypes.has(type) && !inlineTypes.has(type) && type !== 'doc' && type !== 'listItem')
      fail(`Unsupported node: ${type}.`)
    const result: JSONContent = { type }
    const attrs = node.attrs === undefined ? {} : record(node.attrs, 'Attributes')
    if (type === 'heading') {
      keys(attrs, ['level'], 'heading attribute')
      if (![1, 2, 3].includes(attrs.level as number)) fail('Heading level must be 1, 2, or 3.')
      result.attrs = { level: attrs.level }
    } else if (type === 'orderedList') {
      keys(attrs, ['start', 'type'], 'ordered-list attribute')
      const start = attrs.start ?? 1
      // StarterKit's numeric input rule accepts "0. ", and pasted lists can carry safe HTML markers.
      if (!Number.isInteger(start) || (start as number) < 0 || (start as number) > 1_000_000)
        fail('Invalid ordered-list start.')
      const listType = attrs.type ?? null
      if (listType !== null && !['1', 'a', 'A', 'i', 'I'].includes(listType as string))
        fail('Unsupported ordered-list type.')
      result.attrs = listType === null ? { start } : { start, type: listType }
    } else if (type === 'codeBlock') {
      keys(attrs, ['language'], 'code-block attribute')
      const language = attrs.language ?? null
      if (
        language !== null &&
        (typeof language !== 'string' || !/^[a-zA-Z0-9_+.-]{1,40}$/.test(language))
      )
        fail('Invalid code-block language.')
      result.attrs = { language }
    } else {
      keys(attrs, [], 'attribute')
    }

    if (type === 'text') {
      const text = string(node.text, 'Text', 500_000, true)
      if (!text.length) fail('Text nodes cannot be empty.')
      characterCount += text.length
      if (characterCount > 1_000_000) fail('Document contains too much text.')
      if (node.content !== undefined) fail('Text nodes cannot contain child nodes.')
      result.text = text
    } else if (node.text !== undefined) fail('Only text nodes may have text.')

    if (node.marks !== undefined) {
      if (!inlineTypes.has(type) || !Array.isArray(node.marks) || node.marks.length > 7)
        fail('Invalid node marks.')
      const used = new Set<string>()
      result.marks = node.marks.map((inputMark) => {
        const mark = record(inputMark, 'Mark')
        keys(mark, ['type', 'attrs'], 'mark')
        const markType = string(mark.type, 'Mark type', 30)
        if (!markTypes.has(markType) || used.has(markType))
          fail(`Unsupported or duplicate mark: ${markType}.`)
        used.add(markType)
        const markAttrs = mark.attrs === undefined ? {} : record(mark.attrs, 'Mark attributes')
        if (markType === 'link') {
          keys(markAttrs, ['href', 'target', 'rel', 'class', 'title'], 'link attribute')
          if (
            markAttrs.target !== undefined &&
            markAttrs.target !== null &&
            !['_blank', '_self'].includes(markAttrs.target as string)
          )
            fail('Unsupported link target.')
          if (
            markAttrs.rel !== undefined &&
            markAttrs.rel !== null &&
            typeof markAttrs.rel !== 'string'
          )
            fail('Invalid link relation.')
          if (markAttrs.class !== undefined && markAttrs.class !== null)
            fail('Custom link classes are unsupported.')
          const title =
            markAttrs.title === undefined || markAttrs.title === null
              ? null
              : string(markAttrs.title, 'Link title', 200, true)
          return {
            type: markType,
            attrs: {
              href: safeLink(markAttrs.href),
              target: '_blank',
              rel: 'noopener noreferrer nofollow',
              class: null,
              title,
            },
          }
        }
        if (markType === 'highlight') {
          keys(markAttrs, ['color'], 'highlight attribute')
          if (markAttrs.color !== undefined && markAttrs.color !== null)
            fail('Custom highlight colors are unsupported.')
        } else keys(markAttrs, [], 'mark attribute')
        return { type: markType }
      })
      if (used.has('code') && used.size > 1) fail('Inline code cannot combine with other marks.')
    }

    if (type !== 'text') {
      if (node.content !== undefined && !Array.isArray(node.content))
        fail('Node content must be an array.')
      const children = (node.content as unknown[] | undefined) ?? []
      if (['hardBreak', 'horizontalRule'].includes(type) && children.length)
        fail(`${type} cannot contain child nodes.`)
      if (
        ['doc', 'blockquote', 'listItem', 'bulletList', 'orderedList'].includes(type) &&
        !children.length
      )
        fail(`${type} cannot be empty.`)
      const validated = children.map((child) => visit(child, depth + 1))
      for (const child of validated) {
        const childType = child.type!
        if (type === 'paragraph' || type === 'heading') {
          if (!inlineTypes.has(childType)) fail(`${type} may only contain inline content.`)
        } else if (type === 'codeBlock') {
          if (childType !== 'text' || child.marks?.length)
            fail('Code blocks may only contain unformatted text.')
        } else if (type === 'bulletList' || type === 'orderedList') {
          if (childType !== 'listItem') fail('Lists may only contain list items.')
        } else if (type === 'doc' || type === 'blockquote' || type === 'listItem') {
          if (!blockTypes.has(childType)) fail(`${type} may only contain block content.`)
        }
      }
      if (type === 'listItem' && validated[0]?.type !== 'paragraph')
        fail('List items must begin with a paragraph.')
      if (validated.length) result.content = validated
    }
    return result
  }

  const content = visit(value, 0)
  if (content.type !== 'doc') fail('Content must have a document root.')
  return content
}

function validateSnapshot(value: unknown): Snapshot {
  const item = record(value, 'Snapshot')
  keys(item, ['id', 'title', 'content', 'createdAt', 'label'], 'snapshot')
  return {
    id: identifier(item.id),
    title: string(item.title, 'Title', 200, true),
    content: validateContent(item.content),
    createdAt: date(item.createdAt),
    label: string(item.label, 'Snapshot label', 100),
  }
}

export function validateDocument(value: unknown): WritingDocument {
  const doc = record(value, 'Document')
  keys(doc, ['id', 'title', 'content', 'createdAt', 'updatedAt', 'snapshots'], 'document')
  if (!Array.isArray(doc.snapshots) || doc.snapshots.length > MAX_SNAPSHOTS)
    fail(`Documents may have at most ${MAX_SNAPSHOTS} snapshots.`)
  const snapshots = doc.snapshots.map(validateSnapshot)
  if (new Set(snapshots.map((snapshot) => snapshot.id)).size !== snapshots.length)
    fail('Snapshot IDs must be unique.')
  return {
    id: identifier(doc.id),
    title: string(doc.title, 'Title', 200, true),
    content: validateContent(doc.content),
    createdAt: date(doc.createdAt),
    updatedAt: date(doc.updatedAt),
    snapshots,
  }
}

export function validateWorkspace(value: unknown): Workspace {
  const workspace = record(value, 'Workspace')
  keys(workspace, ['version', 'activeDocumentId', 'documents'], 'workspace')
  if (workspace.version !== 1)
    fail('Unsupported workspace version. Your stored data has been preserved.')
  if (
    !Array.isArray(workspace.documents) ||
    !workspace.documents.length ||
    workspace.documents.length > 50
  )
    fail('A workspace must have between 1 and 50 documents.')
  const documents = workspace.documents.map(validateDocument)
  const ids = new Set(documents.map((doc) => doc.id))
  if (ids.size !== documents.length) fail('Document IDs must be unique.')
  const activeDocumentId = identifier(workspace.activeDocumentId)
  if (!ids.has(activeDocumentId)) fail('Active document does not exist.')
  return { version: 1, activeDocumentId, documents }
}

function boundedJson(value: unknown, pretty = false): string {
  const json = JSON.stringify(value, null, pretty ? 2 : undefined)
  if (new TextEncoder().encode(json).length > MAX_JSON_BYTES)
    fail('The file or workspace exceeds the 4 MB safety limit.')
  return json
}

function parseJson(raw: string): unknown {
  if (raw.length > MAX_JSON_BYTES || new TextEncoder().encode(raw).length > MAX_JSON_BYTES)
    fail('The file or workspace exceeds the 4 MB safety limit.')
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return fail('This is not valid JSON. The original data has been preserved.')
  }
}

export function createDocument(
  title = 'Untitled document',
  content: JSONContent = EMPTY_CONTENT,
  now = nowISO(),
  id = newId(),
): WritingDocument {
  return validateDocument({ id, title, content, createdAt: now, updatedAt: now, snapshots: [] })
}

export function createWorkspace(documents: WritingDocument[] = [createDocument()]): Workspace {
  return validateWorkspace({ version: 1, activeDocumentId: documents[0]?.id, documents })
}

export function updateDocument(
  doc: WritingDocument,
  patch: { title?: string; content?: JSONContent },
  now = nowISO(),
): WritingDocument {
  return validateDocument({ ...doc, ...patch, title: patch.title ?? doc.title, updatedAt: now })
}

export function snapshotDocument(
  doc: WritingDocument,
  label = 'Saved snapshot',
  now = nowISO(),
): WritingDocument {
  const valid = validateDocument(doc)
  const snapshot: Snapshot = {
    id: newId(),
    title: valid.title,
    content: clone(valid.content),
    createdAt: date(now),
    label: string(label, 'Snapshot label', 100),
  }
  return { ...valid, snapshots: [snapshot, ...valid.snapshots].slice(0, MAX_SNAPSHOTS) }
}

/** Restoring always retains the current draft first, so the restore can itself be undone. */
export function restoreSnapshot(
  doc: WritingDocument,
  snapshotId: string,
  now = nowISO(),
): WritingDocument {
  const valid = validateDocument(doc)
  const snapshot = valid.snapshots.find((item) => item.id === snapshotId)
  if (!snapshot) fail('This snapshot no longer exists.')
  const recoverable = snapshotDocument(valid, 'Before restore', now)
  return {
    ...recoverable,
    title: snapshot!.title,
    content: clone(snapshot!.content),
    updatedAt: date(now),
  }
}

export function loadWorkspace(storage: StorageLike): LoadResult {
  let raw: string | null
  try {
    raw = storage.getItem(STORAGE_KEY)
  } catch (error) {
    return { status: 'unavailable', error: `Local storage is unavailable: ${errorMessage(error)}` }
  }
  if (raw === null) return { status: 'empty' }
  try {
    return { status: 'ok', workspace: validateWorkspace(parseJson(raw)) }
  } catch (error) {
    return { status: 'corrupt', raw, error: errorMessage(error) }
  }
}

export function saveWorkspace(storage: StorageLike, workspace: Workspace): SaveResult {
  try {
    const json = boundedJson(validateWorkspace(workspace))
    const existing = loadWorkspace(storage)
    if (existing.status === 'corrupt')
      return {
        ok: false,
        error:
          'Stored data is damaged or uses an unsupported format. It has not been overwritten. Export your current work before recovery.',
      }
    if (existing.status === 'unavailable') return { ok: false, error: existing.error }
    storage.setItem(STORAGE_KEY, json)
    return { ok: true, raw: json }
  } catch (error) {
    return {
      ok: false,
      error: `Could not save locally: ${errorMessage(error)} Export your work to keep a copy.`,
    }
  }
}

/** Explicit recovery only: never replace existing data before its original bytes are backed up. */
export function recoverWorkspace(storage: StorageLike, workspace: Workspace): SaveResult {
  try {
    const json = boundedJson(validateWorkspace(workspace))
    const raw = storage.getItem(STORAGE_KEY)
    if (raw !== null) {
      // Preserve an earlier recovery too; an existing backup must not disappear during a second attempt.
      const previous = storage.getItem(RECOVERY_KEY)
      if (previous !== null && previous !== raw)
        return {
          ok: false,
          error: 'A previous recovery backup exists. Export it before attempting another recovery.',
        }
      storage.setItem(RECOVERY_KEY, raw)
    }
    storage.setItem(STORAGE_KEY, json)
    return { ok: true, raw: json }
  } catch (error) {
    return {
      ok: false,
      error: `Recovery could not finish: ${errorMessage(error)} Your existing data has not been deliberately removed.`,
    }
  }
}

export function serializeDocument(doc: WritingDocument): string {
  // Compact JSON keeps a saved near-limit document exportable within the same import size limit.
  return boundedJson({ format: 'foliohush', version: 1, document: validateDocument(doc) })
}

/** Imported identity and timestamps are never used to replace or target an existing document. */
export function importDocument(raw: string, now = nowISO(), id = newId()): WritingDocument {
  const envelope = record(parseJson(raw), 'Import')
  keys(envelope, ['format', 'version', 'document'], 'import')
  if (envelope.format !== 'foliohush' || envelope.version !== 1)
    fail('Choose a version 1 Foliohush JSON export.')
  const imported = validateDocument(envelope.document)
  const fresh = createDocument(imported.title, imported.content, now, id)
  return {
    ...fresh,
    snapshots: imported.snapshots.map((snapshot) => ({ ...snapshot, id: newId() })),
  }
}

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  )
const escapeMarkdown = (value: string) => value.replace(/[\\`*_{}\[\]<>!|#~+.-]/g, '\\$&')

function htmlNode(node: JSONContent): string {
  let body =
    node.type === 'text' ? escapeHtml(node.text ?? '') : (node.content ?? []).map(htmlNode).join('')
  for (const mark of node.marks ?? []) {
    const tag = (
      {
        bold: 'strong',
        italic: 'em',
        strike: 's',
        underline: 'u',
        code: 'code',
        highlight: 'mark',
      } as Record<string, string>
    )[mark.type]
    if (tag) body = `<${tag}>${body}</${tag}>`
    if (mark.type === 'link')
      body = `<a href="${escapeHtml(safeLink(mark.attrs?.href))}" rel="noopener noreferrer">${body}</a>`
  }
  switch (node.type) {
    case 'doc':
    case 'text':
      return body
    case 'paragraph':
      return `<p>${body}</p>\n`
    case 'heading':
      return `<h${node.attrs?.level}>${body}</h${node.attrs?.level}>\n`
    case 'blockquote':
      return `<blockquote>${body}</blockquote>\n`
    case 'bulletList':
      return `<ul>${body}</ul>\n`
    case 'orderedList':
      return `<ol start="${node.attrs?.start ?? 1}"${node.attrs?.type ? ` type="${node.attrs.type}"` : ''}>${body}</ol>\n`
    case 'listItem':
      return `<li>${body}</li>\n`
    case 'codeBlock':
      return `<pre><code>${body}</code></pre>\n`
    case 'hardBreak':
      return '<br>\n'
    case 'horizontalRule':
      return '<hr>\n'
    default:
      return ''
  }
}

export function exportHtml(doc: WritingDocument): string {
  const valid = validateDocument(doc)
  const title = valid.title.trim() || 'Untitled document'
  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${escapeHtml(title)}</title>\n</head>\n<body>\n<article>\n<h1>${escapeHtml(title)}</h1>\n${htmlNode(valid.content)}</article>\n</body>\n</html>\n`
}

function markdownNode(node: JSONContent): string {
  let body =
    node.type === 'text'
      ? escapeMarkdown(node.text ?? '')
      : (node.content ?? []).map(markdownNode).join('')
  for (const mark of node.marks ?? []) {
    switch (mark.type) {
      case 'bold':
        body = `**${body}**`
        break
      case 'italic':
        body = `*${body}*`
        break
      case 'strike':
        body = `~~${body}~~`
        break
      // Markdown has no portable underline/highlight syntax. Preserve their text.
      case 'code': {
        const raw = (node.text ?? '').replace(/\r?\n/g, ' ')
        const fence = '`'.repeat(
          Math.max(0, ...(raw.match(/`+/g) ?? []).map((run) => run.length)) + 1,
        )
        const padding =
          raw.startsWith('`') ||
          raw.endsWith('`') ||
          (raw.startsWith(' ') && raw.endsWith(' ') && !!raw.trim())
            ? ' '
            : ''
        body = `${fence}${padding}${raw}${padding}${fence}`
        break
      }
      case 'link':
        body = `[${body}](<${safeLink(mark.attrs?.href).replace(/\(/g, '%28').replace(/\)/g, '%29')}>)`
        break
    }
  }
  switch (node.type) {
    case 'doc':
      return body
    case 'text':
      return body
    case 'paragraph':
      return `${body}\n\n`
    case 'heading':
      return `${'#'.repeat(node.attrs?.level ?? 1)} ${body}\n\n`
    case 'blockquote':
      return `${body
        .trimEnd()
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n')}\n\n`
    case 'bulletList':
    case 'orderedList': {
      return `${(node.content ?? [])
        .map((item, index) => {
          const prefix =
            node.type === 'orderedList' ? `${(node.attrs?.start ?? 1) + index}. ` : '- '
          const lines = markdownNode(item).trimEnd().split('\n')
          return `${prefix}${lines[0]}${lines
            .slice(1)
            .map((line) => `\n${' '.repeat(prefix.length)}${line}`)
            .join('')}`
        })
        .join('\n')}\n\n`
    }
    case 'listItem':
      return body
    case 'codeBlock': {
      const raw = (node.content ?? []).map((child) => child.text ?? '').join('')
      const fence = '`'.repeat(
        Math.max(2, ...(raw.match(/`+/g) ?? []).map((run) => run.length)) + 1,
      )
      return `${fence}${node.attrs?.language ?? ''}\n${raw}\n${fence}\n\n`
    }
    case 'hardBreak':
      return '  \n'
    case 'horizontalRule':
      return '---\n\n'
    default:
      return ''
  }
}

export function exportMarkdown(doc: WritingDocument): string {
  const valid = validateDocument(doc)
  return `# ${escapeMarkdown(valid.title.trim() || 'Untitled document')}\n\n${markdownNode(valid.content).trimEnd()}\n`
}
