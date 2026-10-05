import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { closeHistory } from '@tiptap/pm/history'
import { Sparkles, X } from 'lucide-react'
import {
  demoProposal,
  MAX_CONTEXT,
  offlineFormat,
  proposalContent,
  requestProposal,
  readBoundedText,
  type AgentAction,
  type Proposal,
} from './lib/agent'
import { validateContent } from './lib/documents'
type Snapshot = {
  json: string
  from: number
  to: number
  context: string
  action: AgentAction
  selection: boolean
}
export function AgentPanel({
  editor,
  blocked,
  onClose,
}: {
  editor: Editor
  blocked: boolean
  onClose: () => void
}) {
  const [action, setAction] = useState<AgentAction>('outline')
  const [mode, setMode] = useState('offline')
  const [instruction, setInstruction] = useState('')
  const [scope, setScope] = useState(editor.state.selection.empty ? 'document' : 'selection')
  const [consent, setConsent] = useState(false)
  const [providerHost, setProviderHost] = useState('')
  const [gatewayStatus, setGatewayStatus] = useState('')
  useEffect(() => {
    setProviderHost('')
    setConsent(false)
    if (mode !== 'gateway') return
    const abort = new AbortController()
    const timer = setTimeout(() => {
      setGatewayStatus(
        'Gateway check timed out. Switch to offline mode and retry when your server is ready.',
      )
      abort.abort()
    }, 5000)
    setGatewayStatus('Checking this host’s gateway…')
    void fetch('/api/agent/status', {
      signal: abort.signal,
      redirect: 'error',
      credentials: 'same-origin',
    })
      .then(async (response) => {
        if (!response.ok || !response.headers.get('content-type')?.includes('application/json'))
          throw new Error()
        const text = await readBoundedText(response, 2000)
        if (text.length > 2000) throw new Error()
        const data = JSON.parse(text)
        if (
          data.ready !== true ||
          typeof data.providerHost !== 'string' ||
          !/^[a-zA-Z0-9.:[\]-]{1,253}$/.test(data.providerHost)
        )
          throw new Error()
        if (!abort.signal.aborted) {
          setProviderHost(data.providerHost)
          setGatewayStatus('')
        }
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setGatewayStatus(
            'No ready AI gateway found. Use offline tools or follow the self-hosting guide.',
          )
      })
      .finally(() => clearTimeout(timer))
    return () => {
      clearTimeout(timer)
      abort.abort()
    }
  }, [mode])
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [stale, setStale] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const generation = useRef(0)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    heading.current?.focus()
    return () => {
      generation.current++
      controller.current?.abort()
      if (previous?.isConnected) previous.focus()
    }
  }, [])
  useEffect(() => {
    const changed = () => {
      if (
        snapshot &&
        (JSON.stringify(editor.getJSON()) !== snapshot.json ||
          (snapshot.selection &&
            (editor.state.selection.from !== snapshot.from ||
              editor.state.selection.to !== snapshot.to)))
      )
        setStale(true)
    }
    editor.on('transaction', changed)
    return () => {
      editor.off('transaction', changed)
    }
  }, [editor, snapshot])
  const cancel = () => {
    generation.current++
    controller.current?.abort()
    setBusy(false)
    setError('Request cancelled. Your draft is unchanged.')
  }
  const generate = async () => {
    controller.current?.abort()
    const id = ++generation.current
    setError('')
    setProposal(null)
    setStale(false)
    const { from, to, empty } = editor.state.selection
    const selection = scope === 'selection'
    if (selection && empty) {
      setError('Select text in your document first.')
      return
    }
    const context = selection
      ? editor.state.doc.textBetween(from, to, '\n')
      : editor.getText({ blockSeparator: '\n' })
    if (context.length > MAX_CONTEXT) {
      setError('This scope exceeds 12,000 characters. Select a shorter passage. Nothing was sent.')
      return
    }
    const snap: Snapshot = {
      json: JSON.stringify(editor.getJSON()),
      from,
      to,
      context,
      action: mode === 'offline' ? 'format' : mode === 'demo' ? 'outline' : action,
      selection,
    }
    setSnapshot(snap)
    if (mode === 'gateway' && (!consent || !providerHost)) {
      setError('Confirm the context-sharing checkbox before sending.')
      return
    }
    const abort = new AbortController()
    controller.current = abort
    setBusy(true)
    const timer = setTimeout(() => abort.abort(), 45000)
    try {
      const result =
        mode === 'offline'
          ? offlineFormat(context)
          : mode === 'demo'
            ? demoProposal()
            : await requestProposal(action, instruction, context, abort.signal, providerHost)
      if (id === generation.current) setProposal(result)
    } catch (cause) {
      if (id === generation.current)
        setError(
          abort.signal.aborted
            ? 'The request timed out. Your draft is unchanged.'
            : cause instanceof Error
              ? cause.message
              : 'Could not prepare a proposal.',
        )
    } finally {
      clearTimeout(timer)
      if (id === generation.current) setBusy(false)
    }
  }
  const apply = () => {
    if (!proposal || !snapshot || blocked) return
    if (
      stale ||
      JSON.stringify(editor.getJSON()) !== snapshot.json ||
      (snapshot.selection &&
        (editor.state.selection.from !== snapshot.from ||
          editor.state.selection.to !== snapshot.to))
    ) {
      setStale(true)
      return
    }
    try {
      const content = proposalContent(proposal)
      const append =
        mode !== 'offline' && (snapshot.action === 'outline' || snapshot.action === 'continue')
      const from = append
        ? snapshot.selection
          ? snapshot.to
          : editor.state.doc.content.size
        : snapshot.selection
          ? snapshot.from
          : 0
      const to = append ? from : snapshot.selection ? snapshot.to : editor.state.doc.content.size
      const nodes = content.map((node) => editor.schema.nodeFromJSON(node))
      const transaction = editor.state.tr.replaceWith(from, to, nodes)
      validateContent(transaction.doc.toJSON())
      editor.view.dispatch(closeHistory(transaction))
      editor.view.dispatch(closeHistory(editor.state.tr))
      setProposal(null)
      setSnapshot(null)
      setError('Applied. Use Undo in the document toolbar to restore your draft.')
    } catch {
      setError('This proposal cannot fit safely here. Select complete paragraphs and try again.')
    }
  }
  const context =
    scope === 'selection'
      ? editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, '\n')
      : editor.getText({ blockSeparator: '\n' })
  return (
    <aside
      className="agent-panel"
      aria-label="Writing assistant"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <div className="agent-heading">
        <Sparkles size={20} />
        <h2 ref={heading} tabIndex={-1}>
          A little writing help
        </h2>
        <button className="icon-button" aria-label="Close writing assistant" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <p className="agent-intro">
        Your words stay yours. Review every suggestion before it touches the page.
      </p>
      <label>
        Assistant mode
        <select
          aria-label="Assistant mode"
          value={mode}
          disabled={busy}
          onChange={(e) => {
            setMode(e.target.value)
            setProposal(null)
            setConsent(false)
          }}
        >
          <option value="offline">Offline formatting · no AI</option>
          <option value="demo">Simulated outline · no AI</option>
          <option value="gateway">Connected AI · self-hosted gateway</option>
        </select>
      </label>
      {mode === 'gateway' && (
        <>
          <p className="agent-note">
            {providerHost ? `Provider: ${providerHost}. ` : gatewayStatus + ' '}Requires your own
            server gateway at /api/agent. The public demo has no AI provider. Never enter an API key
            here.
          </p>
          <label>
            Writing task
            <select
              aria-label="Writing task"
              value={action}
              disabled={busy}
              onChange={(e) => {
                setAction(e.target.value as AgentAction)
                setProposal(null)
              }}
            >
              <option value="outline">Build an outline</option>
              <option value="continue">Continue writing</option>
              <option value="rewrite">Rewrite / change tone</option>
              <option value="format">Organize and format</option>
            </select>
          </label>
          <label>
            Your instructions
            <textarea
              aria-label="Agent instructions"
              maxLength={1000}
              value={instruction}
              disabled={busy}
              placeholder="Keep my voice. Make this clearer and warmer…"
              onChange={(e) => {
                setInstruction(e.target.value)
                setProposal(null)
              }}
            />
          </label>
        </>
      )}
      <label>
        Context scope
        <select
          aria-label="Context scope"
          value={scope}
          disabled={busy}
          onChange={(e) => {
            setScope(e.target.value)
            setProposal(null)
            setConsent(false)
          }}
        >
          <option value="selection">Selected text only</option>
          <option value="document">Current document body</option>
        </select>
      </label>
      <details className="agent-context">
        <summary>Review context · {context.length.toLocaleString()} / 12,000 characters</summary>
        <pre>{context.slice(0, MAX_CONTEXT)}</pre>
      </details>
      {mode === 'gateway' && (
        <label className="agent-consent">
          <input
            type="checkbox"
            checked={consent}
            disabled={busy}
            onChange={(e) => setConsent(e.target.checked)}
          />
          Send only the context above and my instructions to{' '}
          {providerHost || 'this host’s configured AI provider'}. Provider charges and data policies
          may apply.
        </label>
      )}
      {mode === 'offline' && (
        <p className="agent-note">
          Converts # headings and - bullets from plain text. Replaces inline styles in the chosen
          scope. No network request.
        </p>
      )}
      {mode === 'demo' && (
        <p className="agent-note">
          A fixed example outline, not AI-generated. Nothing leaves this browser.
        </p>
      )}
      <div className="agent-actions">
        <button
          className="primary-button"
          disabled={busy || blocked || (mode === 'gateway' && (!consent || !providerHost))}
          onClick={() => void generate()}
        >
          {busy ? 'Preparing…' : mode === 'gateway' ? 'Send to AI & preview' : 'Preview suggestion'}
        </button>
        {busy && (
          <button className="secondary-button" onClick={cancel}>
            Cancel request
          </button>
        )}
      </div>
      {error && (
        <p role="status" className="agent-note">
          {error}
        </p>
      )}
      {proposal && (
        <section className="agent-proposal" aria-label="Suggestion preview">
          <h3>Suggestion preview</h3>
          <p>{proposal.summary}</p>
          <p className="agent-note">
            {mode !== 'offline' &&
            (snapshot?.action === 'outline' || snapshot?.action === 'continue')
              ? 'Inserts after this scope.'
              : 'Replaces this scope.'}{' '}
            Review facts and tone before applying.
          </p>
          <div className="agent-blocks">
            {proposal.blocks.map((block, i) =>
              block.type === 'heading' ? (
                <h4 key={i}>{block.text}</h4>
              ) : block.type === 'bullet' ? (
                <ul key={i}>
                  <li>{block.text}</li>
                </ul>
              ) : (
                <p key={i}>{block.text}</p>
              ),
            )}
          </div>
          {stale && (
            <p role="alert">
              Your document or selection changed. Preview a fresh suggestion before applying.
            </p>
          )}
          <div className="agent-actions">
            <button className="primary-button" disabled={stale || blocked} onClick={apply}>
              Apply suggestion
            </button>
            <button
              className="secondary-button"
              onClick={() => {
                setProposal(null)
                setSnapshot(null)
              }}
            >
              Reject
            </button>
          </div>
        </section>
      )}
      {blocked && (
        <p role="alert">Resolve the storage warning before applying assistant changes.</p>
      )}
    </aside>
  )
}
