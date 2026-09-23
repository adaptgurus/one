/* SPDX-License-Identifier: Apache-2.0 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')
const { chromium } = require('playwright')

const expectedBlue = 'rgb(37, 99, 235)'
const root = path.join(__dirname, 'dist')

const serve = (request, response) => {
  const urlPath = request.url === '/' ? '/index.html' : request.url
  const file = path.join(root, urlPath.split('?')[0])
  if (!file.startsWith(root) || !fs.existsSync(file)) {
    response.writeHead(404)
    response.end('not found')
    return
  }
  const body = fs.readFileSync(file)
  response.writeHead(200, {
    'content-type': file.endsWith('.js')
      ? 'application/javascript'
      : 'text/html; charset=utf-8',
  })
  response.end(body)
}

const run = async () => {
  const evidenceDir = path.join(__dirname, 'evidence')
  fs.mkdirSync(evidenceDir, { recursive: true })
  const server = http.createServer(serve)
  await new Promise((resolve) => server.listen(4175, '127.0.0.1', resolve))

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
      failedRequests.push(request.url() + ' ' + (request.failure()?.errorText || ''))
    )

    const response = await page.goto('http://127.0.0.1:4175', {
      waitUntil: 'networkidle',
      timeout: 30000,
    })
    assert.equal(response.status(), 200)

    await page.getByText('Create Virtual Machine').waitFor()
    await page.getByText('Create virtual machine').waitFor()

    let text = await page.locator('body').innerText()
    for (const marker of [
      'LayerSentry',
      'Private Cloud',
      'Basics',
      'Operating System',
      'Size',
      'Storage',
      'Network',
      'Security',
      'Review',
      'From template',
      'Clone existing VM',
      'Rocky 9 Approved',
    ]) {
      assert.match(text, new RegExp(marker, 'i'), 'missing marker: ' + marker)
    }
    assert.doesNotMatch(text, /OpenNebula/i)
    assert.doesNotMatch(text, /Provider OneKS Template/i)
    assert.doesNotMatch(text, /Raw Image Template/i)

    const tabColors = await page.evaluate(() => {
      const selected = document.querySelector('.MuiTab-root.Mui-selected')
      const indicator = document.querySelector('.MuiTabs-indicator')
      return {
        selected: selected ? getComputedStyle(selected).color : '',
        indicator: indicator ? getComputedStyle(indicator).backgroundColor : '',
      }
    })
    assert.equal(tabColors.selected, expectedBlue)
    assert.equal(tabColors.indicator, expectedBlue)

    await page.screenshot({
      path: path.join(evidenceDir, 'vm-create-template-desktop.png'),
      fullPage: true,
    })

    await page.getByRole('tab', { name: 'Clone existing VM' }).click()
    text = await page.locator('body').innerText()
    assert.match(text, /web-01/)
    assert.match(text, /db-01/)
    assert.doesNotMatch(text, /oneks-worker/)
    assert.doesNotMatch(text, /OpenNebula/i)

    await page.getByTestId('row-201').click()
    let cloneButton = page.getByRole('button', { name: /Create clone and continue/i })
    assert.equal(await cloneButton.isDisabled(), true)

    await page.getByTestId('row-202').click()
    cloneButton = page.getByRole('button', { name: /Create clone and continue/i })
    assert.equal(await cloneButton.isDisabled(), false)

    const cloneName = page.getByLabel('Clone source template name')
    await cloneName.fill('db-01-copy')
    await cloneName.focus()
    const focused = await page.evaluate(() => {
      const label = [...document.querySelectorAll('.MuiInputLabel-root')].find(
        (node) => node.textContent === 'Clone source template name'
      )
      const root = label?.closest('.MuiFormControl-root')
      const outline = root?.querySelector('.MuiOutlinedInput-notchedOutline')
      return {
        label: label ? getComputedStyle(label).color : '',
        outline: outline ? getComputedStyle(outline).borderColor : '',
      }
    })
    assert.equal(focused.label, expectedBlue)
    assert.equal(focused.outline, expectedBlue)

    await cloneButton.click()
    await page.waitForFunction(() =>
      document
        .querySelector('[data-testid="location-probe"]')
        ?.textContent.includes('/vm-template/instantiate?template=999')
    )
    assert.deepEqual(
      await page.evaluate(() => window.__MANOJ_VM_QA__.cloneRequests),
      [{ id: 202, name: 'db-01-copy', persistent: false }]
    )

    await page.screenshot({
      path: path.join(evidenceDir, 'vm-create-clone-desktop.png'),
      fullPage: true,
    })

    await page.reload({ waitUntil: 'networkidle' })
    await page.getByTestId('row-101').click()
    await page.waitForFunction(() =>
      document
        .querySelector('[data-testid="location-probe"]')
        ?.textContent.includes('/vm-template/instantiate?template=101')
    )

    await page.setViewportSize({ width: 390, height: 844 })
    await page.reload({ waitUntil: 'networkidle' })
    const mobile = await page.evaluate(() => {
      const dialog = document.querySelector('.MuiDialog-paper')
      const rect = dialog?.getBoundingClientRect()
      return {
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        dialogLeft: rect?.left ?? -1,
        dialogRight: rect?.right ?? -1,
      }
    })
    assert.ok(mobile.scrollWidth <= mobile.innerWidth)
    assert.ok(mobile.dialogLeft >= 0)
    assert.ok(mobile.dialogRight <= mobile.innerWidth)

    await page.screenshot({
      path: path.join(evidenceDir, 'vm-create-mobile.png'),
      fullPage: true,
    })

    assert.deepEqual(pageErrors, [])
    assert.deepEqual(consoleErrors, [])
    assert.deepEqual(failedRequests, [])

    fs.writeFileSync(
      path.join(evidenceDir, 'evidence.json'),
      JSON.stringify(
        {
          qualifiedHead: process.env.QUALIFIED_HEAD || '',
          runner: process.env.RUNNER_NAME || '',
          tabColors,
          focused,
          mobile,
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
    await new Promise((resolve) => server.close(resolve))
  }
}

run().catch((error) => {
  console.error(error.stack || error)
  process.exitCode = 1
})
