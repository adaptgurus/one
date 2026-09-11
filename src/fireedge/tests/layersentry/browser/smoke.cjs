/* SPDX-License-Identifier: Apache-2.0 */
const assert = require('node:assert/strict')
const { chromium } = require('playwright')

const waitForScope = async (page, browserErrors, expected) => {
  try {
    await page.waitForFunction(
      (mode) =>
        document.documentElement.getAttribute('data-layersentry-self-service') ===
        mode,
      expected,
      { timeout: 10000 }
    )
  } catch (error) {
    const diagnostics = await page.evaluate(() => ({
      readyState: document.readyState,
      scope: document.documentElement.getAttribute(
        'data-layersentry-self-service'
      ),
      root: document.getElementById('root')?.innerText ?? '',
      scripts: [...document.scripts].map((script) => script.src),
    }))

    throw new Error(
      `LayerSentry browser scope did not become ${expected}. ` +
        `diagnostics=${JSON.stringify(diagnostics)} ` +
        `browserErrors=${JSON.stringify(browserErrors)}; ` +
        `original=${error.message}`
    )
  }
}

const run = async () => {
  let browser

  try {
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const browserErrors = []

    page.on('pageerror', (error) => browserErrors.push(`page: ${error.message}`))
    page.on('console', (message) => {
      if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`)
    })

    await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' })
    await waitForScope(page, browserErrors, 'light')

    assert.match(await page.locator('#root').innerText(), /LAYER\s*SENTRY/)
    assert.equal(
      await page.evaluate(() =>
        document.documentElement.getAttribute('data-layersentry-self-service')
      ),
      'light'
    )

    const styled = await page.evaluate(() => ({
      body: getComputedStyle(document.body).backgroundColor,
      buttonRadius: getComputedStyle(document.querySelector('#mui-primary')).borderRadius,
      paperRadius: getComputedStyle(document.querySelector('#ls-paper')).borderRadius,
    }))
    assert.equal(styled.body, 'rgb(245, 247, 251)')
    assert.equal(styled.buttonRadius, '8px')
    assert.equal(styled.paperRadius, '12px')

    await page.locator('#draft-input').fill('unsaved customer value')
    await page.getByRole('button', { name: 'Use classic appearance' }).click()
    assert.equal(
      await page.evaluate(() =>
        document.documentElement.hasAttribute('data-layersentry-self-service')
      ),
      false
    )
    assert.equal(
      await page.locator('#draft-input').inputValue(),
      'unsaved customer value'
    )

    await page.getByRole('button', { name: 'Use LayerSentry appearance' }).click()
    await page.locator('#theme-toggle').click()
    await waitForScope(page, browserErrors, 'dark')
    assert.equal(
      await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
      'rgb(16, 24, 39)'
    )

    await page.locator('body').click({ position: { x: 5, y: 5 } })
    for (let index = 0; index < 8; index += 1) {
      await page.keyboard.press('Tab')
      if ((await page.evaluate(() => document.activeElement?.id)) === 'draft-input') {
        break
      }
    }
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'draft-input')
    assert.equal(
      await page.evaluate(() => getComputedStyle(document.activeElement).outlineWidth),
      '3px'
    )

    const evidence = await page.evaluate(
      () => window.__LAYERSENTRY_BROWSER_EVIDENCE__
    )
    assert.equal(evidence.protectionEvidence.REQUEST_STATE, 'REQUESTED_NOT_ACTIVE')
    assert.equal(evidence.gpuProfiles[0].pci.SHORT_ADDRESS, undefined)
    assert.equal(evidence.gpuEvidence.valid, true)
    assert.equal(evidence.gpuEvidence.pci.length, 2)
    assert.equal(
      evidence.gpuEvidence.pci[0].PROFILE,
      '1146 (NVIDIA L40S-2B)'
    )
    assert.equal(evidence.attentionEvidence[0].severity, 'error')
    assert.equal(evidence.attentionEvidence[1].severity, 'warning')

    await page.setViewportSize({ width: 375, height: 812 })
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      ),
      true
    )

    assert.deepEqual(browserErrors, [])
    await page.screenshot({
      path: 'tests/layersentry/browser/browser-smoke.png',
      fullPage: true,
    })
  } finally {
    await browser?.close()
  }
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
