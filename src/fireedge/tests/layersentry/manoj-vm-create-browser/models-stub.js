/* SPDX-License-Identifier: Apache-2.0 */
const templates = [
  {
    ID: 101,
    NAME: 'Rocky 9 Approved',
    TEMPLATE: {
      HYPERVISOR: 'kvm',
      OS: { ARCH: 'x86_64' },
      DISK: { IMAGE_ID: '501' },
      VCPU: 2,
      MEMORY: 4096,
    },
  },
  {
    ID: 102,
    NAME: 'Provider OneKS Template',
    TEMPLATE: {
      HYPERVISOR: 'kvm',
      OS: { ARCH: 'x86_64' },
      DISK: { IMAGE_ID: '501' },
      ONEKS: { TYPE: 'NodeGroup' },
      VCPU: 4,
      MEMORY: 8192,
    },
  },
  {
    ID: 103,
    NAME: 'Raw Image Template',
    TEMPLATE: {
      HYPERVISOR: 'kvm',
      OS: { ARCH: 'x86_64' },
      DISK: { IMAGE_ID: '502' },
      VCPU: 1,
      MEMORY: 2048,
    },
  },
]

const images = [
  { ID: 501, NAME: 'Rocky Linux 9', FORMAT: 'qcow2', TYPE: 'OS' },
  { ID: 502, NAME: 'Legacy RAW', FORMAT: 'raw', TYPE: 'OS' },
]

const vms = [
  {
    ID: 201,
    NAME: 'web-01',
    STATE: 3,
    TEMPLATE: { VCPU: 2, MEMORY: 4096, DISK: { SIZE: 20480 } },
    USER_TEMPLATE: {},
  },
  {
    ID: 202,
    NAME: 'db-01',
    STATE: 8,
    TEMPLATE: { VCPU: 4, MEMORY: 8192, DISK: { SIZE: 51200 } },
    USER_TEMPLATE: {},
  },
  {
    ID: 203,
    NAME: 'oneks-worker',
    STATE: 8,
    TEMPLATE: { VCPU: 4, MEMORY: 8192, DISK: { SIZE: 30720 } },
    USER_TEMPLATE: { ONEKS: { TYPE: 'NodeGroup' } },
  },
]

const hook = (data) => () => ({
  data,
  isFetching: false,
  refetch: async () => data,
})

export const vmtemplateTable = { useData: hook(templates) }
export const imageTable = { useData: hook(images) }
export const vmsTable = { useData: hook(vms) }

export const getDiskSize = (vm) => {
  const disk = vm?.TEMPLATE?.DISK
  const rows = Array.isArray(disk) ? disk : disk ? [disk] : []
  return rows.reduce((sum, item) => sum + Number(item?.SIZE || 0), 0)
}

export const getVirtualMachineState = (vm) =>
  Number(vm?.STATE) === 8
    ? { name: 'Powered off', color: 'success' }
    : { name: 'Running', color: 'info' }
