/* SPDX-License-Identifier: Apache-2.0 */
const { test, before } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const root = resolve(__dirname, '../../src/client/apps/sunstone/components/LayerSentry')
const load = async (name) => import('data:text/javascript;base64,' + Buffer.from(readFileSync(resolve(root, name), 'utf8')).toString('base64'))
let api, css
before(async () => { api = await load('presentation.js'); css = (await load('styles.js')).appearanceCss })

for (const [view, logged, layout, expected] of [
  ['cloud', true, false, true], ['cloud', false, false, false],
  ['admin', true, false, false], ['user', true, false, false],
  ['groupadmin', true, false, false], [undefined, true, false, false],
  ['cloud', true, true, false], ['cloud-admin', true, false, false],
  ['cloud', 'true', false, false], ['CLOUD', true, false, false],
]) test(`view gate: ${String(view)}, logged=${logged}, layoutDisabled=${layout}`, () => {
  assert.equal(api.isSelfServiceView(view, logged, layout), expected)
})

const freeze = (x) => {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.values(x).forEach(freeze); Object.freeze(x)
  }
  return x
}
const nativeComponent = () => null
const routes = freeze([{ title: 'Instances', icon: nativeComponent, position: 2, routes: [
  { path: '/vm', title: 'VMs', sidebar: true, Component: nativeComponent, permissions: { use: true } },
  { path: '/vm/create', title: 'Create VM', sidebar: false, Component: nativeComponent },
  { path: '/vm/:id', title: 'VM', Component: nativeComponent },
  { path: '/future-extension', title: 'Custom extension', sidebar: true },
]}, { path: '/guacamole/:id/:type', title: 'Guacamole', disableLayout: true }])
const undecorate = (items) => items.map(({ displayTitle, routes: nested, ...r }) => ({ ...r, ...(nested ? { routes: undecorate(nested) } : {}) }))

test('classic and non-cloud navigation keep the original array identity', () => {
  assert.equal(api.presentEndpoints(routes, false), routes)
})
test('cloud changes display copy, not routes, components, permissions or ordering', () => {
  const presented = api.presentEndpoints(routes, true)
  assert.deepEqual(undecorate(presented), routes)
  assert.equal(presented[0].routes[0].displayTitle, 'Virtual machines')
  assert.equal(presented[0].routes[0].title, 'VMs')
  assert.equal(presented[0].routes[0].Component, nativeComponent)
  assert.equal(presented[0].routes[0].permissions, routes[0].routes[0].permissions)
})
test('frozen native route definitions are not mutated', () => {
  api.presentEndpoints(routes, true)
  assert.equal(routes[0].routes[0].displayTitle, undefined)
})
test('hidden create routes and layout-free console routes remain hidden/layout-free', () => {
  const next = api.presentEndpoints(routes, true)
  assert.equal(next[0].routes[1].sidebar, false)
  assert.equal(next[1].disableLayout, true)
})
test('unknown extension routes are retained without invented replacement paths', () => {
  const next = api.presentEndpoints(routes, true)
  assert.deepEqual(next[0].routes[3], routes[0].routes[3])
  assert.equal(JSON.stringify(next).includes('/disaster-recovery'), false)
  assert.equal(JSON.stringify(next).includes('/plugins'), false)
})
test('missing route input is not replaced with permissive fallback routes', () => {
  assert.equal(api.presentEndpoints(undefined, true), undefined)
  assert.deepEqual(api.presentEndpoints([], true), [])
  assert.deepEqual(api.presentEndpoints([null], true), [null])
})
test('emergency URL option disables appearance only for the exact classic value', () => {
  assert.equal(api.classicRequested('?layersentry-ui=classic'), true)
  assert.equal(api.classicRequested('?id=7&layersentry-ui=classic'), true)
  for (const q of ['', '?layersentry-ui=admin', '?layersentry-ui=true', '?view=cloud']) assert.equal(api.classicRequested(q), false)
})
test('absent, blocked and unknown storage values cannot block app loading', () => {
  assert.equal(api.readAppearance(), true)
  assert.equal(api.readAppearance({ getItem() { throw new Error('denied') } }), true)
  assert.equal(api.readAppearance({ getItem() { return 'garbage' } }), true)
})
test('classic preference is respected without changing provider preferences', () => {
  let readKey
  assert.equal(api.readAppearance({ getItem(k) { readKey = k; return 'classic' } }), false)
  assert.equal(readKey, api.APPEARANCE_KEY)
})
test('appearance persistence writes only one product-specific non-secret key', () => {
  const calls = []
  const storage = { setItem(...args) { calls.push(args) } }
  assert.equal(api.writeAppearance(storage, false), true)
  assert.equal(api.writeAppearance(storage, true), true)
  assert.deepEqual(calls, [[api.APPEARANCE_KEY, 'classic'], [api.APPEARANCE_KEY, 'layersentry']])
})
test('failed persistence does not throw', () => {
  assert.equal(api.writeAppearance({ setItem() { throw new Error('quota') } }, true), false)
  assert.equal(api.writeAppearance(undefined, false), false)
})
const element = (initial = {}) => {
  const attrs = { ...initial }
  return { attrs, getAttribute(k) { return attrs[k] ?? null }, setAttribute(k, v) { attrs[k] = v }, removeAttribute(k) { delete attrs[k] } }
}
test('appearance scope is cleaned up after sign-out, view change or console entry', () => {
  const root = element({ 'data-native-mode': 'original' })
  const cleanup = api.installScope(root, 'light')
  assert.equal(root.getAttribute(api.SCOPE_ATTRIBUTE), 'light')
  cleanup()
  assert.deepEqual(root.attrs, { 'data-native-mode': 'original' })
})
test('scope cleanup restores an earlier attribute instead of clearing foreign state', () => {
  const root = element({ [api.SCOPE_ATTRIBUTE]: 'prior' })
  api.installScope(root, 'dark')()
  assert.equal(root.getAttribute(api.SCOPE_ATTRIBUTE), 'prior')
})
test('scope cleanup will not overwrite a newer decoration', () => {
  const root = element()
  const cleanup = api.installScope(root, 'light')
  root.setAttribute(api.SCOPE_ATTRIBUTE, 'newer')
  cleanup()
  assert.equal(root.getAttribute(api.SCOPE_ATTRIBUTE), 'newer')
})
test('SSR and unrecognized appearance modes are safe no-ops', () => {
  assert.doesNotThrow(api.installScope(null, 'light'))
  const root = element()
  api.installScope(root, 'invalid')()
  assert.deepEqual(root.attrs, {})
})
test('every CSS rule is explicitly scoped to the self-service attribute', () => {
  const rules = css.split('}').filter(s => s.trim())
  for (const rule of rules) {
    const [selectors] = rule.split('{')
    // Commas inside :is() belong to one compound selector.
    const expanded = selectors.replace(/:is\([^)]*\)/g, ':is-selector')
    for (const selector of expanded.split(',')) assert.match(selector.trim(), /^html\[data-layersentry-self-service/)
  }
})
test('native layout, table virtualization, dialogs and pointer behavior are not overridden', () => {
  assert.doesNotMatch(css, /(?:^|[;{])\s*(?:display|position|width|height|min-width|max-width|min-height|max-height|overflow(?:-x|-y)?|pointer-events|visibility|opacity|z-index|transform)\s*:/m)
})
test('the design ships no external fonts, image calls or CSS imports', () => {
  assert.doesNotMatch(css, /@import|url\s*\(|https?:/i)
})
test('focus styling and disabled-button distinction are retained', () => {
  assert.match(css, /:focus-visible/)
  assert.match(css, /\.Mui-disabled/)
  assert.doesNotMatch(css, /outline:\s*(?:none|0)/)
})
test('both light and dark native modes have explicit design tokens', () => {
  assert.match(css, /self-service="light"/)
  assert.match(css, /self-service="dark"/)
})
test('new components contain no provider API, simulation model, workspace import or fake session', () => {
  for (const file of ['presentation.js', 'index.js', 'styles.js', 'symbol.js']) {
    const source = readFileSync(resolve(root, file), 'utf8')
    assert.doesNotMatch(source, /fetch\s*\(|axios|XMLHttpRequest|WebSocket|useMutation|@FeaturesModule|eval\s*\(|innerHTML|dangerouslySetInnerHTML/)
    assert.doesNotMatch(source, /commerce-rke2|web-prod-01|Run UI rehearsal|oneadmin:/)
  }
})
