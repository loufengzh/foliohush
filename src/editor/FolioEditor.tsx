import { useEffect, useId, useRef, useState } from 'react'
import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
  type JSONContent,
} from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Highlight from '@tiptap/extension-highlight'
import {
  Bold,
  Italic,
  Highlighter,
  Link2,
  Code2,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  Text,
  List,
  ListOrdered,
  Quote,
  Minus,
} from 'lucide-react'
import { Plugin } from '@tiptap/pm/state'
import { Extension } from '@tiptap/core'
import { isSafeUrl, validateContent } from '../lib/documents'

const bubbleOptions = { placement: 'top' as const, offset: 12 }
type Command = {
  name: string
  description: string
  icon: typeof Text
  run: (editor: Editor) => void
}
const commands: Command[] = [
  {
    name: 'Text',
    description: 'Just start writing',
    icon: Text,
    run: (e) => {
      e.chain().focus().setParagraph().run()
    },
  },
  ...([1, 2, 3] as const).map((level, i) => ({
    name: `Heading ${level}`,
    description: ['A new chapter', 'A new section', 'A smaller thought'][i],
    icon: [Heading1, Heading2, Heading3][i],
    run: (e: Editor) => {
      e.chain().focus().setHeading({ level }).run()
    },
  })),
  {
    name: 'Bullet list',
    description: 'Ideas, one by one',
    icon: List,
    run: (e) => {
      e.chain().focus().toggleBulletList().run()
    },
  },
  {
    name: 'Numbered list',
    description: 'A little order',
    icon: ListOrdered,
    run: (e) => {
      e.chain().focus().toggleOrderedList().run()
    },
  },
  {
    name: 'Quote',
    description: 'Give a thought some space',
    icon: Quote,
    run: (e) => {
      e.chain().focus().toggleBlockquote().run()
    },
  },
  {
    name: 'Code block',
    description: 'Keep the details exact',
    icon: Code2,
    run: (e) => {
      e.chain().focus().toggleCodeBlock().run()
    },
  },
  {
    name: 'Divider',
    description: 'A moment to pause',
    icon: Minus,
    run: (e) => {
      e.chain().focus().setHorizontalRule().run()
    },
  },
]
type Slash = { from: number; to: number; query: string; left: number; top: number }
export type FolioEditorProps = {
  initialContent: JSONContent
  onChange?: (content: JSONContent, editor: Editor) => void
  onReady?: (editor: Editor) => void
  onRejectedEdit?: (reason: string) => void
  editable?: boolean
  placeholder?: string
}
/** Mount with a different React key to switch documents and isolate undo history. */
export function FolioEditor({
  initialContent,
  onChange,
  onReady,
  onRejectedEdit,
  editable = true,
  placeholder = 'Write something, or type ‘/’ for a block…',
}: FolioEditorProps) {
  const callbacks = useRef({ onChange, onReady, onRejectedEdit })
  callbacks.current = { onChange, onReady, onRejectedEdit }
  const menuId = useId()
  const menuRef = useRef<HTMLDivElement>(null)
  const linkDialog = useRef<HTMLFormElement>(null)
  const [slash, setSlash] = useState<Slash | null>(null)
  const [selected, setSelected] = useState(0)
  const [linkOpen, setLinkOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [linkError, setLinkError] = useState('')
  const slashRef = useRef<{ slash: Slash | null; selected: number }>({ slash: null, selected: 0 })
  slashRef.current = { slash, selected }
  const dismissed = useRef<number | null>(null)
  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: [
      Extension.create({
        name: 'documentSafety',
        addProseMirrorPlugins() {
          return [
            new Plugin({
              filterTransaction(transaction) {
                if (!transaction.docChanged) return true
                try {
                  validateContent(transaction.doc.toJSON())
                  return true
                } catch (cause) {
                  callbacks.current.onRejectedEdit?.(
                    cause instanceof Error ? cause.message : 'Unsupported content',
                  )
                  return false
                }
              },
            }),
          ]
        },
      }),
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          autolink: false,
          isAllowedUri: (url) => isSafeUrl(url),
          HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
        },
      }),
      Placeholder.configure({ placeholder }),
      Highlight,
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class: 'folio-editor',
        role: 'textbox',
        'aria-label': 'Document body',
        'aria-multiline': 'true',
        spellcheck: 'true',
      },
      handleKeyDown: (view, event) => {
        const state = slashRef.current
        if (!state.slash || event.isComposing) return false
        const matches = commands.filter((c) =>
          c.name.toLowerCase().includes(state.slash!.query.toLowerCase()),
        )
        if (event.key === 'Escape') {
          dismissed.current = state.slash.from
          setSlash(null)
          return true
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          setSelected(
            (i) =>
              (i + (event.key === 'ArrowDown' ? 1 : -1) + Math.max(matches.length, 1)) %
              Math.max(matches.length, 1),
          )
          return true
        }
        if (event.key === 'Enter' && matches.length) {
          const cmd = matches[state.selected % matches.length]
          view.dispatch(view.state.tr.delete(state.slash.from, state.slash.to))
          setSlash(null)
          // The editor exists by the time an input event reaches this view.
          cmd.run(editor!)
          return true
        }
        return false
      },
    },
    onCreate: ({ editor }) => callbacks.current.onReady?.(editor),
    onUpdate: ({ editor }) => callbacks.current.onChange?.(editor.getJSON(), editor),
    onTransaction: ({ editor }) => {
      const { selection } = editor.state
      const { $from, empty } = selection
      const text = $from.parent.textContent
      if (
        editable &&
        empty &&
        $from.parent.type.name === 'paragraph' &&
        /^\/[a-zA-Z0-9 ]*$/.test(text) &&
        $from.parentOffset === text.length
      ) {
        const from = $from.start()
        if (dismissed.current === from) return
        const coords = editor.view.coordsAtPos(selection.from)
        const query = text.slice(1)
        const next = {
          from,
          to: selection.from,
          query,
          left: Math.min(coords.left, window.innerWidth - 294),
          top: Math.min(coords.bottom + 10, window.innerHeight - 330),
        }
        if (slashRef.current.slash?.query !== query) setSelected(0)
        setSlash((old) =>
          old &&
          old.from === next.from &&
          old.to === next.to &&
          old.query === next.query &&
          old.left === next.left &&
          old.top === next.top
            ? old
            : next,
        )
      } else {
        dismissed.current = null
        setSlash(null)
      }
    },
  })
  useEffect(() => {
    editor?.setEditable(editable)
  }, [editor, editable])
  const active = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor?.isActive('bold'),
      italic: editor?.isActive('italic'),
      strike: editor?.isActive('strike'),
      code: editor?.isActive('code'),
      highlight: editor?.isActive('highlight'),
      link: editor?.isActive('link'),
    }),
  })
  const linkInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (linkOpen) linkInput.current?.focus()
  }, [linkOpen])
  useEffect(() => {
    if (slash)
      menuRef.current
        ?.querySelector('[aria-selected="true"]')
        ?.scrollIntoView?.({ block: 'nearest' })
    if (!editor) return
    if (slash) {
      editor.view.dom.setAttribute('aria-controls', menuId)
      editor.view.dom.setAttribute('aria-activedescendant', `${menuId}-${selected}`)
    } else {
      editor.view.dom.removeAttribute('aria-controls')
      editor.view.dom.removeAttribute('aria-activedescendant')
    }
  }, [editor, menuId, selected, slash])
  if (!editor) return <div className="editor-loading">Opening your page…</div>
  const matches = slash
    ? commands.filter((c) => c.name.toLowerCase().includes(slash.query.toLowerCase()))
    : []
  const openLink = () => {
    setUrl(editor.getAttributes('link').href || '')
    setLinkError('')
    setLinkOpen(true)
  }
  return (
    <>
      <EditorContent editor={editor} />
      {editable && (
        <BubbleMenu editor={editor} options={bubbleOptions} updateDelay={0}>
          <div
            className="bubble-toolbar"
            role="toolbar"
            aria-label="Format selected text"
            onMouseDown={(e) => e.preventDefault()}
          >
            {(
              [
                ['Bold', Bold, active?.bold, () => editor.chain().focus().toggleBold().run()],
                [
                  'Italic',
                  Italic,
                  active?.italic,
                  () => editor.chain().focus().toggleItalic().run(),
                ],
                [
                  'Strikethrough',
                  Strikethrough,
                  active?.strike,
                  () => editor.chain().focus().toggleStrike().run(),
                ],
                [
                  'Highlight',
                  Highlighter,
                  active?.highlight,
                  () => editor.chain().focus().toggleHighlight().run(),
                ],
                [
                  'Inline code',
                  Code2,
                  active?.code,
                  () => editor.chain().focus().toggleCode().run(),
                ],
                ['Link', Link2, active?.link, openLink],
              ] as const
            ).map(([label, Icon, pressed, action]) => (
              <button
                key={label}
                type="button"
                aria-label={label}
                aria-pressed={!!pressed}
                title={label}
                onClick={action}
              >
                <Icon size={17} />
              </button>
            ))}
          </div>
        </BubbleMenu>
      )}
      {slash && (
        <div
          ref={menuRef}
          id={menuId}
          className="slash-menu"
          role="listbox"
          aria-label="Insert a block"
          style={{ left: Math.max(12, slash.left), top: Math.max(12, slash.top) }}
        >
          <span className="menu-eyebrow">TURN A LINE INTO…</span>
          {matches.map((command, index) => (
            <button
              id={`${menuId}-${index}`}
              key={command.name}
              role="option"
              aria-selected={index === selected}
              className={index === selected ? 'is-selected' : ''}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setSelected(index)}
              onClick={() => {
                editor.chain().focus().deleteRange({ from: slash.from, to: slash.to }).run()
                command.run(editor)
                setSlash(null)
              }}
            >
              <span className="command-icon">
                <command.icon size={19} />
              </span>
              <span>
                {command.name}
                <small>{command.description}</small>
              </span>
            </button>
          ))}
          {!matches.length && (
            <p className="no-results">No matching blocks. Escape to keep writing.</p>
          )}
          <div className="menu-hint">
            ↑↓ navigate <span>↵ insert · esc close</span>
          </div>
        </div>
      )}
      {linkOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setLinkOpen(false)
              editor.commands.focus()
            }
          }}
        >
          <form
            ref={linkDialog}
            className="dialog link-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="link-title"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation()
                setLinkOpen(false)
                editor.commands.focus()
              }
              if (e.key === 'Tab') {
                const elements = [
                  ...linkDialog.current!.querySelectorAll<HTMLElement>('button,input'),
                ]
                const first = elements[0]
                const last = elements[elements.length - 1]
                if (e.shiftKey && document.activeElement === first) {
                  e.preventDefault()
                  last?.focus()
                } else if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault()
                  first?.focus()
                }
              }
            }}
            onSubmit={(e) => {
              e.preventDefault()
              if (!isSafeUrl(url)) {
                setLinkError('Use a full https://, http://, or mailto: address.')
                return
              }
              editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run()
              setLinkOpen(false)
            }}
          >
            <h2 id="link-title">A connection worth making</h2>
            <label htmlFor="link-url">Link address</label>
            <input
              ref={linkInput}
              id="link-url"
              value={url}
              placeholder="https://example.com"
              onChange={(e) => setUrl(e.target.value)}
            />
            {linkError && (
              <p role="alert" className="error-text">
                {linkError}
              </p>
            )}
            <div className="dialog-actions">
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  editor.chain().focus().extendMarkRange('link').unsetLink().run()
                  setLinkOpen(false)
                }}
              >
                Remove link
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setLinkOpen(false)
                  editor.commands.focus()
                }}
              >
                Cancel
              </button>
              <button className="primary-button">Save link</button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
