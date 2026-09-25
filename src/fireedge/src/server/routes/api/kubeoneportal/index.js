const { Actions, Commands } = require('server/routes/api/kubeoneportal/routes')
const { list, namespaces, createNamespace, kubeconfig, workerReconciliation, reconcileWorkers } = require('server/routes/api/kubeoneportal/functions')

module.exports = [
  { ...Commands[Actions.LIST], action: list },
  { ...Commands[Actions.NAMESPACES], action: namespaces },
  { ...Commands[Actions.CREATE_NAMESPACE], action: createNamespace },
  { ...Commands[Actions.KUBECONFIG], action: kubeconfig },
  { ...Commands[Actions.WORKER_RECONCILIATION], action: workerReconciliation },
  { ...Commands[Actions.RECONCILE_WORKERS], action: reconcileWorkers },
]
