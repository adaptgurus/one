/* SPDX-License-Identifier: Apache-2.0 */
export const AuthAPI = {
  useLogoutMutation: () => [
    () => {
      window.__MANOJ_VM_QA__.logoutCalls += 1
    },
  ],
}

export const useAuth = () => ({
  user: { NAME: 'Manoj QA', GID: '7' },
  groups: [{ ID: '7', NAME: 'QA Project' }],
})

export const useAuthApi = () => ({
  changeView: (view) => window.__MANOJ_VM_QA__.viewChanges.push(view),
})

export const useViews = () => ({
  view: 'admin',
  views: { admin: {}, cloud: {} },
  getResourceView: () => ({}),
})

export const useGeneralApi = () => ({
  enqueueError: (message) => window.__MANOJ_VM_QA__.errors.push(String(message)),
  enqueueInfo: (message) => window.__MANOJ_VM_QA__.infos.push(String(message)),
})

export const VmAPI = {
  useSaveAsTemplateMutation: () => [
    (args) => ({
      unwrap: async () => {
        window.__MANOJ_VM_QA__.cloneRequests.push(args)
        return { id: 999 }
      },
    }),
    { isLoading: false },
  ],
}
