import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test'

const editorBody = (page: Page) => page.getByRole('textbox', { name: 'Document body' })
const assistant = (page: Page) => page.getByRole('complementary', { name: 'Writing assistant' })
const assistantToggle = (page: Page) =>
  page.getByRole('button', { name: 'Writing assistant', exact: true })

async function capture(page: Page, testInfo: TestInfo, name: string, fullPage = false) {
  await page.evaluate(() => document.fonts.ready)
  const path = testInfo.outputPath(`${name}.png`)
  await page.screenshot({ path, fullPage, animations: 'disabled' })
  await testInfo.attach(name, { path, contentType: 'image/png' })
}

async function expectComfortableTarget(control: Locator) {
  await expect(control).toBeVisible()
  const bounds = await control.boundingBox()
  expect(bounds, `${await control.getAttribute('aria-label')} has a target box`).not.toBeNull()
  expect(bounds!.width, 'interactive target width').toBeGreaterThanOrEqual(44)
  expect(bounds!.height, 'interactive target height').toBeGreaterThanOrEqual(44)
}

async function expectReadableText(elements: Locator, minimumSize: number) {
  const sizes = await elements.evaluateAll((nodes) =>
    nodes.map((node) => ({
      text: node.getAttribute('aria-label') || node.textContent?.trim().slice(0, 80),
      size: parseFloat(getComputedStyle(node).fontSize),
    })),
  )
  expect(sizes.length, 'the intended text is present').toBeGreaterThan(0)
  for (const { text, size } of sizes) {
    expect(size, `readable text: ${text}`).toBeGreaterThanOrEqual(minimumSize)
  }
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
      ),
    )
    .toBeLessThanOrEqual(1)
}

async function expectInsideViewport(element: Locator, page: Page, vertical = true) {
  await expect(element).toBeVisible()
  const bounds = await element.boundingBox()
  const viewport = page.viewportSize()!
  expect(bounds).not.toBeNull()
  expect(bounds!.x, 'left edge is visible').toBeGreaterThanOrEqual(-1)
  expect(bounds!.x + bounds!.width, 'right edge is visible').toBeLessThanOrEqual(viewport.width + 1)
  if (vertical) {
    expect(bounds!.y, 'top edge is visible').toBeGreaterThanOrEqual(-1)
    expect(bounds!.y + bounds!.height, 'bottom edge is visible').toBeLessThanOrEqual(
      viewport.height + 1,
    )
  }
}

async function openAssistant(page: Page) {
  await assistantToggle(page).click()
  await expect(assistant(page)).toBeVisible()
  await expect(assistantToggle(page)).toHaveAttribute('aria-expanded', 'true')
}

async function newDocument(page: Page) {
  const menu = page.getByRole('button', { name: 'Open document sidebar' })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('button', { name: /New document/ }).click()
  await expect(editorBody(page)).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/agent/status', (route) =>
    route.fulfill({ json: { ready: true, providerHost: 'api.example.test' } }),
  )
  await page.goto('/')
  await expect(editorBody(page)).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
})

test('primary workspace controls have comfortable targets and readable text', async ({
  page,
}, testInfo) => {
  for (const name of ['Writing assistant', 'Appearance', 'Enter focus mode', 'Export']) {
    const control = page.getByRole('button', { name, exact: true })
    await expectComfortableTarget(control)
    await expectInsideViewport(control, page)
  }
  const toolbar = page.getByRole('toolbar', { name: 'Document formatting' })
  for (const name of ['Toggle bold', 'Toggle italic', 'Undo', 'Redo']) {
    await expectComfortableTarget(toolbar.getByRole('button', { name, exact: true }))
  }
  await expectComfortableTarget(toolbar.getByRole('button', { name: /Snapshots/ }))
  await expectComfortableTarget(page.getByLabel('Block style'))
  await expectInsideViewport(toolbar, page)
  await expectReadableText(page.getByLabel('Block style'), 14)
  await expectReadableText(page.getByRole('button', { name: 'Export', exact: true }), 14)
  await expectReadableText(toolbar.getByRole('button', { name: /Snapshots/ }), 14)
  await expectReadableText(editorBody(page), 16)
  await expectReadableText(editorBody(page).locator('p'), 16)
  await expectNoHorizontalOverflow(page)
  await capture(page, testInfo, 'readable-workspace', true)

  const menu = page.getByRole('button', { name: 'Open document sidebar' })
  if (await menu.isVisible()) {
    await expectComfortableTarget(menu)
    await menu.click()
  }
  const library = page.getByRole('complementary', { name: 'Document library' })
  await expectComfortableTarget(library.getByRole('button', { name: /New document/ }))
  await expectComfortableTarget(library.getByLabel('Search documents'))
  await expectReadableText(library.locator('.document-card strong'), 14)
  await expectReadableText(library.getByLabel('Search documents'), 16)
  await capture(page, testInfo, 'document-library')
})

for (const width of [360, 412, 768, 1024, 1440]) {
  test(`workspace and assistant fit a ${width}px viewport with long content`, async ({
    page,
  }, testInfo) => {
    // Run each breakpoint once; the other tests retain real mobile-device emulation.
    test.skip(testInfo.project.name !== 'desktop', 'Breakpoint matrix runs in the desktop project.')
    await page.setViewportSize({ width, height: 900 })
    await page
      .getByLabel('Document title')
      .fill('A longer draft title with room for every word '.repeat(3))
    await editorBody(page).fill(
      `A link worth keeping: https://example.com/${'long-path-'.repeat(30)}`,
    )
    await expectNoHorizontalOverflow(page)
    await expectInsideViewport(page.getByLabel('Document title'), page, false)
    await expectInsideViewport(editorBody(page), page, false)
    await expect
      .poll(() =>
        page
          .getByLabel('Document title')
          .evaluate((element) => element.scrollHeight - element.clientHeight),
      )
      .toBeLessThanOrEqual(1)

    // Editing may scroll the document. Start the panel check at the workspace header.
    await page.evaluate(() => window.scrollTo(0, 0))
    await openAssistant(page)
    await expectInsideViewport(assistant(page), page)
    await expect
      .poll(() =>
        page
          .getByLabel('Document title')
          .evaluate((element) => element.scrollHeight - element.clientHeight),
      )
      .toBeLessThanOrEqual(1)
    await expectNoHorizontalOverflow(page)
    await capture(page, testInfo, `assistant-${width}px`)
    await assistant(page).getByRole('button', { name: 'Close writing assistant' }).click()
    await expect(assistant(page)).toHaveCount(0)
    await expectNoHorizontalOverflow(page)
  })
}

test('assistant form controls and explanatory text stay comfortable', async ({
  page,
}, testInfo) => {
  await openAssistant(page)
  await assistant(page).getByLabel('Assistant mode').selectOption('gateway')
  await expect(assistant(page)).toContainText('api.example.test')
  for (const label of ['Assistant mode', 'Writing task', 'Agent instructions', 'Context scope']) {
    const field = assistant(page).getByLabel(label)
    await expectComfortableTarget(field)
    await expectReadableText(field, 16)
  }
  await expectReadableText(assistant(page).locator('label, .agent-intro, .agent-note'), 14)
  await expectComfortableTarget(
    assistant(page).getByRole('button', { name: 'Close writing assistant' }),
  )
  await expectComfortableTarget(
    assistant(page).getByRole('button', { name: 'Send to AI & preview' }),
  )
  // The label provides the checkbox's touch target; the native check itself may stay compact.
  await expectComfortableTarget(assistant(page).locator('.agent-consent'))
  await expectInsideViewport(assistant(page), page)
  await expectNoHorizontalOverflow(page)
  await capture(page, testInfo, 'assistant-form')
})

test('desktop assistant reserves space beside the editor and focus mode remains usable', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'The rail starts at desktop widths.')
  for (const width of [1280, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    await openAssistant(page)
    for (const focused of [false, true]) {
      if (focused) await page.getByRole('button', { name: 'Enter focus mode', exact: true }).click()
      await expect(page.locator('.app-shell')).toHaveClass(/assistant-open/)
      await expectInsideViewport(assistant(page), page)
      for (const content of [
        page.locator('.paper'),
        page.getByRole('button', { name: 'Undo', exact: true }),
        page.getByRole('button', { name: /Snapshots/ }),
      ]) {
        await expect
          .poll(async () => {
            const bounds = await content.boundingBox()
            const panel = await assistant(page).boundingBox()
            return bounds && panel ? bounds.x + bounds.width - panel.x : Infinity
          })
          .toBeLessThanOrEqual(0)
      }
      await expectNoHorizontalOverflow(page)
      await capture(page, testInfo, `desktop-assistant-${width}${focused ? '-focus' : ''}`)
      if (focused)
        await page.getByRole('button', { name: 'Exit focus mode', exact: true }).last().click()
    }
    await assistant(page).getByRole('button', { name: 'Close writing assistant' }).click()
    await expect(page.locator('.app-shell')).not.toHaveClass(/assistant-open/)
    await expect(assistantToggle(page)).toHaveAttribute('aria-expanded', 'false')
  }
})

test('mobile assistant scrolls within the viewport and can be closed after scrolling', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Uses the mobile touch viewport.')
  await page.setViewportSize({ width: 360, height: 640 })
  await openAssistant(page)
  await assistant(page).getByLabel('Assistant mode').selectOption('gateway')
  await assistant(page).locator('.agent-context summary').click()
  const scrollRegion = assistant(page).locator('.agent-scroll')
  await expectInsideViewport(assistant(page), page)
  await expect
    .poll(() => scrollRegion.evaluate((element) => element.scrollHeight - element.clientHeight))
    .toBeGreaterThan(0)
  const send = assistant(page).getByRole('button', { name: 'Send to AI & preview' })
  await send.scrollIntoViewIfNeeded()
  await expectInsideViewport(send, page)
  await expect.poll(() => scrollRegion.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  await expectNoHorizontalOverflow(page)
  await capture(page, testInfo, 'mobile-assistant-scrolled')
  const close = assistant(page).getByRole('button', { name: 'Close writing assistant' })
  await expectInsideViewport(close, page)
  await close.click()
  await expect(assistant(page)).toHaveCount(0)
  await expect(assistantToggle(page)).toHaveAttribute('aria-expanded', 'false')
  await editorBody(page).fill('The page remains editable after closing the assistant.')
  await expect(editorBody(page)).toHaveText(
    'The page remains editable after closing the assistant.',
  )

  await page.evaluate(() => window.scrollTo(0, 0))
  await assistantToggle(page).focus()
  await page.keyboard.press('Enter')
  await expect(assistant(page)).toBeVisible()
  await assistant(page).getByLabel('Assistant mode').focus()
  await page.keyboard.press('Escape')
  await expect(assistant(page)).toHaveCount(0)
  await expect(assistantToggle(page)).toBeFocused()
})

test('persistent formatting controls apply bold and italic and preserve undo', async ({ page }) => {
  await newDocument(page)
  const words = 'A sentence to format from the toolbar.'
  await editorBody(page).fill(words)
  for (const [name, mark] of [
    ['Toggle bold', 'strong'],
    ['Toggle italic', 'em'],
  ] as const) {
    await editorBody(page).press('ControlOrMeta+a')
    const control = page.getByRole('button', { name, exact: true })
    await expectComfortableTarget(control)
    await control.click()
    await expect(editorBody(page).locator(mark)).toHaveText(words)
    await expect(control).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(editorBody(page).locator(mark)).toHaveCount(0)
    await expect(editorBody(page)).toHaveText(words)
  }
})

test('keyboard assistant dismissal restores the launch control focus', async ({ page }) => {
  await assistantToggle(page).focus()
  await page.keyboard.press('Enter')
  await expect(assistant(page)).toBeVisible()
  await expect(
    assistant(page).getByRole('heading', { name: 'A little writing help' }),
  ).toBeFocused()
  await assistant(page).getByLabel('Assistant mode').focus()
  await page.keyboard.press('Escape')
  await expect(assistant(page)).toHaveCount(0)
  await expect(assistantToggle(page)).toBeFocused()
})

test('assistant preview keeps review actions and close reachable while content scrolls', async ({
  page,
}, testInfo) => {
  await openAssistant(page)
  await assistant(page).getByLabel('Assistant mode').selectOption('demo')
  await assistant(page).getByRole('button', { name: 'Preview suggestion' }).click()
  await expect(page.getByRole('region', { name: 'Suggestion preview' })).toBeVisible()
  const scrollRegion = assistant(page).locator('.agent-scroll')
  await scrollRegion.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  for (const name of ['Apply suggestion', 'Reject', 'Close writing assistant']) {
    const control = assistant(page).getByRole('button', { name, exact: true })
    await expectComfortableTarget(control)
    await expectInsideViewport(control, page)
  }
  await expectNoHorizontalOverflow(page)
  await capture(page, testInfo, 'assistant-review-actions')
  await assistant(page).getByRole('button', { name: 'Reject', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Suggestion preview' })).toHaveCount(0)
})

test('dialogs and editing menus stay readable, tappable, and within the viewport', async ({
  page,
}, testInfo) => {
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const exportDialog = page.getByRole('dialog')
  await expectInsideViewport(exportDialog, page)
  await expectComfortableTarget(exportDialog.getByRole('button', { name: 'Close dialog' }))
  await expectReadableText(exportDialog.locator('.export-options strong'), 14)
  await capture(page, testInfo, 'export-menu')
  await exportDialog.getByRole('button', { name: 'Close dialog' }).click()

  await page.getByRole('button', { name: 'Appearance', exact: true }).click()
  const appearance = page.getByRole('dialog', { name: 'Make room for your words' })
  await expectInsideViewport(appearance, page)
  await expectReadableText(appearance.locator('.theme-card-label'), 14)
  await capture(page, testInfo, 'appearance-menu')
  await appearance.getByRole('button', { name: 'Close dialog' }).click()

  await newDocument(page)
  await editorBody(page).click()
  await page.keyboard.type('/')
  const blocks = page.getByRole('listbox', { name: 'Insert a block' })
  await expectInsideViewport(blocks, page)
  const options = blocks.getByRole('option')
  for (const option of await options.all()) await expectComfortableTarget(option)
  await expectReadableText(options, 14)
  await capture(page, testInfo, 'block-menu')
  await page.keyboard.press('Escape')
  await expect(blocks).toHaveCount(0)

  await editorBody(page).fill('Words with a little room.')
  await editorBody(page).press('ControlOrMeta+a')
  const formatting = page.getByRole('toolbar', { name: 'Format selected text' })
  await expectInsideViewport(formatting, page)
  for (const control of await formatting.getByRole('button').all()) {
    await expectComfortableTarget(control)
  }
  await expectNoHorizontalOverflow(page)
  await capture(page, testInfo, 'selection-menu')
  await formatting.getByRole('button', { name: 'Bold', exact: true }).click()
  await expect(editorBody(page).locator('strong')).toHaveText('Words with a little room.')
})
