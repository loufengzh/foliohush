import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { Editor, JSONContent } from '@tiptap/react'
import {
  ArrowDownToLine,
  Bold,
  Italic,
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  Clock3,
  FileText,
  Focus,
  History,
  Import,
  Leaf,
  List,
  Menu,
  MoreHorizontal,
  Plus,
  Palette,
  Redo2,
  Search,
  Sparkles,
  Undo2,
  X,
} from 'lucide-react'
import { FolioEditor } from './editor/FolioEditor'
import {
  createDocument,
  createWorkspace,
  exportHtml,
  exportMarkdown,
  importDocument,
  loadWorkspace,
  restoreSnapshot,
  saveWorkspace,
  serializeDocument,
  snapshotDocument,
  STORAGE_KEY,
  MAX_JSON_BYTES,
  updateDocument,
  type Workspace,
  type WritingDocument,
} from './lib/documents'
import { welcomeContent } from './lib/sample'
import { useTheme } from './lib/themes'
import { ThemePicker } from './ThemePicker'
import { AgentPanel } from './AgentPanel'

function textContent(content: JSONContent): string {
  return (
    content.text ||
    (content.content || []).map(textContent).join(content.type === 'paragraph' ? '' : ' ')
  )
}
function download(text: string, name: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function safeName(title: string) {
  return (title.trim() || 'Untitled').replace(/[^\p{L}\p{N} -]/gu, '').slice(0, 70) || 'Document'
}
function dateLabel(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
function Dialog({
  title,
  children,
  onClose,
}: {
  title: string
  children: ReactNode
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement
    ref.current?.querySelector<HTMLElement>('button,input,select')?.focus()
    return () => previous?.focus()
  }, [])
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={ref}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
          if (e.key === 'Tab') {
            const items = [
              ...ref.current!.querySelectorAll<HTMLElement>(
                'button:not([disabled]),input,select,a[href]',
              ),
            ]
            const first = items[0]
            const last = items[items.length - 1]
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault()
              last?.focus()
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault()
              first?.focus()
            }
          }
        }}
      >
        <div className="dialog-heading">
          <h2>{title}</h2>
          <button className="icon-button" aria-label="Close dialog" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
function initialState(): { workspace: Workspace; error: string; raw: string | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const loaded = loadWorkspace({ getItem: () => raw, setItem: () => {} })
    if (loaded.status === 'ok' && loaded.workspace)
      return { workspace: loaded.workspace, error: '', raw }
    return {
      workspace: createWorkspace([createDocument('The art of a quiet beginning', welcomeContent)]),
      raw,
      error:
        loaded.status === 'empty'
          ? ''
          : 'Browser storage could not be read safely. Your existing data is untouched. Export your work before closing this tab.',
    }
  } catch {
    return {
      workspace: createWorkspace([createDocument('The art of a quiet beginning', welcomeContent)]),
      raw: null,
      error: 'Browser storage is unavailable. Export your work before closing this tab.',
    }
  }
}
export default function App() {
  const theme = useTheme()
  const [startup] = useState(initialState)
  const [workspace, setWorkspace] = useState(startup.workspace)
  const [error, setError] = useState(startup.error)
  const [saved, setSaved] = useState(!startup.error)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [compact, setCompact] = useState(
    () => window.matchMedia?.('(max-width: 760px)').matches ?? false,
  )
  useEffect(() => {
    const media = window.matchMedia?.('(max-width: 760px)')
    if (!media) return
    const update = () => setCompact(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  const [focus, setFocus] = useState(false)
  const [agentOpen, setAgentOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [modal, setModal] = useState<'export' | 'history' | 'help' | 'theme' | null>(null)
  const [snapshotName, setSnapshotName] = useState('')
  const [notice, setNotice] = useState('')
  const [editor, setEditor] = useState<Editor | null>(null)
  const [, setRevision] = useState(0)
  const [editorEpoch, setEditorEpoch] = useState(0)
  const [format, setFormat] = useState('paragraph')
  const importRef = useRef<HTMLInputElement>(null)
  const navigationGeneration = useRef(0)
  const saveBlocked = useRef(!!startup.error)
  const expectedRaw = useRef(startup.raw)
  const current =
    workspace.documents.find((doc) => doc.id === workspace.activeDocumentId) ||
    workspace.documents[0]
  const titleRef = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const resize = () => {
      if (titleRef.current) {
        titleRef.current.style.height = 'auto'
        titleRef.current.style.height = `${titleRef.current.scrollHeight}px`
      }
    }
    resize()
    window.addEventListener('resize', resize)
    let cancelled = false
    void document.fonts?.ready.then(() => {
      if (!cancelled) resize()
    })
    return () => {
      cancelled = true
      window.removeEventListener('resize', resize)
    }
  }, [current.id, current.title, theme.preference, agentOpen, focus])
  const words = textContent(current.content).trim().split(/\s+/).filter(Boolean).length
  const headings: JSONContent[] = []
  const collectHeadings = (node: JSONContent) => {
    if (node.type === 'heading') headings.push(node)
    node.content?.forEach(collectHeadings)
  }
  collectHeadings(current.content)
  const currentRef = useRef(current)
  currentRef.current = current
  useEffect(() => {
    const preventLoss = (event: BeforeUnloadEvent) => {
      if (!saved) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', preventLoss)
    return () => window.removeEventListener('beforeunload', preventLoss)
  }, [saved])
  useEffect(() => {
    let cancelled = false
    const persist = () => {
      if (cancelled || saveBlocked.current) {
        if (!cancelled) setSaved(false)
        return
      }
      try {
        if (localStorage.getItem(STORAGE_KEY) !== expectedRaw.current) {
          saveBlocked.current = true
          setSaved(false)
          setError(
            'This workspace changed in another tab. Saving is paused. Export this draft, then reload to use the stored version.',
          )
          return
        }
        const result = saveWorkspace(localStorage, workspace)
        setSaved(result.ok)
        if (result.ok) expectedRaw.current = result.raw
        else {
          setError(result.error)
          saveBlocked.current = true
        }
      } catch {
        setSaved(false)
        setError('Could not save. Export a backup before closing this tab.')
        saveBlocked.current = true
      }
    }
    setSaved(false)
    // Web Locks serialize cooperating tabs. The expected bytes detect stale drafts.
    if (navigator.locks)
      void navigator.locks.request(STORAGE_KEY, persist).catch(() => {
        if (!cancelled) {
          setSaved(false)
          saveBlocked.current = true
          setError('Browser storage locking failed. Export your work before closing this tab.')
        }
      })
    else persist()
    return () => {
      cancelled = true
    }
  }, [workspace])
  useEffect(() => {
    const listener = (event: StorageEvent) => {
      if (
        (event.key === STORAGE_KEY && event.newValue !== expectedRaw.current) ||
        event.key === null
      ) {
        saveBlocked.current = true
        setSaved(false)
        setError(
          'This workspace changed in another tab. Saving is paused to protect both versions. Export this draft, then reload to use the other tab’s version.',
        )
      }
    }
    window.addEventListener('storage', listener)
    return () => window.removeEventListener('storage', listener)
  }, [])
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 4500)
    return () => clearTimeout(timer)
  }, [notice])
  useEffect(() => {
    if (!editor) return
    const sync = () => {
      setFormat(
        editor.isActive('heading')
          ? `heading${editor.getAttributes('heading').level}`
          : editor.isActive('bulletList')
            ? 'bulletList'
            : editor.isActive('orderedList')
              ? 'orderedList'
              : editor.isActive('blockquote')
                ? 'blockquote'
                : editor.isActive('codeBlock')
                  ? 'codeBlock'
                  : 'paragraph',
      )
      setRevision((r) => r + 1)
    }
    editor.on('transaction', sync)
    return () => {
      editor.off('transaction', sync)
    }
  }, [editor])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        setFocus((value) => !value)
      }
      if (event.key === 'Escape') {
        setSidebarOpen(false)
        if (!modal) setFocus(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modal])
  const replaceDocument = (doc: WritingDocument) =>
    setWorkspace((state) => ({
      ...state,
      documents: state.documents.map((item) => (item.id === doc.id ? doc : item)),
    }))
  const patchDocument = (patch: { title?: string; content?: JSONContent }) => {
    try {
      replaceDocument(updateDocument(currentRef.current, patch))
    } catch (cause) {
      saveBlocked.current = true
      setSaved(false)
      setError(
        `This edit could not be saved: ${cause instanceof Error ? cause.message : 'unsupported document'}. Use Emergency plain text in Export to keep the current editor text.`,
      )
    }
  }
  const selectDocument = (id: string) => {
    navigationGeneration.current++
    if (id === current.id) {
      setSidebarOpen(false)
      return
    }
    setWorkspace((state) => ({ ...state, activeDocumentId: id }))
    setEditor(null)
    setSidebarOpen(false)
  }
  const newDocument = () => {
    navigationGeneration.current++
    if (workspace.documents.length >= 50) {
      setNotice('This workspace holds up to 50 documents. Export your drafts to keep a backup.')
      return
    }
    const doc = createDocument('Untitled')
    setWorkspace((state) => ({
      ...state,
      activeDocumentId: doc.id,
      documents: [doc, ...state.documents],
    }))
    setEditor(null)
    setSidebarOpen(false)
    setNotice('A fresh page, all yours.')
  }
  const takeSnapshot = () => {
    try {
      replaceDocument(snapshotDocument(current, snapshotName.trim() || 'A moment in the draft'))
      setSnapshotName('')
      setNotice('Snapshot added. Export JSON to keep a backup.')
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Snapshot failed.')
    }
  }
  const onExport = (kind: 'json' | 'html' | 'md') => {
    try {
      download(
        kind === 'json'
          ? serializeDocument(current)
          : kind === 'html'
            ? exportHtml(current)
            : exportMarkdown(current),
        `${safeName(current.title)}.${kind}`,
        kind === 'json' ? 'application/json' : kind === 'html' ? 'text/html' : 'text/markdown',
      )
      setNotice(`${kind.toUpperCase()} copy downloaded.`)
      setModal(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed.')
    }
  }
  return (
    <div
      className={`app-shell ${focus ? 'focus-mode' : ''} ${sidebarOpen ? 'sidebar-open' : ''} ${agentOpen ? 'assistant-open' : ''}`}
    >
      <a className="skip-link" href="#writing-desk">
        Skip to writing
      </a>
      {sidebarOpen && (
        <button
          className="sidebar-scrim"
          aria-label="Close document sidebar"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className="sidebar"
        aria-label="Document library"
        inert={compact && !sidebarOpen}
        aria-hidden={compact && !sidebarOpen}
      >
        <button
          className="icon-button sidebar-close"
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
        >
          <X size={18} />
        </button>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault()
            setFocus(false)
          }}
          aria-label="Foliohush home"
        >
          <span className="brand-mark">
            <Leaf size={20} strokeWidth={1.7} />
          </span>
          foliohush<span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">
          YOUR WRITING SPACE<span>LOCAL</span>
        </div>
        <button className="new-document" onClick={newDocument}>
          <Plus size={18} /> New document{' '}
          <span>
            <ArrowUpRight size={16} />
          </span>
        </button>
        <label className="search-box">
          <Search size={16} />
          <input
            aria-label="Search documents"
            placeholder="Find a thought…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="library-heading">
          <span>DOCUMENTS</span>
          <span>{workspace.documents.length.toString().padStart(2, '0')}</span>
        </div>
        <nav className="document-list" aria-label="Your documents">
          {workspace.documents
            .filter((doc) => doc.title.toLowerCase().includes(query.toLowerCase()))
            .map((doc) => (
              <button
                className={`document-card ${doc.id === current.id ? 'active' : ''}`}
                key={doc.id}
                onClick={() => selectDocument(doc.id)}
                aria-current={doc.id === current.id ? 'page' : undefined}
              >
                <FileText size={17} />
                <span>
                  <strong>{doc.title || 'Untitled'}</strong>
                  <small>
                    {dateLabel(doc.updatedAt)} <span>·</span>{' '}
                    {textContent(doc.content).trim()
                      ? `${textContent(doc.content).trim().split(/\s+/).length} words`
                      : 'A fresh page'}
                  </small>
                </span>
                {doc.id === current.id && <i />}
              </button>
            ))}
        </nav>
        {query &&
          !workspace.documents.some((doc) =>
            doc.title.toLowerCase().includes(query.toLowerCase()),
          ) && <p className="empty-search">No pages found. Try another word.</p>}
        <div className="sidebar-bottom">
          <div className="local-note">
            <span className="local-icon">
              <BookOpen size={19} />
            </span>
            <strong>A little space. A lot of possibility.</strong>
            <p>
              Your drafts live in this browser.
              <br />
              Export a backup to keep them safe.
            </p>
          </div>
          <button className="sidebar-action" onClick={() => importRef.current?.click()}>
            <Import size={16} /> Import a JSON backup
          </button>
          <button className="sidebar-action" onClick={() => setModal('help')}>
            <span className="shortcut-icon">?</span> A few helpful things <ArrowUpRight size={15} />
          </button>
          <div className="sidebar-footer">
            <span>OPEN SOURCE, OPEN POSSIBILITIES</span>
            <span>v0.1</span>
          </div>
        </div>
      </aside>
      <main className="main-workspace" id="writing-desk" inert={compact && sidebarOpen}>
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open document sidebar"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={19} />
            </button>
            <button
              className="icon-button focus-back"
              aria-label="Exit focus mode"
              onClick={() => setFocus(false)}
            >
              <ArrowLeft size={18} />
            </button>
            <span>My writing</span>
            <span className="breadcrumb-slash">/</span>
            <strong>{current.title || 'Untitled'}</strong>
          </div>
          <div className="topbar-actions">
            <button
              className={`header-action assistant-toggle ${agentOpen ? 'is-active' : ''}`}
              aria-label="Writing assistant"
              title="Writing assistant"
              aria-expanded={agentOpen}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setAgentOpen((value) => !value)}
            >
              <Sparkles size={20} />
              <span className="action-label">Assistant</span>
            </button>
            <button
              className="header-action appearance-toggle"
              aria-label="Appearance"
              title="Appearance"
              onClick={() => setModal('theme')}
            >
              <Palette size={20} />
              <span className="action-label">Appearance</span>
            </button>
            <button
              className={`header-action focus-toggle ${focus ? 'is-active' : ''}`}
              aria-label={focus ? 'Exit focus mode' : 'Enter focus mode'}
              title="Focus mode (Ctrl/Cmd+Shift+F)"
              onClick={() => setFocus(!focus)}
            >
              <Focus size={20} />
              <span className="action-label">Focus</span>
            </button>
            <button className="export-button" onClick={() => setModal('export')}>
              <ArrowDownToLine size={19} /> Export <ChevronDown size={16} />
            </button>
          </div>
        </header>
        {error && (
          <div className="error-banner" role="alert">
            <strong>Your words need a backup.</strong> {error}
            <button onClick={() => setModal('export')}>Export this document</button>
          </div>
        )}
        <div className="editor-toolbar" aria-label="Document formatting" role="toolbar">
          <div className="toolbar-left">
            <div className="toolbar-format">
              <FileText size={18} />
              <label className="visually-hidden" htmlFor="block-style">
                Block style
              </label>
              <select
                id="block-style"
                value={format}
                onChange={(e) => {
                  if (!editor) return
                  const value = e.target.value
                  const chain = editor.chain().focus()
                  if (value.startsWith('heading'))
                    chain.setHeading({ level: Number(value.slice(-1)) as 1 | 2 | 3 }).run()
                  else if (value === 'bulletList') chain.toggleBulletList().run()
                  else if (value === 'orderedList') chain.toggleOrderedList().run()
                  else if (value === 'blockquote') chain.toggleBlockquote().run()
                  else if (value === 'codeBlock') chain.toggleCodeBlock().run()
                  else chain.clearNodes().setParagraph().run()
                }}
              >
                <option value="paragraph">Text</option>
                <option value="heading1">Heading 1</option>
                <option value="heading2">Heading 2</option>
                <option value="heading3">Heading 3</option>
                <option value="bulletList">Bullet list</option>
                <option value="orderedList">Numbered list</option>
                <option value="blockquote">Quote</option>
                <option value="codeBlock">Code block</option>
              </select>
            </div>
            <span className="toolbar-divider" />
            <button
              className="icon-button"
              aria-label="Toggle bold"
              title="Bold"
              aria-pressed={editor?.isActive('bold') || false}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor?.chain().focus().toggleBold().run()}
            >
              <Bold size={19} />
            </button>
            <button
              className="icon-button"
              aria-label="Toggle italic"
              title="Italic"
              aria-pressed={editor?.isActive('italic') || false}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor?.chain().focus().toggleItalic().run()}
            >
              <Italic size={19} />
            </button>
          </div>
          <div className="toolbar-secondary">
            <button
              className="icon-button"
              aria-label="Undo"
              disabled={!editor?.can().undo()}
              onClick={() => editor?.chain().focus().undo().run()}
            >
              <Undo2 size={17} />
            </button>
            <button
              className="icon-button"
              aria-label="Redo"
              disabled={!editor?.can().redo()}
              onClick={() => editor?.chain().focus().redo().run()}
            >
              <Redo2 size={17} />
            </button>
            <span className="toolbar-divider" />
            <button className="history-button" onClick={() => setModal('history')}>
              <History size={15} />
              <span>Snapshots</span>
              {current.snapshots.length > 0 && <b>{current.snapshots.length}</b>}
            </button>
          </div>
        </div>
        {agentOpen && editor && (
          <AgentPanel
            key={`${current.id}-${editorEpoch}`}
            editor={editor}
            blocked={!!error}
            onClose={() => setAgentOpen(false)}
          />
        )}
        <div className="desk-layout">
          <article className="paper">
            <div className="document-kicker">
              <span className="kicker-dot" /> A WORK IN PROGRESS{' '}
              <span className="document-date">{dateLabel(current.createdAt)}</span>
            </div>
            <textarea
              key={`title-${current.id}`}
              ref={titleRef}
              className="document-title"
              aria-label="Document title"
              rows={1}
              value={current.title}
              placeholder="Untitled"
              maxLength={200}
              onChange={(e) => patchDocument({ title: e.target.value.replace(/\n/g, '') })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  editor?.commands.focus('start')
                }
              }}
            />
            <div className="document-meta">
              <span>{words} words</span>
              <span>·</span>
              <span>{Math.max(1, Math.ceil(words / 220))} min read</span>
              <span className="meta-line" />
            </div>
            <FolioEditor
              key={`${current.id}-${editorEpoch}`}
              initialContent={current.content}
              onReady={setEditor}
              onRejectedEdit={(reason) =>
                setNotice(`That edit was not applied: ${reason} Your draft is unchanged.`)
              }
              onChange={(content) => patchDocument({ content })}
            />
            <div className="end-mark">✳</div>
          </article>
          <aside className="outline" aria-label="Document outline">
            <div className="outline-heading">
              <List size={14} /> ON THIS PAGE
            </div>
            {headings.length ? (
              headings.map((node, index) => (
                <button
                  key={index}
                  className={`outline-item level-${node.attrs?.level || 2}`}
                  onClick={() => {
                    const elements = document.querySelectorAll(
                      '.folio-editor h1,.folio-editor h2,.folio-editor h3',
                    )
                    elements[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                  }}
                >
                  {textContent(node)}
                </button>
              ))
            ) : (
              <p>Your headings will find a home here.</p>
            )}
            <div className="outline-tip">
              <span>MAKE IT YOURS</span>
              <p>
                Select text to format.
                <br />
                Type <kbd>/</kbd> for blocks.
              </p>
              <p>
                Less clicking.
                <br />
                More thinking.
              </p>
            </div>
          </aside>
        </div>
        <footer className="desk-footer">
          <span
            className={`save-state ${saved ? '' : 'unsaved'}`}
            title="Stored in this browser only"
          >
            {saved ? <Check size={13} /> : <Clock3 size={13} />}
            <span>{saved ? 'Saved on this device' : 'Not saved'}</span>
          </span>

          <span className="footer-stats">
            {words} words <i /> {Math.max(1, Math.ceil(words / 220))} min read
          </span>
          <button aria-label="Writing help" onClick={() => setModal('help')}>
            <MoreHorizontal size={18} />
          </button>
        </footer>
      </main>
      <input
        ref={importRef}
        type="file"
        accept=".json,application/json"
        className="visually-hidden"
        aria-label="Import JSON document"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          const generation = ++navigationGeneration.current
          if (file.size > MAX_JSON_BYTES) {
            setNotice('That backup is too large. Maximum size is 4 MiB.')
            return
          }
          try {
            if (workspace.documents.length >= 50)
              throw new Error('This workspace holds up to 50 documents.')
            const doc = importDocument(await file.text())
            setWorkspace((state) => {
              if (state.documents.length >= 50) {
                setNotice('This workspace holds up to 50 documents. Import was not added.')
                return state
              }
              setNotice('Imported as a new document. Your existing drafts are untouched.')
              return {
                ...state,
                activeDocumentId:
                  generation === navigationGeneration.current ? doc.id : state.activeDocumentId,
                documents: [doc, ...state.documents],
              }
            })
          } catch (err) {
            setNotice(err instanceof Error ? err.message : 'Could not import that file.')
          }
        }}
      />
      <div className={`toast ${notice ? 'visible' : ''}`} role="status" aria-live="polite">
        {notice}
      </div>
      {modal === 'theme' && (
        <Dialog title="Make room for your words" onClose={() => setModal(null)}>
          <ThemePicker {...theme} />
        </Dialog>
      )}
      {modal === 'export' && (
        <Dialog title="Take your words with you" onClose={() => setModal(null)}>
          <p className="dialog-intro">
            A copy of “{current.title || 'Untitled'}”, ready for its next home.
          </p>
          <div className="export-options">
            {!saved && (
              <button
                onClick={() => {
                  download(
                    `${current.title || 'Untitled'}\n\n${editor?.getText() || textContent(current.content)}`,
                    `${safeName(current.title)}.txt`,
                    'text/plain',
                  )
                  setNotice('Current editor text downloaded.')
                }}
              >
                <span className="file-badge">TXT</span>
                <span>
                  <strong>Emergency plain text</strong>
                  <small>The current editor text, even if storage failed.</small>
                </span>
                <ArrowDownToLine size={18} />
              </button>
            )}
            <button onClick={() => onExport('json')}>
              <span className="file-badge">JSON</span>
              <span>
                <strong>Full-fidelity backup</strong>
                <small>Re-import your draft and recovery snapshots.</small>
              </span>
              <ArrowDownToLine size={18} />
            </button>
            <button onClick={() => onExport('html')}>
              <span className="file-badge">HTML</span>
              <span>
                <strong>A clean, readable page</strong>
                <small>Open in a browser. Formatting stays intact.</small>
              </span>
              <ArrowDownToLine size={18} />
            </button>
            <button onClick={() => onExport('md')}>
              <span className="file-badge">MD</span>
              <span>
                <strong>Portable Markdown</strong>
                <small>For your repository, notes, or publishing flow.</small>
              </span>
              <ArrowDownToLine size={18} />
            </button>
          </div>
          <p className="fine-print">
            Markdown has a simpler format. Use JSON for a lossless backup.
          </p>
        </Dialog>
      )}
      {modal === 'history' && (
        <Dialog title="Keep a moment in the draft" onClose={() => setModal(null)}>
          <p className="dialog-intro">
            Save a version before trying something new. The latest 12 snapshots stay with this
            document.
          </p>
          <form
            className="snapshot-form"
            onSubmit={(e) => {
              e.preventDefault()
              takeSnapshot()
            }}
          >
            <label className="visually-hidden" htmlFor="snapshot-name">
              Snapshot name
            </label>
            <input
              id="snapshot-name"
              maxLength={80}
              placeholder="Give this moment a name…"
              value={snapshotName}
              onChange={(e) => setSnapshotName(e.target.value)}
            />
            <button className="primary-button">Save snapshot</button>
          </form>
          <div className="snapshot-list">
            {current.snapshots.length ? (
              current.snapshots.map((snapshot) => (
                <div className="snapshot-row" key={snapshot.id}>
                  <Clock3 size={17} />
                  <span>
                    <strong>{snapshot.label}</strong>
                    <small>{new Date(snapshot.createdAt).toLocaleString()}</small>
                  </span>
                  <button
                    className="secondary-button"
                    onClick={() => {
                      navigationGeneration.current++
                      const restored = restoreSnapshot(current, snapshot.id)
                      replaceDocument(restored)
                      setEditor(null)
                      setEditorEpoch((value) => value + 1)
                      setModal(null)
                      setNotice(
                        'Snapshot restored. Your previous draft was saved as a recovery snapshot.',
                      )
                    }}
                  >
                    Restore
                  </button>
                </div>
              ))
            ) : (
              <div className="empty-state">
                <History size={30} />
                <h3>A place for your turning points</h3>
                <p>Your first snapshot will appear here.</p>
              </div>
            )}
          </div>
          <p className="fine-print">
            Restoring saves your current draft first. Snapshots live in this browser; include them
            in a JSON backup.
          </p>
        </Dialog>
      )}
      {modal === 'help' && (
        <Dialog title="A little less friction" onClose={() => setModal(null)}>
          <div className="help-list">
            <p>
              <kbd>/</kbd>
              <span>Type on an empty line to insert a block.</span>
            </p>
            <p>
              <kbd>⌘ / Ctrl + B</kbd>
              <span>Make a thought bold.</span>
            </p>
            <p>
              <kbd>⌘ / Ctrl + I</kbd>
              <span>A little emphasis.</span>
            </p>
            <p>
              <kbd>⌘ / Ctrl + Z</kbd>
              <span>Undo the last change.</span>
            </p>
            <p>
              <kbd>⌘ / Ctrl + Shift + F</kbd>
              <span>Find your focus.</span>
            </p>
          </div>
          <p className="dialog-intro">
            Select text for the floating format bar. Headings make an outline automatically. Save
            snapshots before big revisions.
          </p>
          <a
            className="licenses-link"
            href="./THIRD_PARTY_NOTICES.txt"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open-source licenses
          </a>
          <div className="privacy-note">
            <Leaf size={20} />
            <p>
              No account. No analytics. No cloud sync. Documents are stored in this browser, and
              clearing site data removes them. Keep a JSON backup of work that matters. The optional
              AI gateway receives only the context you explicitly choose to send. Offline tools send
              nothing.
            </p>
          </div>
        </Dialog>
      )}
    </div>
  )
}
