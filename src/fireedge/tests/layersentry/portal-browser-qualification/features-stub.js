/* SPDX-License-Identifier: Apache-2.0 */
export const AuthAPI = {
  useLogoutMutation: () => [
    () => {
      window.__LAYERSENTRY_BROWSER_QA__.logoutCalls += 1
    },
  ],
}

export const useAuth = () => ({
  user: { NAME: 'QA Operator', GID: '7' },
  groups: [{ ID: '7', NAME: 'QA Project' }],
})

export const useAuthApi = () => ({
  changeView: (view) => {
    window.__LAYERSENTRY_BROWSER_QA__.viewChanges.push(view)
  },
})

export const useViews = () => ({
  view: 'admin',
  views: {
    admin: {},
    cloud: {},
  },
})
