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
const { Actions, Commands } = require('server/routes/api/kubeoneportal/routes')
const {
  list,
  namespaces,
  createNamespace,
  kubeconfig,
  workerReconciliation,
  reconcileWorkers,
  applications,
  installApplication,
} = require('server/routes/api/kubeoneportal/functions')

module.exports = [
  { ...Commands[Actions.LIST], action: list },
  { ...Commands[Actions.NAMESPACES], action: namespaces },
  { ...Commands[Actions.CREATE_NAMESPACE], action: createNamespace },
  { ...Commands[Actions.KUBECONFIG], action: kubeconfig },
  { ...Commands[Actions.WORKER_RECONCILIATION], action: workerReconciliation },
  { ...Commands[Actions.RECONCILE_WORKERS], action: reconcileWorkers },
  { ...Commands[Actions.APPLICATIONS], action: applications },
  { ...Commands[Actions.INSTALL_APPLICATION], action: installApplication },
]
