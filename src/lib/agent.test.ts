import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  demoProposal,
  MAX_CONTEXT,
  offlineFormat,
  proposalContent,
  requestProposal,
  readBoundedText,
  validateProposal,
  type Proposal,
} from './agent'

const valid = (): Proposal => ({
  summary: 'A clearer beginning',
  blocks: [{ type: 'paragraph', text: 'Keep the writer in control.' }],
})
const signal = () => new AbortController().signal
const jsonResponse = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })

afterEach(() => vi.unstubAllGlobals())

describe('proposal validation', () => {
  it('accepts only the bounded plain-text proposal schema', () => {
    const proposal = {
      summary: 'Preview first',
      blocks: [
        { type: 'heading', text: 'Beginning' },
        { type: 'paragraph', text: 'A paragraph.' },
        { type: 'bullet', text: 'One useful point.' },
      ],
    }
    expect(validateProposal(proposal)).toEqual(proposal)
  })

  it.each([
    null,
    'not an object',
    [],
    {},
    { blocks: [] },
    { summary: 1, blocks: [{ type: 'paragraph', text: 'Text' }] },
    { summary: 'x'.repeat(241), blocks: [{ type: 'paragraph', text: 'Text' }] },
    { summary: '', blocks: [] },
    { ...valid(), command: 'delete all documents' },
    JSON.parse(
      '{"summary":"Unsafe","blocks":[{"type":"paragraph","text":"Text"}],"__proto__":{"polluted":true}}',
    ),
  ])('rejects malformed or extra top-level properties: %j', (value) => {
    expect(() => validateProposal(value)).toThrow(/Invalid proposal/)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it.each([
    null,
    'Text',
    { type: 'script', text: 'alert(1)' },
    { type: 'image', text: 'Tracking image', attrs: { src: 'https://example.com/pixel' } },
    { type: 'paragraph', text: 'Text', attrs: { onclick: 'alert(1)' } },
    {
      type: 'paragraph',
      text: 'Text',
      marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
    },
    { type: 'paragraph', text: 'Text', html: '<script>alert(1)</script>' },
    { type: 'paragraph', text: 'Text', content: [{ type: 'image' }] },
    { type: 'paragraph', text: 42 },
    { type: 'paragraph', text: '' },
    { type: 'paragraph', text: ' \n\t ' },
    { type: 'paragraph', text: 'x'.repeat(3001) },
    JSON.parse('{"type":"paragraph","text":"Text","__proto__":{"polluted":true}}'),
  ])('rejects unsupported or malicious blocks: %j', (block) => {
    expect(() => validateProposal({ summary: 'Preview', blocks: [block] })).toThrow(
      /Unsupported proposal block/,
    )
  })

  it('enforces both block count and aggregate text limits', () => {
    const block = { type: 'paragraph' as const, text: 'x'.repeat(3000) }
    expect(
      validateProposal({ summary: 'x'.repeat(240), blocks: Array(8).fill(block) }),
    ).toBeTruthy()
    expect(() => validateProposal({ summary: '', blocks: Array(9).fill(block) })).toThrow(
      /too large/,
    )
    expect(
      validateProposal({ summary: '', blocks: Array(40).fill({ ...block, text: 'x' }) }),
    ).toBeTruthy()
    expect(() =>
      validateProposal({ summary: '', blocks: Array(41).fill({ ...block, text: 'x' }) }),
    ).toThrow(/Invalid proposal/)
  })

  it('turns HTML, URLs, and Markdown into literal text nodes, never executable markup', () => {
    const text =
      '<img src=x onerror=alert(1)> <script>alert(2)</script> [link](javascript:alert(3))'
    expect(
      proposalContent({
        summary: 'Literal text',
        blocks: [
          { type: 'paragraph', text },
          { type: 'heading', text },
          { type: 'bullet', text },
        ],
      }),
    ).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text }] },
      {
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
        ],
      },
    ])
    expect(() => proposalContent({ ...valid(), extra: true } as Proposal)).toThrow()
  })
})

describe('local assistant modes', () => {
  it('formats only explicit heading and bullet prefixes with no network', () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    expect(
      offlineFormat('  # Title\n\nA paragraph.\n- First\n* Second\n### Section\n#### Literal'),
    ).toMatchObject({
      blocks: [
        { type: 'heading', text: 'Title' },
        { type: 'paragraph', text: 'A paragraph.' },
        { type: 'bullet', text: 'First' },
        { type: 'bullet', text: 'Second' },
        { type: 'heading', text: 'Section' },
        { type: 'paragraph', text: '#### Literal' },
      ],
    })
    expect(offlineFormat('Words').summary).toMatch(/Offline rules/)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects empty and oversized offline output instead of clearing a document', () => {
    expect(() => offlineFormat(' \n\n ')).toThrow()
    expect(() => offlineFormat('x'.repeat(3001))).toThrow()
    expect(() => offlineFormat(Array(41).fill('Line').join('\n'))).toThrow()
  })

  it('labels the simulated outline honestly and returns independent objects', () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const first = demoProposal()
    expect(first.summary).toMatch(/Simulated example only.*No AI model was called/)
    expect(validateProposal(first)).toEqual(first)
    first.blocks[0].text = 'Changed'
    expect(demoProposal().blocks[0].text).toBe('A clear beginning')
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('self-hosted gateway client', () => {
  it('sends only the bounded action, instructions, and chosen context to the same origin', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(valid()))
    vi.stubGlobal('fetch', fetch)
    const abort = signal()
    await expect(
      requestProposal('rewrite', 'Keep my voice', 'Only this passage', abort),
    ).resolves.toEqual(valid())
    expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/agent', {
      method: 'POST',
      credentials: 'same-origin',
      redirect: 'error',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'rewrite',
        instruction: 'Keep my voice',
        context: 'Only this passage',
      }),
      signal: abort,
    })
  })

  it('rejects excessive context or instructions before making any request', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(
      requestProposal('outline', '', 'x'.repeat(MAX_CONTEXT + 1), signal()),
    ).rejects.toThrow(/limit/)
    await expect(requestProposal('outline', 'x'.repeat(1001), '', signal())).rejects.toThrow(
      /limit/,
    )
    expect(fetch).not.toHaveBeenCalled()
  })

  it('accepts the exact request limits', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(valid()))
    vi.stubGlobal('fetch', fetch)
    await expect(
      requestProposal('continue', 'x'.repeat(1000), 'x'.repeat(MAX_CONTEXT), signal()),
    ).resolves.toEqual(valid())
  })

  it.each([
    [404, 'No AI gateway is installed'],
    [429, 'AI gateway could not complete this request (429)'],
    [500, 'AI gateway could not complete this request (500)'],
  ])(
    'gives a safe actionable error for HTTP %s without echoing the server body',
    async (status, message) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response('secret server diagnostics', { status })),
      )
      await expect(requestProposal('outline', '', 'Draft', signal())).rejects.toThrow(message)
    },
  )

  it('recognizes an HTML fallback page as a missing compatible gateway', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<html>App shell</html>', {
          headers: { 'content-type': 'text/html' },
        }),
      ),
    )
    await expect(requestProposal('outline', '', 'Draft', signal())).rejects.toThrow(
      /No compatible AI gateway/,
    )
  })

  it('rejects an empty response body and malformed JSON', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { headers: { 'content-type': 'application/json' } }),
      )
      .mockResolvedValueOnce(
        new Response('{broken', { headers: { 'content-type': 'application/json' } }),
      )
    vi.stubGlobal('fetch', fetch)
    await expect(requestProposal('outline', '', 'Draft', signal())).rejects.toThrow(/Empty gateway/)
    await expect(requestProposal('outline', '', 'Draft', signal())).rejects.toThrow()
  })

  it('decodes UTF-8 correctly across stream chunk boundaries', async () => {
    const proposal = { summary: 'Café', blocks: [{ type: 'paragraph', text: '你好 🌿' }] }
    const bytes = new TextEncoder().encode(JSON.stringify(proposal))
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          new ReadableStream({
            start(controller) {
              for (const byte of bytes) controller.enqueue(new Uint8Array([byte]))
              controller.close()
            },
          }),
          { headers: { 'content-type': 'application/json; charset=utf-8' } },
        ),
      ),
    )
    await expect(requestProposal('rewrite', '', 'Draft', signal())).resolves.toEqual(proposal)
  })

  it('caps streamed response bytes and cancels the reader when the limit is exceeded', async () => {
    const cancel = vi.fn().mockResolvedValue(undefined)
    const read = vi
      .fn()
      .mockResolvedValueOnce({ done: false, value: new Uint8Array(100000) })
      .mockResolvedValueOnce({ done: false, value: new Uint8Array(50001) })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        body: { getReader: () => ({ read, cancel }) },
      }),
    )
    await expect(requestProposal('rewrite', '', 'Draft', signal())).rejects.toThrow(
      /response is too large/,
    )
    expect(read).toHaveBeenCalledTimes(2)
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('cancels the reader if streaming fails and preserves the error', async () => {
    const cancel = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        body: {
          getReader: () => ({
            read: vi.fn().mockRejectedValue(new Error('Stream interrupted')),
            cancel,
          }),
        },
      }),
    )
    await expect(requestProposal('rewrite', '', 'Draft', signal())).rejects.toThrow(
      'Stream interrupted',
    )
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('rejects malicious provider output after decoding', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          summary: 'Unsafe',
          blocks: [{ type: 'paragraph', text: 'Text', attrs: { onclick: 'alert(1)' } }],
        }),
      ),
    )
    await expect(requestProposal('rewrite', '', 'Draft', signal())).rejects.toThrow(
      /Unsupported proposal block/,
    )
  })
})

describe('recipient binding and shared response reader', () => {
  it('binds consent to the provider hostname returned by readiness', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(valid()))
    vi.stubGlobal('fetch', fetch)
    await requestProposal('rewrite', '', 'Selected text', signal(), 'api.example.test')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      action: 'rewrite',
      instruction: '',
      context: 'Selected text',
      providerHost: 'api.example.test',
    })
  })

  it('accepts exactly the byte limit and rejects a single extra byte', async () => {
    await expect(readBoundedText(new Response('x'.repeat(2000)), 2000)).resolves.toHaveLength(2000)
    await expect(readBoundedText(new Response('x'.repeat(2001)), 2000)).rejects.toThrow(/too large/)
    await expect(readBoundedText(new Response('🌿'.repeat(501)), 2000)).rejects.toThrow(/too large/)
  })
})
