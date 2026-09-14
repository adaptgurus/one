/* SPDX-License-Identifier: Apache-2.0 */
// Shallow source-contract tests with explicit React/router/MUI test doubles.
// These are NOT a live browser, native API test, or full FireEdge bundle build.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const crypto = require('node:crypto')
const appRoot = path.resolve(__dirname, '../../src/client/apps/sunstone')
const sideRoot = path.resolve(__dirname, '../../src/modules/components/primitives/Sidebar/Default')
const fixture = name => fs.readFileSync(path.join(__dirname, 'fixtures', name + '.base.txt'), 'utf8')
const native = { app: fixture('app'), sidebar: fixture('sidebar'), item: fixture('sidebarItem') }
const changed = {
  app: fs.readFileSync(path.join(appRoot, '_app.js'), 'utf8'),
  sidebar: fs.readFileSync(path.join(sideRoot, 'index.js'), 'utf8'),
  item: fs.readFileSync(path.join(sideRoot, 'sidebarItem.js'), 'utf8'),
}
let transpile, compilerName
try {
  const babel = require('@babel/core')
  transpile = source => babel.transformSync(source, {
    babelrc: false, configFile: false,
    presets: [[require.resolve('@babel/preset-env'), { targets: { node: '18' } }], [require.resolve('@babel/preset-react'), { runtime: 'automatic' }]],
  }).code
  compilerName = 'repository Babel toolchain'
} catch (error) {
  if (process.env.LAYERSENTRY_TEST_TYPESCRIPT !== '1') throw error
  const ts = require('typescript')
  transpile = source => {
    const r = ts.transpileModule(source, { fileName: 'source.tsx', reportDiagnostics: true,
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } })
    assert.equal((r.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0)
    return r.outputText
  }
  compilerName = 'local TypeScript syntax/shallow-test fallback (not webpack)'
}
console.log('Contract-test compiler: ' + compilerName)
const jsx = (type, props, key) => ({ type, props: props || {}, key })
const matchPath = (pathname, { path: pattern }) => new RegExp('^' + pattern.replace(/:[^/]+/g, '[^/]+') + '$').test(pathname)
const markers = Object.fromEntries(['AuthLayout','ModalHost','Notifier','NotifierUpload','Sidebar','Router','SelfServiceAppearance','LayerSentryLogo','AppearanceSwitch','OpenNebulaLogo','SidebarUserMenu','SidebarRoleMenu','SidebarItem','Button'].map(k => [k, k]))
const permissionRoutes = [{ title: 'Instances', routes: [{ title: 'VMs', path: '/vm', sidebar: true, Component: 'VmPage', permissions: { native: true } }] }]
const fixedEndpoints = [{ title: 'Dashboard', path: '/dashboard', Component: 'Dashboard' }, { title: 'Guacamole', path: '/guacamole/:id/:type', Component: 'Console', disableLayout: true }]
const runtime = (options = {}) => {
  const state = [], calls = [], effects = []
  let cursor = 0
  const store = new Map(options.classic ? [['layersentry.selfService.appearance.v1', 'classic']] : [])
  const storage = { getItem: k => store.get(k) || null, setItem: (k,v) => store.set(k,v) }
  const react = {
    Fragment: 'Fragment', useMemo: fn => fn(), useEffect: fn => effects.push(fn), useRef: () => ({ current: null }),
    forwardRef: fn => props => fn(props, null),
    useState: init => { const i=cursor++; if (!(i in state)) state[i]=typeof init==='function'?init():init; return [state[i], v => {state[i]=typeof v==='function'?v(state[i]):v}] },
  }
  const deps = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-router-dom': { matchPath, Link: 'Link', useLocation: () => ({ pathname: options.pathname || '/vm', search: options.search || '' }), useHistory: () => ({ push: p => calls.push(['push',p]) }) },
    '@UtilsModule': { isDevelopment: () => false, processTabManifest: x => x, renderIcon: (type,props) => jsx(type,props) },
    '@ConstantsModule': { _APPS: { sunstone: 'sunstone' }, SERVER_CONFIG: {}, PATH: { SUPPORT: '/support', DASHBOARD: '/dashboard' }, RESOURCE_NAMES: { DASHBOARD: 'dashboard' }, T: { Dashboard: 'Dashboard', ToggleFixedMenu: 'Toggle menu' } },
    '@FeaturesModule': {
      oneApi: { endpoints: { getOneConfig: 'configSubscription', getSunstoneViews: 'viewSubscription' } },
      SupportAPI: { useLazyCheckOfficialSupportQuery: () => { calls.push(['supportQueryHook']); return [() => calls.push(['getSupport']), { isSuccess: false }] } },
      SystemAPI: { useGetTabManifestQuery: () => { calls.push(['manifestQueryHook']); return { data: permissionRoutes, isSuccess: true, isLoading: false } } },
      useAuth: () => ({ isLogged: options.logged ?? true, externalRedirect: options.externalRedirect }),
      useGeneralApi: () => ({ changeAppTitle: x => calls.push(['title',x]), fixMenu: x => calls.push(['fixMenu',x]) }),
      useViews: () => ({ views: { [options.view || 'cloud']: {} }, view: options.view || 'cloud' }),
    },
    '@ProvidersModule': { useTranslation: () => ({ translate: title => options.translations?.[title] ?? title }) },
    '@ComponentsModule': { Sidebar: markers.Sidebar },
    '@mui/material': { Box: 'Box', Drawer: 'Drawer', List: 'List', Collapse: 'Collapse', Typography: 'Typography', GlobalStyles: 'GlobalStyles', useTheme: () => ({ palette: { mode: options.mode || 'light' } }) },
    'iconoir-react': {},
    'prop-types': new Proxy(() => {}, { get: () => new Proxy(() => {}, { get: () => () => {} }) }),
    'client/apps/sunstone/components/AuthLayout': { default: markers.AuthLayout, __esModule: true },
    'client/apps/sunstone/components/ModalHost': { default: markers.ModalHost, __esModule: true },
    'client/apps/sunstone/components/Notifier': { default: markers.Notifier, NotifierUpload: markers.NotifierUpload, __esModule: true },
    'client/apps/sunstone/components/LayerSentry': { SelfServiceAppearance: markers.SelfServiceAppearance, LayerSentryLogo: markers.LayerSentryLogo, AppearanceSwitch: markers.AppearanceSwitch },
    'client/apps/sunstone/routes': { ENDPOINTS: fixedEndpoints, getEndpointsByView: (view, manifest) => manifest },
    'client/router': { default: markers.Router, __esModule: true }, 'client/router/dev': { ENDPOINTS: [] },
    '@modules/components/primitives/Sidebar/Default/styles': { getStyles: () => ({}) },
    '@modules/components/primitives/Sidebar/Default/sidebarItem': { SidebarItem: markers.SidebarItem },
    '@modules/components/composed/OpenNebulaLogo': { OpenNebulaLogo: markers.OpenNebulaLogo },
    '@modules/components/primitives/Sidebar/Default/userMenu': { SidebarUserMenu: markers.SidebarUserMenu },
    '@modules/components/primitives/Sidebar/Default/roleMenu': { SidebarRoleMenu: markers.SidebarRoleMenu },
    '@modules/components/primitives/Buttons': { Button: markers.Button },
  }
  const load = source => {
    const module = { exports: {} }
    vm.runInNewContext(transpile(source), { module, exports: module.exports, require: name => {
      if (!(name in deps)) throw new Error('Unexpected dependency: ' + name)
      return deps[name]
    }, window: { localStorage: storage }, URLSearchParams, console, document: {} })
    return module.exports
  }
  deps['client/apps/sunstone/components/LayerSentry/presentation'] = load(fs.readFileSync(path.join(appRoot, 'components/LayerSentry/presentation.js'),'utf8'))
  return { calls, state, store, effects, load, render: (component, props) => {cursor=0; return component(props)}, deps }
}
const visit = (tree, type) => {
  if (!tree || typeof tree !== 'object') return []
  if (Array.isArray(tree)) return tree.flatMap(x => visit(x,type))
  return [...(tree.type === type ? [tree] : []), ...visit(tree.props?.children,type)]
}
const plain = x => JSON.parse(JSON.stringify(x))
const stripLabels = list => list.map(({displayTitle, routes, ...rest}) => ({...rest, ...(routes?{routes:stripLabels(routes)}:{})}))

test('baseline fixtures match the exact reviewed Git blobs', () => {
  const expected = {app:'714918d7a0ec58086ea4e01434881ec161cc0b99', sidebar:'87fc9dc88e6dc234538abba1d6d02622fd6ed519', item:'2593f04c763bb40898bc8b89d6d526b3cc68aa7b'}
  for (const [key,text] of Object.entries(native)) {
    const b=Buffer.from(text); const sha=crypto.createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex')
    assert.equal(sha,expected[key])
  }
})
for (const options of [
  {view:'cloud'}, {view:'admin'}, {view:'user'}, {view:'groupadmin'},
  {view:'cloud',logged:false}, {view:'cloud',pathname:'/guacamole/7/vnc'},
  {view:'cloud',search:'?layersentry-ui=classic'}, {view:'cloud',classic:true},
  {view:'cloud',externalRedirect:'/vm/42'},
]) test('native route/subscription/action-host contract: '+JSON.stringify(options), () => {
  const before=runtime(options), after=runtime(options)
  const a=before.render(before.load(native.app).default), b=after.render(after.load(changed.app).default)
  assert.deepEqual(plain(visit(a,markers.Router)[0].props),plain(visit(b,markers.Router)[0].props))
  assert.deepEqual(plain(visit(a,markers.AuthLayout)[0].props.subscriptions),plain(visit(b,markers.AuthLayout)[0].props.subscriptions))
  for(const type of ['Notifier','NotifierUpload','ModalHost','Sidebar']) assert.equal(visit(a,markers[type]).length,visit(b,markers[type]).length,type)
  if (visit(a,markers.Sidebar).length) assert.deepEqual(plain(visit(a,markers.Sidebar)[0].props.endpoints),plain(stripLabels(visit(b,markers.Sidebar)[0].props.endpoints)))
  assert.deepEqual(before.calls,after.calls)
})
test('appearance toggle retains the native route and modal component types without navigation', () => {
  const ctx=runtime({view:'cloud'}), App=ctx.load(changed.app).default
  const first=ctx.render(App)
  const Sidebar=visit(first,markers.Sidebar)[0]
  Sidebar.props.footerContent({expanded:true}).props.onToggle()
  const second=ctx.render(App)
  assert.equal(visit(first,markers.Router)[0].type,visit(second,markers.Router)[0].type)
  assert.equal(visit(first,markers.ModalHost)[0].type,visit(second,markers.ModalHost)[0].type)
  assert.equal(ctx.store.get('layersentry.selfService.appearance.v1'),'classic')
  assert.equal(ctx.calls.some(([name])=>name==='push'),false)
})
test('classic switch cannot override disabled-layout console exclusion', () => {
  const ctx=runtime({view:'cloud',pathname:'/guacamole/7/vnc'}), tree=ctx.render(ctx.load(changed.app).default)
  assert.equal(visit(tree,markers.SelfServiceAppearance)[0].props.enabled,false)
  assert.equal(visit(tree,markers.Sidebar).length,0)
})
test('sidebar default retains original home, role menu, user menu and pin actions', () => {
  const a=runtime(), b=runtime()
  const first=a.render(a.load(native.sidebar).Sidebar,{isOpen:true,endpoints:fixedEndpoints})
  const second=b.render(b.load(changed.sidebar).Sidebar,{isOpen:true,endpoints:fixedEndpoints})
  for(const name of ['OpenNebulaLogo','SidebarUserMenu','SidebarRoleMenu','Button']) assert.equal(visit(first,markers[name]).length,visit(second,markers[name]).length)
  const home=visit(second,'Box').find(x=>x.props.className==='sidebar-header-logo')
  assert.equal(home.props.to,'/dashboard')
  assert.equal(visit(first,markers.Button)[0].props.dataCy,visit(second,markers.Button)[0].props.dataCy)
})
test('sidebar branding slot does not remove the existing account and view controls', () => {
  const ctx=runtime(), tree=ctx.render(ctx.load(changed.sidebar).Sidebar, {isOpen:true,endpoints:fixedEndpoints,logoComponent:'CustomLogo',footerContent:()=>jsx('AppearanceControl',{})})
  assert.equal(visit(tree,'CustomLogo').length,1)
  assert.equal(visit(tree,'AppearanceControl').length,1)
  assert.equal(visit(tree,markers.SidebarUserMenu).length,1)
  assert.equal(visit(tree,markers.SidebarRoleMenu).length,1)
})
test('friendly sidebar wording retains click destination and existing selector IDs', () => {
  const ctx=runtime(), Item=ctx.load(changed.item).SidebarItem
  const tree=ctx.render(Item,{title:'VMs',displayTitle:'Virtual machines',path:'/vm',isExpanded:true})
  const action=visit(tree,'Box').find(x=>x.props['data-cy']==='main-menu-item')
  action.props.onClick()
  assert.deepEqual(ctx.calls,[['push','/vm'],['fixMenu',false]])
  assert.equal(visit(tree,'Typography')[0].props.children,'Virtual machines')
})
test('existing non-English translations take precedence over new English wording', () => {
  const ctx=runtime({translations:{VMs:'Machines virtuelles'}})
  const tree=ctx.render(ctx.load(changed.item).SidebarItem,{title:'VMs',displayTitle:'Virtual machines',path:'/vm',isExpanded:true})
  assert.equal(visit(tree,'Typography')[0].props.children,'Machines virtuelles')
})
test('native app endpoint filtering block is byte-identical', () => {
  const block=s=>s.slice(s.indexOf('  const endpoints = useMemo'),s.indexOf('  const isLayoutDisabled = useMemo'))
  assert.equal(block(changed.app),block(native.app))
})
test('native sidebar filtering, ordering, sizing observers and pin handler are byte-identical', () => {
  const block=s=>s.slice(s.indexOf('    const { translate }'),s.indexOf('    return (\n      <Box'))
  assert.equal(block(changed.sidebar),block(native.sidebar))
})
test('native sidebar selection and navigation functions are byte-identical', () => {
  const selection=s=>s.slice(s.indexOf('const isRouteSelected'),s.indexOf('/**\n * @param'))
  const navigation=s=>s.slice(s.indexOf('  const handleNavigate'),s.indexOf('  const dataCy'))
  assert.equal(selection(changed.item),selection(native.item))
  assert.equal(navigation(changed.item),navigation(native.item))
})
