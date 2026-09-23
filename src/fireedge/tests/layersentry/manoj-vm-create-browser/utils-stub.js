/* SPDX-License-Identifier: Apache-2.0 */
export const getTemplateImageIds = (template = {}) => {
  const disk = template?.TEMPLATE?.DISK
  const disks = Array.isArray(disk) ? disk : disk ? [disk] : []
  return disks.map((item) => item?.IMAGE_ID).filter((id) => id !== undefined)
}

export const isLayerSentryCustomerTemplate = (template = {}, images = []) => {
  const body = template?.TEMPLATE || {}
  if (body.ONEKS || body.VROUTER || body?.CONTEXT?.ONEAPP_ONEKS_CLUSTER_NAME)
    return false
  if (String(body.HYPERVISOR || '').toLowerCase() !== 'kvm') return false
  if (String(body?.OS?.ARCH || 'x86_64').toLowerCase() !== 'x86_64') return false
  const imageId = String(getTemplateImageIds(template)[0] ?? '')
  const image = images.find((item) => String(item.ID) === imageId)
  return (
    String(image?.FORMAT || '').toLowerCase() === 'qcow2' &&
    String(image?.TYPE || '').toUpperCase() === 'OS'
  )
}

export const isLayerSentryCloneSource = (vm = {}) =>
  !vm?.USER_TEMPLATE?.ONEKS && vm?.VROUTER_ID === undefined

export const canCloneVm = (vm = {}) => Number(vm.STATE) === 8

export const parseSavedTemplateId = (value) => {
  if (Number.isFinite(Number(value?.id))) return Number(value.id)
  const match = String(value?.message || value || '').match(/(\d+)/)
  return match ? Number(match[1]) : undefined
}

export const prettyBytes = (value) => {
  const mb = Number(value || 0)
  return mb >= 1024 ? Math.round(mb / 1024) + ' GB' : mb + ' MB'
}
