import { chromium, devices, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

// Uses isolated, disposable browser storage and synthetic writing only.
const url = 'https://loufengzh.github.io/foliohush/'
await mkdir('live-test-results', { recursive: true })
const browser = await chromium.launch()
try {
  for (const [name, device] of [
    ['desktop', { viewport: { width: 1440, height: 1100 } }],
    ['mobile', devices['Pixel 7']],
  ]) {
    const context = await browser.newContext(device)
    const page = await context.newPage()
    const errors = []
    let agentRequests = 0
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/api/agent**', (route) => {
      agentRequests++
      return route.abort()
    })
    await page.goto(url, { waitUntil: 'networkidle' })
    const menu = page.getByRole('button', { name: 'Open document sidebar' })
    if (await menu.isVisible()) await menu.click()
    await page.getByRole('button', { name: /New document/ }).click()
    const body = page.getByRole('textbox', { name: 'Document body' })
    await body.fill('# A calm beginning\n\nA little room for a new thought.')
    await page.getByRole('button', { name: 'Writing assistant', exact: true }).click()
    await page.getByRole('button', { name: 'Preview suggestion' }).click()
    await expect(page.getByRole('region', { name: 'Suggestion preview' })).toContainText(
      'A calm beginning',
    )
    await page.waitForTimeout(4600) // Let the transient new-document notice fade.
    await page.screenshot({ path: `live-test-results/${name}-assistant.png`, fullPage: true })
    await page.getByRole('button', { name: 'Apply suggestion' }).click()
    await page.getByRole('button', { name: 'Close writing assistant' }).click()
    await expect(body.locator('h2')).toHaveText('A calm beginning')
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(body).toContainText('# A calm beginning')
    await page.reload()
    await expect(body).toContainText('# A calm beginning')
    await expect(page.getByRole('button', { name: 'Writing assistant', exact: true })).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    expect(agentRequests).toBe(0)
    expect(errors).toEqual([])
    console.log(
      `${name}: public deployment preview, apply, undo, persistence, layout, and offline privacy passed`,
    )
    await context.close()
  }
} finally {
  await browser.close()
}
