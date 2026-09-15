/* ------------------------------------------------------------------------- *
 * Copyright 2002-2026, OpenNebula Project, OpenNebula Systems               *
 *                                                                           *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may   *
 * not use this file except in compliance with the License. You may obtain   *
 * a copy of the License at                                                  *
 *                                                                           *
 * http://www.apache.org/licenses/LICENSE-2.0                                *
 *                                                                           *
 * Unless required by applicable law or agreed to in writing, software       *
 * distributed under the License is distributed on an "AS IS" BASIS,         *
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.  *
 * See the License for the specific language governing permissions and       *
 * limitations under the License.                                            *
 * ------------------------------------------------------------------------- */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8')

test('production federation remotes keep public export names stable', () => {
  const moduleRoot = path.join(root, 'src/modules')
  const configs = fs.readdirSync(moduleRoot).flatMap((name) => {
    const dir = path.join(moduleRoot, name)
    if (!fs.statSync(dir).isDirectory()) return []

    return fs
      .readdirSync(dir)
      .filter((file) => /^webpack\.config\.prod\..+\.js$/.test(file))
      .map((file) => path.join(dir, file))
      .filter((file) =>
        fs.readFileSync(file, 'utf8').includes('ModuleFederationPlugin')
      )
  })
  assert.ok(configs.length >= 10)
  for (const file of configs) {
    assert.match(fs.readFileSync(file, 'utf8'), /mangleExports:\s*false/)
  }
})

test('LayerSentry waits for role view initialization before authenticated render', () => {
  const auth = read('src/modules/features/Auth/hooks.js')
  assert.match(auth, /_APPS\.sunstone, _APPS\.layersentry/)
  assert.match(
    auth,
    /const waitViewToLogin = appNeedViews\(\) \? !!view : true/
  )
})
