/* SPDX-License-Identifier: Apache-2.0 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')

const expectedBlue = 'rgb(37, 99, 235)'
const expectedSuccess = 'rgb(4, 120, 87)'
const expectedSuccessSoft = 'rgb(236, 253, 245)'

const run = async () => {
  const output = path.join(__dirname, 'evidence')
  fs.mkdirSync(output, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
    const pageErrors = []
    const consoleErrors = []
    const failedRequests = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    page.on('requestfailed', (request) =>
      failedRequests.push(
        `${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`
      )
    )

    const response = await page.goto('http://127.0.0.1:4174', {
      waitUntil: 'networkidle',
      timeout: 30000,
    })
    assert.equal(response.status(), 200)
    await page.getByText('LayerSentry browser qualification').waitFor()

    const text = await page.locator('body').innerText()
    for (const marker of [
      'LayerSentry',
      'Private Cloud',
      'Overview',
      'Compute',
      'DBaaS',
      'APaaS',
      'Storage',
      'Networks',
      'Firewall Rules',
      'Backup Plans',
      'Recovery Points',
      'Super Admin',
      'QA Project',
    ]) {
      assert.match(text, new RegExp(marker, 'i'), 'missing visible marker: ' + marker)
    }
    assert.doesNotMatch(text, /OpenNebula/i)

    const styles = await page.evaluate(() => {
      const primary = document.querySelector('[data-testid="qa-primary"]')
      const outlined = document.querySelector('[data-testid="qa-outlined"]')
      const surface = document.querySelector('[data-testid="qa-surface"]')
      const chip = [...document.querySelectorAll('.MuiChip-root')].find(
        (node) => node.textContent === 'Ready'
      )
      const checkedSwitch = document.querySelector(
        '[data-testid="qa-switch"].Mui-checked'
      )
      const checkedCheckbox = document.querySelector(
        '[data-testid="qa-checkbox"].Mui-checked'
      )
      const checkedRadio = document.querySelector(
        '[data-testid="qa-radio"].Mui-checked'
      )
      const activeStep = document.querySelector('.MuiStepIcon-root.Mui-active')
      const completedStep = document.querySelector(
        '.MuiStepIcon-root.Mui-completed'
      )
      return {
        bodyBackground: getComputedStyle(document.body).backgroundColor,
        primaryBackground: getComputedStyle(primary).backgroundColor,
        primaryRadius: getComputedStyle(primary).borderRadius,
        outlinedRadius: getComputedStyle(outlined).borderRadius,
        surfaceBackground: getComputedStyle(surface).backgroundColor,
        chipColor: getComputedStyle(chip).color,
        chipBackground: getComputedStyle(chip).backgroundColor,
        switchColor: checkedSwitch ? getComputedStyle(checkedSwitch).color : '',
        checkboxColor: checkedCheckbox
          ? getComputedStyle(checkedCheckbox).color
          : '',
        radioColor: checkedRadio ? getComputedStyle(checkedRadio).color : '',
        activeStepColor: activeStep ? getComputedStyle(activeStep).color : '',
        completedStepColor: completedStep
          ? getComputedStyle(completedStep).color
          : '',
      }
    })

    assert.equal(styles.primaryBackground, expectedBlue)
    assert.equal(styles.primaryRadius, '6px')
    assert.equal(styles.outlinedRadius, '6px')
    assert.equal(styles.surfaceBackground, 'rgb(255, 255, 255)')
    assert.equal(styles.chipColor, expectedSuccess)
    assert.equal(styles.chipBackground, expectedSuccessSoft)
    for (const [name, value] of Object.entries({
      switchColor: styles.switchColor,
      checkboxColor: styles.checkboxColor,
      radioColor: styles.radioColor,
      activeStepColor: styles.activeStepColor,
      completedStepColor: styles.completedStepColor,
    })) {
      assert.equal(value, expectedBlue, name)
    }

    const input = page.getByLabel('Service name')
    await input.focus()
    const focused = await page.evaluate(() => {
      const root = document
        .querySelector('[data-testid="qa-input"]')
        .closest('.MuiFormControl-root')
      const outline = root.querySelector('.MuiOutlinedInput-notchedOutline')
      const label = root.querySelector('.MuiInputLabel-root')
      return {
        outlineColor: getComputedStyle(outline).borderColor,
        outlineWidth: getComputedStyle(outline).borderWidth,
        labelColor: getComputedStyle(label).color,
      }
    })
    assert.equal(focused.outlineColor, expectedBlue)
    assert.equal(focused.outlineWidth, '2px')
    assert.equal(focused.labelColor, expectedBlue)

    await page.getByLabel('Switch role').click()
    await page.getByRole('option', { name: 'Cloud User' }).click()
    assert.deepEqual(
      await page.evaluate(() => window.__LAYERSENTRY_BROWSER_QA__.viewChanges),
      ['cloud']
    )
    await page.getByText('Switch account').click()
    assert.equal(
      await page.evaluate(() => window.__LAYERSENTRY_BROWSER_QA__.logoutCalls),
      1
    )

    await page.screenshot({
      path: path.join(output, 'desktop.png'),
      fullPage: true,
    })

    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(250)
    const mobileBefore = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      asideDisplay: getComputedStyle(document.querySelector('aside')).display,
    }))
    assert.ok(mobileBefore.scrollWidth <= mobileBefore.innerWidth)
    assert.equal(mobileBefore.asideDisplay, 'none')

    await page.getByRole('button', { name: 'Open navigation' }).click()
    const mobileOpen = await page.evaluate(() => {
      const aside = document.querySelector('aside')
      const overlay = document.querySelector('[role="presentation"]')
      return {
        asideDisplay: getComputedStyle(aside).display,
        overlayBackground: overlay
          ? getComputedStyle(overlay).backgroundColor
          : '',
        overflow: document.documentElement.scrollWidth > window.innerWidth,
      }
    })
    assert.equal(mobileOpen.asideDisplay, 'flex')
    assert.equal(mobileOpen.overlayBackground, 'rgba(15, 23, 42, 0.45)')
    assert.equal(mobileOpen.overflow, false)

    await page.screenshot({
      path: path.join(output, 'mobile-navigation.png'),
      fullPage: true,
    })

    assert.deepEqual(pageErrors, [])
    assert.deepEqual(consoleErrors, [])
    assert.deepEqual(failedRequests, [])

    fs.writeFileSync(
      path.join(output, 'evidence.json'),
      JSON.stringify(
        {
          http: response.status(),
          head: process.env.QUALIFIED_HEAD || '',
          desktop: styles,
          focused,
          mobileBefore,
          mobileOpen,
          pageErrors,
          consoleErrors,
          failedRequests,
        },
        null,
        2
      )
    )
  } finally {
    await browser.close()
  }
}

run().catch((error) => {
  console.error(error.stack || error)
  process.exitCode = 1
})
