import type { JSONContent } from '@tiptap/react'
export type AgentAction = 'outline' | 'continue' | 'rewrite' | 'format'
export type Proposal = {
  summary: string
  blocks: { type: 'paragraph' | 'heading' | 'bullet'; text: string }[]
}
export const MAX_CONTEXT = 12000
export function validateProposal(value: unknown): Proposal {
  if (!value || typeof value !== 'object') throw new Error('Invalid proposal.')
  const p = value as Proposal
  if (
    Object.keys(p).some((k) => !['summary', 'blocks'].includes(k)) ||
    typeof p.summary !== 'string' ||
    p.summary.length > 240 ||
    !Array.isArray(p.blocks) ||
    !p.blocks.length ||
    p.blocks.length > 40
  )
    throw new Error('Invalid proposal.')
  let size = 0
  for (const block of p.blocks) {
    if (
      !block ||
      Object.keys(block).some((k) => !['type', 'text'].includes(k)) ||
      !['paragraph', 'heading', 'bullet'].includes(block.type) ||
      typeof block.text !== 'string' ||
      !block.text.trim() ||
      block.text.length > 3000
    )
      throw new Error('Unsupported proposal block.')
    size += block.text.length
  }
  if (size > 24000) throw new Error('Proposal is too large.')
  return p
}
export function proposalContent(proposal: Proposal): JSONContent[] {
  return validateProposal(proposal).blocks.map((block) => {
    const paragraph = { type: 'paragraph', content: [{ type: 'text', text: block.text }] }
    return block.type === 'bullet'
      ? { type: 'bulletList', content: [{ type: 'listItem', content: [paragraph] }] }
      : block.type === 'heading'
        ? { type: 'heading', attrs: { level: 2 }, content: paragraph.content }
        : paragraph
  })
}
export function offlineFormat(context: string): Proposal {
  return validateProposal({
    summary:
      'Offline rules: Markdown heading and bullet prefixes become blocks; blank lines separate paragraphs. Existing inline styling is replaced.',
    blocks: context
      .split(/\n+/)
      .filter((line) => line.trim())
      .map((line) => {
        const text = line.trim()
        return /^#{1,3}\s+/.test(text)
          ? { type: 'heading', text: text.replace(/^#{1,3}\s+/, '') }
          : /^[-*]\s+/.test(text)
            ? { type: 'bullet', text: text.replace(/^[-*]\s+/, '') }
            : { type: 'paragraph', text }
      }),
  })
}
export function demoProposal(): Proposal {
  return {
    summary:
      'Simulated example only. No AI model was called. Replace these prompts with your own writing.',
    blocks: [
      { type: 'heading', text: 'A clear beginning' },
      { type: 'bullet', text: 'Introduce the question your article will explore.' },
      { type: 'bullet', text: 'Develop one idea with a concrete example.' },
      { type: 'bullet', text: 'Close with a useful next step for the reader.' },
    ],
  }
}
export async function requestProposal(
  action: AgentAction,
  instruction: string,
  context: string,
  signal: AbortSignal,
  providerHost?: string,
): Promise<Proposal> {
  if (context.length > MAX_CONTEXT || instruction.length > 1000)
    throw new Error('Request exceeds the writing assistant limit.')
  const response = await fetch('/api/agent', {
    method: 'POST',
    credentials: 'same-origin',
    redirect: 'error',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, instruction, context, providerHost }),
    signal,
  })
  if (response.status === 409) throw new Error('The AI provider changed. Switch to offline mode, then reconnect and review the new provider before sending again.')
  if (!response.ok)
    throw new Error(
      response.status === 404
        ? 'No AI gateway is installed. Use the offline tools, or self-host with the documented gateway.'
        : `AI gateway could not complete this request (${response.status}). Please try again later.`,
    )
  if (!response.headers.get('content-type')?.includes('application/json'))
    throw new Error('No compatible AI gateway is installed on this host.')
  return validateProposal(JSON.parse(await readBoundedText(response, 150000)))
}
export async function readBoundedText(response: Response, limit: number): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Empty gateway response.')
  let size = 0
  const chunks: Uint8Array[] = []
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) throw new Error('Gateway response is too large.')
      chunks.push(value)
    }
  } catch (error) {
    await reader.cancel()
    throw error
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}
