import type { Editor } from '@tiptap/react'
import { test, expect, type Page, type TestInfo } from '@playwright/test'
import { THEMES, THEME_STORAGE_KEY } from '../src/lib/themes'

const WORKSPACE_KEY = 'foliohush.workspace.v1'
const editorBody = (page: Page) => page.getByRole('textbox', { name: 'Document body' })
const appearance = (page: Page) => page.getByRole('button', { name: 'Appearance', exact: true })
const picker = (page: Page) => page.getByRole('dialog', { name: 'Make room for your words' })

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready)
  const path = testInfo.outputPath(`${name}.png`)
  await page.screenshot({ path, fullPage: true, animations: 'disabled' })
  await testInfo.attach(name, { path, contentType: 'image/png' })
}

function luminance(color: string) {
  const channels = color.startsWith('#')
    ? [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16) / 255)
    : color
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map((channel) => Number(channel) / 255)
  const linear = channels.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  )
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
}

function contrast(first: string, second: string) {
  const [dark, light] = [luminance(first), luminance(second)].sort((a, b) => a - b)
  return (light + 0.05) / (dark + 0.05)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(editorBody(page)).toBeVisible()
})

for (const theme of THEMES) {
  test(`${theme.name}: applies accessible colors, persists, and has no layout overflow`, async ({
    page,
  }, testInfo) => {
    const initialWorkspace = await page.evaluate((key) => localStorage.getItem(key), WORKSPACE_KEY)
    await appearance(page).click()
    await picker(page).getByRole('button', { name: theme.name, exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme.id)
    await expect(
      picker(page).getByRole('button', { name: theme.name, exact: true }),
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(picker(page).locator('button[aria-pressed="true"]')).toHaveCount(1)

    const resolved = await page.evaluate((names) => {
      const root = getComputedStyle(document.documentElement)
      return {
        scheme: root.colorScheme,
        tokens: Object.fromEntries(
          names.map((name) => [name, root.getPropertyValue(`--${name}`).trim()]),
        ),
      }
    }, Object.keys(theme.tokens))
    expect(resolved.scheme).toBe(theme.mode)
    expect(resolved.tokens).toEqual(theme.tokens)
    for (const surface of ['paper', 'sidebar', 'surface', 'raised']) {
      for (const text of ['ink', 'muted', 'accent']) {
        expect(
          contrast(resolved.tokens[text], resolved.tokens[surface]),
          `${theme.name}: ${text} text on ${surface}`,
        ).toBeGreaterThanOrEqual(4.5)
      }
      expect(
        contrast(resolved.tokens.focus, resolved.tokens[surface]),
        `${theme.name}: focus indicator on ${surface}`,
      ).toBeGreaterThanOrEqual(3)
    }
    for (const [foreground, background] of [
      ['on-accent', 'accent'],
      ['on-highlight', 'highlight'],
      ['error', 'error-bg'],
      ['ink', 'selection'],
    ]) {
      expect(
        contrast(resolved.tokens[foreground], resolved.tokens[background]),
        `${theme.name}: ${foreground} on ${background}`,
      ).toBeGreaterThanOrEqual(4.5)
    }

    await expect(picker(page)).toBeVisible()
    const bounds = await picker(page).boundingBox()
    const viewport = page.viewportSize()!
    expect(bounds).not.toBeNull()
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1)
    expect(bounds!.height).toBeLessThanOrEqual(viewport.height + 1)
    await capture(page, testInfo, `${theme.id}-picker`)
    await picker(page).getByRole('button', { name: 'Close dialog' }).click()
    await expect(editorBody(page)).toContainText('Make room for the first sentence')
    expect(await page.evaluate((key) => localStorage.getItem(key), WORKSPACE_KEY)).toBe(
      initialWorkspace,
    )
    expect(await page.evaluate((key) => localStorage.getItem(key), THEME_STORAGE_KEY)).toBe(
      theme.id,
    )
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await capture(page, testInfo, `${theme.id}-workspace`)
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme.id)
    await expect(editorBody(page)).toBeVisible()
    expect(await page.evaluate((key) => localStorage.getItem(key), WORKSPACE_KEY)).toBe(
      initialWorkspace,
    )
  })
}

test('system preference responds to OS changes and explicit choices stay fixed', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await appearance(page).click()
  await picker(page).getByRole('button', { name: 'Follow system', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'botanical')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'midnight')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'midnight')
  await appearance(page).click()
  await expect(picker(page).getByRole('button', { name: 'Follow system' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await picker(page).getByRole('button', { name: 'Parchment', exact: true }).click()
  await page.emulateMedia({ colorScheme: 'light' })
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'parchment')
})

test('invalid stored preference falls back without losing the saved draft', async ({ page }) => {
  await page.getByLabel('Document title').fill('Saved before a broken preference')
  await editorBody(page).fill('These words survive an invalid theme.')
  const initialWorkspace = await page.evaluate((key) => localStorage.getItem(key), WORKSPACE_KEY)
  await page.evaluate((key) => localStorage.setItem(key, '{invalid'), THEME_STORAGE_KEY)
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'botanical')
  await expect(page.getByLabel('Document title')).toHaveValue('Saved before a broken preference')
  await expect(editorBody(page)).toHaveText('These words survive an invalid theme.')
  expect(await page.evaluate((key) => localStorage.getItem(key), WORKSPACE_KEY)).toBe(
    initialWorkspace,
  )
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('real cross-tab appearance sync leaves the workspace writable and unchanged', async ({
  page,
  context,
}) => {
  const second = await context.newPage()
  await second.goto('/')
  await expect(editorBody(second)).toBeVisible()
  const initialWorkspace = await page.evaluate((key) => localStorage.getItem(key), WORKSPACE_KEY)
  await appearance(second).click()
  await picker(second).getByRole('button', { name: 'Forest', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'forest')
  await expect(second.locator('html')).toHaveAttribute('data-theme', 'forest')
  expect(await page.evaluate((key) => localStorage.getItem(key), WORKSPACE_KEY)).toBe(
    initialWorkspace,
  )
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(second.getByRole('alert')).toHaveCount(0)
  await second.close()
  await editorBody(page).fill('Still saving after another tab changed the theme.')
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), WORKSPACE_KEY))
    .toContain('Still saving after another tab changed the theme.')
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('theme changes preserve editor selection, document state, and undo history', async ({
  page,
}) => {
  await editorBody(page).fill('A draft with an undo history.')
  const state = await editorBody(page).evaluate((element) => {
    const editor = (element as HTMLElement & { editor: Editor }).editor
    editor.commands.setTextSelection({ from: 3, to: 8 })
    return { content: editor.getJSON(), selection: editor.state.selection.toJSON() }
  })
  const workspace = await page.evaluate((key) => localStorage.getItem(key), WORKSPACE_KEY)
  await appearance(page).click()
  for (const theme of THEMES) {
    await picker(page).getByRole('button', { name: theme.name, exact: true }).click()
    expect(
      await editorBody(page).evaluate((element) => {
        const editor = (element as HTMLElement & { editor: Editor }).editor
        return { content: editor.getJSON(), selection: editor.state.selection.toJSON() }
      }),
    ).toEqual(state)
  }
  await page.keyboard.press('Escape')
  expect(await page.evaluate((key) => localStorage.getItem(key), WORKSPACE_KEY)).toBe(workspace)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(editorBody(page)).not.toHaveText('A draft with an undo history.')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(editorBody(page)).toHaveText('A draft with an undo history.')
})

test('keyboard focus stays in the picker and returns to Appearance after repeated dismissal', async ({
  page,
}) => {
  for (let count = 0; count < 3; count++) {
    await appearance(page).focus()
    await page.keyboard.press('Enter')
    await expect(picker(page)).toBeVisible()
    await expect(picker(page).getByRole('button', { name: 'Close dialog' })).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(picker(page).getByRole('button', { name: 'Follow system' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(picker(page).getByRole('button', { name: 'Close dialog' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(picker(page).getByRole('button', { name: 'Botanical', exact: true })).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Escape')
    await expect(picker(page)).toHaveCount(0)
    await expect(appearance(page)).toBeFocused()
  }
})

test('reduced motion keeps appearance controls and editing usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await appearance(page).click()
  await picker(page).getByRole('button', { name: 'Midnight', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'midnight')
  await editorBody(page).fill('A quiet change, with reduced motion.')
  await expect(editorBody(page)).toHaveText('A quiet change, with reduced motion.')
})

test('bubble toolbar keyboard focus contrasts against each actual theme background', async ({
  page,
}) => {
  for (const theme of THEMES) {
    await appearance(page).click()
    await picker(page).getByRole('button', { name: theme.name, exact: true }).click()
    await page.keyboard.press('Escape')
    await editorBody(page).evaluate((element) => {
      const editor = (element as HTMLElement & { editor: Editor }).editor
      editor.commands.setContent('<p>Focus stays visible.</p>')
    })
    await editorBody(page).press('ControlOrMeta+a')
    const toolbar = page.getByRole('toolbar', { name: 'Format selected text' })
    await expect(toolbar).toBeVisible()
    const bold = toolbar.getByRole('button', { name: 'Bold', exact: true })
    for (const active of [false, true]) {
      if (active) await bold.press('Enter')
      await bold.focus()
      await expect(bold).toBeFocused()
      await expect(bold).toHaveAttribute('aria-pressed', String(active))
      const style = await bold.evaluate((element) => {
        const computed = getComputedStyle(element)
        let surface: Element | null = element
        let background = computed.backgroundColor
        while (surface && (background === 'transparent' || background === 'rgba(0, 0, 0, 0)')) {
          surface = surface.parentElement
          if (surface) background = getComputedStyle(surface).backgroundColor
        }
        return {
          focusVisible: element.matches(':focus-visible'),
          shadow: computed.boxShadow,
          color: computed.color,
          background,
        }
      })
      expect(style.focusVisible, `${theme.name}: keyboard focus is visible`).toBe(true)
      expect(style.shadow).toContain('inset')
      const ringColor = style.shadow.match(/rgba?\([^)]+\)/)?.[0]
      expect(ringColor, `${theme.name}: focus ring has a computed color`).toBe(style.color)
      expect(
        contrast(ringColor!, style.background),
        `${theme.name}: ${active ? 'active' : 'inactive'} toolbar focus ring`,
      ).toBeGreaterThanOrEqual(3)
    }
  }
})

test('dark themes print code and list markers with readable ink on light surfaces', async ({
  page,
}) => {
  await editorBody(page).evaluate((element) => {
    const editor = (element as HTMLElement & { editor: Editor }).editor
    editor.commands.setContent(
      '<p>Inline <code>readable()</code> code.</p><pre><code>print("hello")</code></pre>' +
        '<ul><li><p>A printed list item.</p></li></ul>',
    )
  })
  for (const theme of THEMES.filter((item) => item.mode === 'dark')) {
    await appearance(page).click()
    await picker(page).getByRole('button', { name: theme.name, exact: true }).click()
    await page.keyboard.press('Escape')
    await page.emulateMedia({ media: 'print' })
    const printed = await editorBody(page).evaluate((element) => {
      const pre = getComputedStyle(element.querySelector('pre')!)
      const inlineCode = getComputedStyle(element.querySelector('p > code')!)
      const codeBlock = getComputedStyle(element.querySelector('pre > code')!)
      return {
        canvas: getComputedStyle(document.documentElement).backgroundColor,
        body: getComputedStyle(document.body).backgroundColor,
        pre: { foreground: pre.color, background: pre.backgroundColor },
        inlineCode: { foreground: inlineCode.color, background: inlineCode.backgroundColor },
        codeBlock: { foreground: codeBlock.color, background: codeBlock.backgroundColor },
        marker: getComputedStyle(element.querySelector('li')!, '::marker').color,
      }
    })
    expect(printed.canvas).toBe('rgb(255, 255, 255)')
    expect(printed.body).toBe('rgb(255, 255, 255)')
    for (const [name, style] of Object.entries({
      pre: printed.pre,
      inlineCode: printed.inlineCode,
      codeBlock: printed.codeBlock,
    })) {
      expect(
        contrast(style.foreground, style.background),
        `${theme.name}: printed ${name}`,
      ).toBeGreaterThanOrEqual(4.5)
    }
    expect(
      contrast(printed.marker, printed.body),
      `${theme.name}: printed list marker`,
    ).toBeGreaterThanOrEqual(4.5)
    await page.emulateMedia({ media: 'screen' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme.id)
  }
})
