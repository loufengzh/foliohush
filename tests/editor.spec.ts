import type { Editor } from '@tiptap/react'
import { test, expect, type Page } from '@playwright/test'
const body = (page: Page) => page.getByRole('textbox', { name: 'Document body' })
async function newPage(page: Page) {
  const menu = page.getByRole('button', { name: 'Open document sidebar' })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('button', { name: /New document/ }).click()
  await expect(body(page)).toBeVisible()
}
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(body(page)).toBeVisible()
})
test('sample renders with outline and no horizontal overflow', async ({ page }, testInfo) => {
  await expect(body(page)).toContainText('Make room for the first sentence')
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: testInfo.outputPath('workspace.png'), fullPage: true })
  await testInfo.attach('workspace', {
    path: testInfo.outputPath('workspace.png'),
    contentType: 'image/png',
  })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await expect(page.getByLabel('Document title')).toHaveValue('The art of a quiet beginning')
})
test('title and body persist immediately across reload', async ({ page }) => {
  await newPage(page)
  await page.getByLabel('Document title').fill('A real draft with spaces')
  await body(page).fill('My words survive a reload.')
  await page.reload()
  await expect(page.getByLabel('Document title')).toHaveValue('A real draft with spaces')
  await expect(body(page)).toHaveText('My words survive a reload.')
  await expect(page.getByText('Not saved', { exact: true })).toHaveCount(0)
})
test('blank title stays editable and title typing preserves spaces', async ({ page }) => {
  await page.getByLabel('Document title').fill('')
  await page.getByLabel('Document title').pressSequentially('A quiet room')
  await expect(page.getByLabel('Document title')).toHaveValue('A quiet room')
})
test('slash commands work with keyboard and Escape dismisses', async ({ page }) => {
  await newPage(page)
  await body(page).click()
  await page.keyboard.type('/heading 2')
  await expect(page.getByRole('listbox', { name: 'Insert a block' })).toBeVisible()
  await page.keyboard.press('Enter')
  await page.keyboard.type('A new section')
  await expect(body(page).locator('h2')).toHaveText('A new section')
  await page.keyboard.press('Enter')
  await page.keyboard.type('/')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(body(page)).toContainText('/')
})
test('undo and redo are isolated between documents', async ({ page }) => {
  await newPage(page)
  await body(page).click()
  await page.keyboard.type('A first thought')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(body(page)).not.toContainText('A first thought')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(body(page)).toContainText('A first thought')
  await newPage(page)
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
})
test('snapshot restore preserves the replaced draft and survives reload', async ({ page }) => {
  await newPage(page)
  await body(page).fill('Version one')
  await page.getByRole('button', { name: /Snapshots/ }).click()
  await page.getByLabel('Snapshot name').fill('First turning point')
  await page.getByRole('button', { name: 'Save snapshot', exact: true }).click()
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await body(page).fill('Version two')
  await page.getByRole('button', { name: /Snapshots/ }).click()
  await page.getByRole('button', { name: 'Restore', exact: true }).first().click()
  await expect(body(page)).toHaveText('Version one')
  await page.reload()
  await expect(body(page)).toHaveText('Version one')
  await page.getByRole('button', { name: /Snapshots/ }).click()
  await expect(page.getByText('Before restore', { exact: false })).toBeVisible()
})
test('JSON import creates a separate document and invalid imports do not change draft', async ({
  page,
}) => {
  await newPage(page)
  await page.getByLabel('Document title').fill('Original')
  await body(page).fill('Keep these words')
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.stringify(
          JSON.parse(localStorage.getItem('foliohush.workspace.v1')!).documents[0].content,
        ),
      ),
    )
    .toContain('Keep these words')
  const source = await page.evaluate(
    () => JSON.parse(localStorage.getItem('foliohush.workspace.v1')!).documents[0],
  )
  const data = JSON.stringify({ format: 'foliohush', version: 1, document: source })
  await page
    .getByLabel('Import JSON document')
    .setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(data) })
  await expect(page.getByRole('status')).toContainText('Imported as a new document')
  await expect(body(page)).toHaveText('Keep these words')
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('foliohush.workspace.v1')!).documents.length,
      ),
    )
    .toBe(3)
  await page.getByLabel('Import JSON document').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{broken'),
  })
  await expect(page.getByRole('status')).toContainText('not valid JSON')
  await expect(body(page)).toHaveText('Keep these words')
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('foliohush.workspace.v1')!).documents.length,
      ),
    )
    .toBe(3)
})
test('export generates portable JSON and dialog cancellation preserves typing', async ({
  page,
}) => {
  await newPage(page)
  await body(page).fill('A portable thought')
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: /Full-fidelity backup/ }).click()
  const downloaded = await pending
  expect(downloaded.suggestedFilename()).toMatch(/\.json$/)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(body(page)).toHaveText('A portable thought')
})
test('corrupt local data is never silently overwritten', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('foliohush.workspace.v1', '{not-json'))
  await page.reload()
  await expect(page.getByRole('alert')).toContainText('Your words need a backup')
  await body(page).fill('Unsaved but exportable')
  expect(await page.evaluate(() => localStorage.getItem('foliohush.workspace.v1'))).toBe(
    '{not-json',
  )
  await page.getByRole('button', { name: 'Export this document', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
})
test('cross-tab edit pauses writes instead of overwriting newer work', async ({
  page,
  context,
}) => {
  const second = await context.newPage()
  await second.goto('/')
  await expect(body(second)).toBeVisible()
  await body(second).fill('Newer words in another tab')
  await expect(page.getByRole('alert')).toContainText('another tab')
  await body(page).fill('An unsaved fork')
  expect(
    await page.evaluate(() =>
      JSON.stringify(
        JSON.parse(localStorage.getItem('foliohush.workspace.v1')!).documents[0].content,
      ),
    ),
  ).toContain('Newer words in another tab')
  await second.close()
})
test('focus mode and repeated modal opening stay usable', async ({ page }) => {
  await page.getByRole('button', { name: 'Enter focus mode', exact: true }).click()
  await expect(page.getByRole('complementary', { name: 'Document library' })).toBeHidden()
  await page.getByRole('button', { name: 'Exit focus mode', exact: true }).last().click()
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Export', exact: true }).click()
    await page.getByRole('button', { name: 'Close dialog' }).click()
  }
  await expect(body(page)).toBeVisible()
})
test('formatting selection works and unsafe links are rejected', async ({ page }) => {
  await newPage(page)
  await body(page).fill('Words to emphasize')
  await body(page).press('ControlOrMeta+a')
  await expect(page.getByRole('toolbar', { name: 'Format selected text' })).toBeVisible()
  await page.getByRole('button', { name: 'Bold', exact: true }).click()
  await expect(body(page).locator('strong')).toContainText('Words to emphasize')
  await body(page).click()
  // Wait for the native click to reach ProseMirror before issuing another selection.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const element = document.querySelector('.folio-editor') as
          (HTMLElement & { editor?: Editor }) | null
        return !!element?.editor?.state.selection.empty && !!window.getSelection()?.isCollapsed
      }),
    )
    .toBe(true)
  await body(page).press('ControlOrMeta+a')
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toBe('Words to emphasize')
  await expect(page.getByRole('toolbar', { name: 'Format selected text' })).toBeVisible()
  await page.getByRole('button', { name: 'Link', exact: true }).click()
  await page.getByLabel('Link address').fill('javascript:alert(1)')
  await page.getByRole('button', { name: 'Save link', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Use a full')
  await page.getByLabel('Link address').fill('https://example.com')
  await page.getByRole('button', { name: 'Save link', exact: true }).click()
  await expect(body(page).locator('a')).toHaveAttribute('href', 'https://example.com')
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.stringify(
          JSON.parse(localStorage.getItem('foliohush.workspace.v1')!).documents[0].content,
        ),
      ),
    )
    .toContain('https://example.com/')
  await page.reload()
  await expect(body(page).locator('a')).toHaveAttribute('href', 'https://example.com/')
})
test('opening a second tab without editing does not cause a conflict', async ({
  page,
  context,
}) => {
  const raw = await page.evaluate(() => localStorage.getItem('foliohush.workspace.v1'))
  const second = await context.newPage()
  await second.goto('/')
  await expect(body(second)).toBeVisible()
  await expect(second.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  expect(await second.evaluate(() => localStorage.getItem('foliohush.workspace.v1'))).toBe(raw)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await body(page).fill('The original tab is still writable')
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('foliohush.workspace.v1')))
    .toContain('The original tab is still writable')
  await second.close()
})
