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
import { BaseSchema, string } from 'yup'

import { FIELDS as CAPACITY_FIELDS } from './capacitySchema'
import { FIELDS as INFORMATION_FIELDS } from './informationSchema'
// import { FIELDS as DISK_FIELDS, SCHEMA as DISK_SCHEMA } from './diskSchema'

// get schemas from VmTemplate/CreateForm
import { FIELDS as OWNERSHIP_FIELDS } from '@modules/resources/VmTemplate/Forms/CreateForm/Steps/General/ownershipSchema'
import { FIELDS as VM_GROUP_FIELDS } from '@modules/resources/VmTemplate/Forms/CreateForm/Steps/General/vmGroupSchema'

// Label
import { CapacityMemoryLabel } from '@modules/resources/VmTemplate/Forms/Legend'

import { T, VmTemplate, VmTemplateFeatures } from '@ConstantsModule'
import {
  Field,
  Section,
  disableFields,
  filterFieldsByHypervisor,
  getObjectSchemaFromFields,
} from '@UtilsModule'

/**
 * @param {VmTemplate} [vmTemplate] - VM Template
 * @param {VmTemplateFeatures} [features] - Features
 * @param {object} oneConfig - Config of oned.conf
 * @param {boolean} adminGroup - User is admin or not
 * @param {boolean} selfService - Whether LayerSentry cloud UX is active
 * @returns {Section[]} Sections
 */
const SECTIONS = (
  vmTemplate,
  features,
  oneConfig,
  adminGroup,
  selfService = false
) => {
  const hypervisor = vmTemplate?.TEMPLATE?.HYPERVISOR
  const informationFields = selfService
    ? INFORMATION_FIELDS.filter(({ name }) =>
        ['name', 'instances'].includes(name)
      ).map((field) =>
        field.name === 'name'
          ? {
              ...field,
              dependOf: undefined,
              validation: string()
                .trim()
                .min(1, 'Enter a VM name')
                .max(128, 'VM name must be 128 characters or fewer')
                .required('Enter a VM name')
                .default(''),
            }
          : field
      )
    : INFORMATION_FIELDS

  return [
    {
      id: 'information',
      legend: T.Information,
      fields: disableFields(
        filterFieldsByHypervisor(informationFields, hypervisor),
        '',
        oneConfig,
        adminGroup
      ),
    },
    {
      id: 'capacity',
      legend: <CapacityMemoryLabel data={vmTemplate} />,
      fields: disableFields(
        filterFieldsByHypervisor(
          CAPACITY_FIELDS(vmTemplate, features).map((field) =>
            selfService && field.name === 'VCPU'
              ? { ...field, label: 'vCPU' }
              : field
          ),
          hypervisor
        ),
        '',
        oneConfig,
        adminGroup
      ),
    },
    !selfService && {
      id: 'ownership',
      legend: T.Ownership,
      fields: disableFields(
        filterFieldsByHypervisor(OWNERSHIP_FIELDS, hypervisor),
        '',
        oneConfig,
        adminGroup
      ),
    },
    !selfService && {
      id: 'vm_group',
      legend: T.VMGroup,
      fields: disableFields(
        filterFieldsByHypervisor(VM_GROUP_FIELDS, hypervisor),
        '',
        oneConfig,
        adminGroup
      ),
    },
  ].filter(Boolean)
}

/**
 * @param {VmTemplate} [vmTemplate] - VM Template
 * @param {VmTemplateFeatures} [features] - View capacity features
 * @param {object} oneConfig - OpenNebula configuration
 * @param {boolean} adminGroup - Whether user belongs to admin group
 * @param {boolean} selfService - Whether LayerSentry cloud UX is active
 * @returns {Field[]} Basic configuration fields
 */
const FIELDS = (
  vmTemplate,
  features,
  oneConfig,
  adminGroup,
  selfService = false
) =>
  SECTIONS(vmTemplate, features, oneConfig, adminGroup, selfService)
    .map(({ fields }) => fields)
    .flat()

/**
 * @param {VmTemplate} [vmTemplate] - VM Template
 * @param {VmTemplateFeatures} [features] - View capacity features
 * @param {object} oneConfig - OpenNebula configuration
 * @param {boolean} adminGroup - Whether user belongs to admin group
 * @param {boolean} selfService - Whether LayerSentry cloud UX is active
 * @returns {BaseSchema} Step schema
 */
const SCHEMA = (
  vmTemplate,
  features,
  oneConfig,
  adminGroup,
  selfService = false
) =>
  getObjectSchemaFromFields(
    FIELDS(vmTemplate, features, oneConfig, adminGroup, selfService)
  )

export { FIELDS, SCHEMA, SECTIONS }
