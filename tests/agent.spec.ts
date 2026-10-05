import type { Editor } from '@tiptap/react'
import { expect, test, type Page } from '@playwright/test'

const body = (page: Page) => page.getByRole('textbox', { name: 'Document body' })
const panel = (page: Page) => page.getByRole('complementary', { name: 'Writing assistant' })
const preview = (page: Page) => page.getByRole('region', { name: 'Suggestion preview' })
const proposal = (text = 'A clearer thought.') => ({
  summary: 'A suggested revision',
  blocks: [{ type: 'paragraph', text }],
})

async function newDocument(page: Page, title = 'Assistant test draft') {
  const menu = page.getByRole('button', { name: 'Open document sidebar' })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('button', { name: /New document/ }).click()
  await expect(body(page)).toBeVisible()
  await page.getByLabel('Document title').fill(title)
}

async function setParagraphs(page: Page, paragraphs: string[]) {
  await body(page).evaluate((element, values) => {
    const editor = (element as HTMLElement & { editor: Editor }).editor
    editor.commands.setContent({
      type: 'doc',
      content: values.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
    })
  }, paragraphs)
}

async function selectText(page: Page, text: string) {
  await body(page).evaluate((element, target) => {
    const editor = (element as HTMLElement & { editor: Editor }).editor
    let found = false
    editor.state.doc.descendants((node, position) => {
      if (!found && node.isText && node.text?.includes(target)) {
        const from = position + node.text.indexOf(target)
        editor.commands.setTextSelection({ from, to: from + target.length })
        found = true
      }
    })
    if (!found) throw new Error(`Selection text not found: ${target}`)
  }, text)
}

async function documentJSON(page: Page) {
  return body(page).evaluate((element) =>
    (element as HTMLElement & { editor: Editor }).editor.getJSON(),
  )
}

async function openAssistant(page: Page) {
  await page.getByRole('button', { name: 'Writing assistant', exact: true }).click()
  await expect(panel(page)).toBeVisible()
}

async function gateway(page: Page, action = 'rewrite') {
  await panel(page).getByLabel('Assistant mode').selectOption('gateway')
  await panel(page).getByLabel('Writing task').selectOption(action)
  await expect(panel(page)).toContainText('api.example.test')
  await panel(page).getByRole('checkbox').check()
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/agent/status', (route) =>
    route.fulfill({
      json: { ready: true, providerHost: 'api.example.test' },
    }),
  )
  await page.goto('/')
  await expect(body(page)).toBeVisible()
  await newDocument(page)
})

test('offline formatting previews, rejects, applies, undoes, and persists without a request', async ({
  page,
}, testInfo) => {
  let requests = 0
  await page.route('**/api/agent', (route) => {
    requests++
    return route.abort()
  })
  await setParagraphs(page, [
    '# A quiet beginning',
    'A paragraph worth keeping.',
    '- One useful point',
  ])
  const original = await documentJSON(page)
  await openAssistant(page)
  await expect(panel(page).getByLabel('Assistant mode')).toHaveValue('offline')
  await expect(panel(page)).toContainText('No network request.')
  await panel(page).getByRole('button', { name: 'Preview suggestion' }).click()
  await expect(preview(page)).toContainText('A quiet beginning')
  expect(await documentJSON(page)).toEqual(original)
  await preview(page).getByRole('button', { name: 'Reject', exact: true }).click()
  await expect(preview(page)).toHaveCount(0)
  expect(await documentJSON(page)).toEqual(original)
  await panel(page).getByRole('button', { name: 'Preview suggestion' }).click()
  await page.screenshot({ path: testInfo.outputPath('assistant-preview.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await panel(page).getByRole('button', { name: 'Apply suggestion' }).click()
  await expect(body(page).locator('h2')).toHaveText('A quiet beginning')
  await expect(body(page).locator('li')).toHaveText('One useful point')
  await panel(page).getByRole('button', { name: 'Close writing assistant' }).click()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  expect(await documentJSON(page)).toEqual(original)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(body(page).locator('h2')).toHaveText('A quiet beginning')
  await page.reload()
  await expect(body(page).locator('h2')).toHaveText('A quiet beginning')
  await expect(body(page).locator('li')).toHaveText('One useful point')
  expect(requests).toBe(0)
})

test('simulated outline is clearly labeled, leaves the draft unchanged until apply, and never calls AI', async ({
  page,
}) => {
  let requests = 0
  await page.route('**/api/agent', (route) => {
    requests++
    return route.abort()
  })
  await body(page).fill('My own beginning.')
  await openAssistant(page)
  await panel(page).getByLabel('Assistant mode').selectOption('demo')
  await expect(panel(page)).toContainText('A fixed example outline, not AI-generated.')
  await panel(page).getByRole('button', { name: 'Preview suggestion' }).click()
  await expect(preview(page)).toContainText('Simulated example only. No AI model was called.')
  await expect(body(page)).toHaveText('My own beginning.')
  await panel(page).getByRole('button', { name: 'Apply suggestion' }).click()
  await expect(body(page)).toContainText('My own beginning.')
  await expect(body(page).locator('h2')).toHaveText('A clear beginning')
  expect(requests).toBe(0)
})

test('formatting a selected paragraph preserves surrounding paragraphs and can be undone exactly', async ({
  page,
}) => {
  await setParagraphs(page, ['Keep the beginning.', '# Selected heading', 'Keep the ending.'])
  const original = await documentJSON(page)
  await selectText(page, '# Selected heading')
  await openAssistant(page)
  await expect(panel(page).getByLabel('Context scope')).toHaveValue('selection')
  await panel(page).getByRole('button', { name: 'Preview suggestion' }).click()
  await panel(page).getByRole('button', { name: 'Apply suggestion' }).click()
  await expect(body(page).locator('h2')).toHaveText('Selected heading')
  await expect(body(page)).toContainText('Keep the beginning.')
  await expect(body(page)).toContainText('Keep the ending.')
  await panel(page).getByRole('button', { name: 'Close writing assistant' }).click()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  expect(await documentJSON(page)).toEqual(original)
})

test('rewriting a partial selection preserves unselected text and undo restores the exact document', async ({
  page,
}) => {
  await page.route('**/api/agent', (route) => route.fulfill({ json: proposal('better words') }))
  await setParagraphs(page, ['Before original words after.', 'Another untouched paragraph.'])
  const original = await documentJSON(page)
  await selectText(page, 'original words')
  await openAssistant(page)
  await gateway(page)
  await panel(page).getByRole('button', { name: 'Send to AI & preview' }).click()
  await expect(preview(page)).toContainText('better words')
  await panel(page).getByRole('button', { name: 'Apply suggestion' }).click()
  await expect(body(page)).toContainText('Before ')
  await expect(body(page)).toContainText('better words')
  await expect(body(page)).toContainText(' after.')
  await expect(body(page)).toContainText('Another untouched paragraph.')
  await expect(body(page)).not.toContainText('original words')
  await panel(page).getByRole('button', { name: 'Close writing assistant' }).click()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  expect(await documentJSON(page)).toEqual(original)
})

test('document changes make a preview stale and prevent applying it', async ({ page }) => {
  await setParagraphs(page, ['# Original heading'])
  await openAssistant(page)
  await panel(page).getByRole('button', { name: 'Preview suggestion' }).click()
  await setParagraphs(page, ['Newer work must survive.'])
  await expect(preview(page).getByRole('alert')).toContainText('document or selection changed')
  await expect(panel(page).getByRole('button', { name: 'Apply suggestion' })).toBeDisabled()
  await expect(body(page)).toHaveText('Newer work must survive.')
})

test('selection changes make a preview stale even when document text is unchanged', async ({
  page,
}) => {
  await setParagraphs(page, ['# First heading', '# Second heading'])
  await selectText(page, '# First heading')
  const original = await documentJSON(page)
  await openAssistant(page)
  await panel(page).getByRole('button', { name: 'Preview suggestion' }).click()
  await selectText(page, '# Second heading')
  await expect(panel(page).getByRole('button', { name: 'Apply suggestion' })).toBeDisabled()
  await expect(preview(page).getByRole('alert')).toContainText('document or selection changed')
  expect(await documentJSON(page)).toEqual(original)
})

test('gateway requires consent and sends only the current body, never titles, snapshots, or other documents', async ({
  page,
}) => {
  const sent: Record<string, unknown>[] = []
  await page.route('**/api/agent', (route) => {
    sent.push(route.request().postDataJSON())
    return route.fulfill({ json: proposal() })
  })
  await body(page).fill('PRIVATE OTHER DOCUMENT BODY')
  await newDocument(page, 'PRIVATE TITLE')
  await body(page).fill('PRIVATE OLD SNAPSHOT')
  await page.getByRole('button', { name: /Snapshots/ }).click()
  await page.getByLabel('Snapshot name').fill('PRIVATE SNAPSHOT NAME')
  await page.getByRole('button', { name: 'Save snapshot', exact: true }).click()
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await body(page).fill('Only the active body.')
  await openAssistant(page)
  await panel(page).getByLabel('Assistant mode').selectOption('gateway')
  const send = panel(page).getByRole('button', { name: 'Send to AI & preview' })
  await expect(send).toBeDisabled()
  await expect(panel(page)).toContainText('Never enter an API key here.')
  await panel(page).getByLabel('Writing task').selectOption('rewrite')
  await panel(page).getByLabel('Agent instructions').fill('Keep my voice.')
  await panel(page).getByRole('checkbox').check()
  await send.click()
  await expect(preview(page)).toBeVisible()
  expect(sent).toEqual([
    {
      action: 'rewrite',
      instruction: 'Keep my voice.',
      context: 'Only the active body.',
      providerHost: 'api.example.test',
    },
  ])
  await panel(page).getByLabel('Context scope').selectOption('selection')
  await expect(panel(page).getByRole('checkbox')).not.toBeChecked()
  await expect(send).toBeDisabled()
})

test('selected-text gateway requests exclude unselected text', async ({ page }) => {
  let sent: unknown
  await page.route('**/api/agent', (route) => {
    sent = route.request().postDataJSON()
    return route.fulfill({ json: proposal() })
  })
  await setParagraphs(page, ['Private prefix. Share this passage. Private suffix.'])
  await selectText(page, 'Share this passage.')
  await openAssistant(page)
  await gateway(page)
  await panel(page).getByRole('button', { name: 'Send to AI & preview' }).click()
  await expect(preview(page)).toBeVisible()
  expect(sent).toEqual({
    action: 'rewrite',
    instruction: '',
    context: 'Share this passage.',
    providerHost: 'api.example.test',
  })
})

test('oversized context never leaves the browser', async ({ page }) => {
  let requests = 0
  await page.route('**/api/agent', (route) => {
    requests++
    return route.abort()
  })
  await setParagraphs(page, ['x'.repeat(12001)])
  await openAssistant(page)
  await gateway(page)
  await panel(page).getByRole('button', { name: 'Send to AI & preview' }).click()
  await expect(panel(page).getByRole('status')).toContainText('Nothing was sent.')
  await expect(preview(page)).toHaveCount(0)
  expect(requests).toBe(0)
})

test('malicious gateway schemas are rejected without changing the draft', async ({ page }) => {
  await page.route('**/api/agent', (route) =>
    route.fulfill({
      json: {
        summary: 'Unsafe output',
        blocks: [{ type: 'paragraph', text: 'Replace everything', attrs: { onclick: 'alert(1)' } }],
      },
    }),
  )
  await body(page).fill('Keep my draft.')
  const original = await documentJSON(page)
  await openAssistant(page)
  await gateway(page)
  await panel(page).getByRole('button', { name: 'Send to AI & preview' }).click()
  await expect(panel(page).getByRole('status')).toContainText('Unsupported proposal block.')
  await expect(preview(page)).toHaveCount(0)
  expect(await documentJSON(page)).toEqual(original)
})

test('HTML-like output stays inert literal text in both preview and applied content', async ({
  page,
}) => {
  const text = '<img src=x onerror=alert(1)> <script>alert(2)</script> javascript:alert(3)'
  await page.route('**/api/agent', (route) => route.fulfill({ json: proposal(text) }))
  await body(page).fill('My draft.')
  await openAssistant(page)
  await gateway(page)
  await panel(page).getByRole('button', { name: 'Send to AI & preview' }).click()
  await expect(preview(page)).toContainText(text)
  await expect(preview(page).locator('img,script,iframe,a')).toHaveCount(0)
  await panel(page).getByRole('button', { name: 'Apply suggestion' }).click()
  await expect(body(page)).toHaveText(text)
  await expect(body(page).locator('img,script,iframe,a')).toHaveCount(0)
  await page.reload()
  await expect(body(page)).toHaveText(text)
})

test('missing gateways show an actionable error without changing the draft', async ({ page }) => {
  await page.route('**/api/agent', (route) => route.fulfill({ status: 404, body: 'No gateway' }))
  await body(page).fill('My local draft stays safe.')
  await openAssistant(page)
  await gateway(page)
  await panel(page).getByRole('button', { name: 'Send to AI & preview' }).click()
  await expect(panel(page).getByRole('status')).toContainText('No AI gateway is installed.')
  await expect(body(page)).toHaveText('My local draft stays safe.')
  await expect(preview(page)).toHaveCount(0)
})

test('cancelling a pending request ignores a late response and permits a fresh request', async ({
  page,
}) => {
  await body(page).fill('Original words.')
  // Deliberately emulate a transport that resolves even after AbortSignal cancellation.
  await page.evaluate(() => {
    const win = window as typeof window & { resolveAgent?: (value: Response) => void }
    const original = window.fetch
    window.fetch = (input, init) =>
      String(input) === '/api/agent'
        ? new Promise<Response>((resolve) => {
            win.resolveAgent = resolve
          })
        : original(input, init)
  })
  await openAssistant(page)
  await gateway(page)
  await panel(page).getByRole('button', { name: 'Send to AI & preview' }).click()
  await expect(panel(page).getByRole('button', { name: 'Cancel request' })).toBeVisible()
  await panel(page).getByRole('button', { name: 'Cancel request' }).click()
  await expect(panel(page).getByRole('status')).toContainText(
    'Request cancelled. Your draft is unchanged.',
  )
  await page.evaluate((value) => {
    const win = window as typeof window & { resolveAgent?: (value: Response) => void }
    win.resolveAgent?.(
      new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } }),
    )
  }, proposal('Late response must never appear.'))
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 50)))
  await expect(preview(page)).toHaveCount(0)
  await expect(body(page)).toHaveText('Original words.')
  await panel(page).getByRole('button', { name: 'Send to AI & preview' }).click()
  await page.evaluate((value) => {
    const win = window as typeof window & { resolveAgent?: (value: Response) => void }
    win.resolveAgent?.(
      new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } }),
    )
  }, proposal('Fresh response.'))
  await expect(preview(page)).toContainText('Fresh response.')
  await expect(preview(page)).not.toContainText('Late response')
})

test('a document change while a request is pending makes its eventual preview unusable', async ({
  page,
}) => {
  let finish!: () => void
  const held = new Promise<void>((resolve) => {
    finish = resolve
  })
  await page.route('**/api/agent', async (route) => {
    await held
    await route.fulfill({ json: proposal('Old-context response.') })
  })
  await body(page).fill('Original context.')
  await openAssistant(page)
  await gateway(page)
  const request = page.waitForRequest('**/api/agent')
  await panel(page).getByRole('button', { name: 'Send to AI & preview' }).click()
  await request
  await setParagraphs(page, ['Newer document text.'])
  finish()
  await expect(preview(page)).toBeVisible()
  await expect(panel(page).getByRole('button', { name: 'Apply suggestion' })).toBeDisabled()
  await expect(body(page)).toHaveText('Newer document text.')
})

test('unready, malformed, or oversized gateway status keeps sending disabled', async ({ page }) => {
  let requests = 0
  await page.route('**/api/agent', (route) => {
    requests++
    return route.abort()
  })
  await body(page).fill('Do not send these words without a known provider.')
  await openAssistant(page)
  for (const status of [
    { ready: false, providerHost: 'api.example.test' },
    { ready: 'yes', providerHost: 'api.example.test' },
    { ready: true, providerHost: 'https://api.example.test/path' },
    { ready: true, providerHost: 'api.example.test', extra: 'x'.repeat(2001) },
  ]) {
    await page.route('**/api/agent/status', (route) => route.fulfill({ json: status }))
    await panel(page).getByLabel('Assistant mode').selectOption('gateway')
    await expect(panel(page)).toContainText('No ready AI gateway found.')
    await expect(panel(page).getByRole('button', { name: 'Send to AI & preview' })).toBeDisabled()
    await panel(page).getByLabel('Assistant mode').selectOption('offline')
  }
  await page.route('**/api/agent/status', (route) =>
    route.fulfill({ status: 503, body: 'Server down' }),
  )
  await panel(page).getByLabel('Assistant mode').selectOption('gateway')
  await expect(panel(page)).toContainText('No ready AI gateway found.')
  await expect(panel(page).getByRole('button', { name: 'Send to AI & preview' })).toBeDisabled()
  expect(requests).toBe(0)
})

test('status timeout remains safe even if a ready status arrives late', async ({ page }) => {
  await body(page).fill('Private local words.')
  await openAssistant(page)
  await page.clock.install()
  await page.evaluate(() => {
    const win = window as typeof window & { resolveStatus?: (value: Response) => void }
    const original = window.fetch
    window.fetch = (input, init) =>
      String(input) === '/api/agent/status'
        ? new Promise<Response>((resolve) => {
            win.resolveStatus = resolve
          })
        : original(input, init)
  })
  await panel(page).getByLabel('Assistant mode').selectOption('gateway')
  await expect(panel(page)).toContainText('Checking this host’s gateway')
  await page.clock.fastForward(5001)
  await expect(panel(page)).toContainText('Gateway check timed out.')
  await page.evaluate(() => {
    const win = window as typeof window & { resolveStatus?: (value: Response) => void }
    win.resolveStatus?.(
      new Response(JSON.stringify({ ready: true, providerHost: 'api.example.test' }), {
        headers: { 'content-type': 'application/json' },
      }),
    )
  })
  await page.clock.runFor(1)
  await expect(panel(page)).toContainText('Gateway check timed out.')
  await expect(panel(page).getByRole('button', { name: 'Send to AI & preview' })).toBeDisabled()
  await expect(body(page)).toHaveText('Private local words.')
})
