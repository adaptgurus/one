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
import { debounce } from 'lodash'
import { ReactElement, useEffect } from 'react'
import { useStore } from 'react-redux'
import { Redirect, useHistory, useLocation } from 'react-router'

import {
  GroupAPI,
  useGeneralApi,
  UserAPI,
  useSystemData,
  useViews,
  VmTemplateAPI,
} from '@FeaturesModule'

import { DefaultFormStepper, SkeletonStepsForm } from '@ComponentsModule'
import { VmTemplate } from '@ResourcesModule'

import {
  jsonToXml,
  filterTemplateData,
  transformActionsInstantiate,
} from '@UtilsModule'

import { RESOURCE_NAMES, T, TAB_FORM_MAP, PATH } from '@ConstantsModule'
import { normalizeProtectionRequest } from '@modules/resources/VmTemplate/Forms/InstantiateForm/protection'

const _ = require('lodash')

/**
 * Displays the instantiation form for a VM Template.
 *
 * @returns {ReactElement} Instantiation form
 */
export function InstantiateVmTemplate() {
  useEffect(() => {
    resetFieldPath()
    resetModifiedFields()
  }, [])

  const store = useStore()
  const history = useHistory()
  const { state: { ID: templateId, NAME: templateName } = {} } = useLocation()
  const { enqueueInfo, resetFieldPath, resetModifiedFields } = useGeneralApi()
  const [instantiate] = VmTemplateAPI.useInstantiateTemplateMutation()
  const { adminGroup, oneConfig } = useSystemData()

  const { data: apiTemplateDataExtended, isError } =
    VmTemplateAPI.useGetTemplateQuery(
      { id: templateId, extended: true },
      { skip: templateId === undefined }
    )

  const { data: apiTemplateData } = VmTemplateAPI.useGetTemplateQuery(
    { id: templateId, extended: false },
    { skip: templateId === undefined }
  )

  const dataTemplateExtended = _.cloneDeep(apiTemplateDataExtended)

  UserAPI.useGetUsersQuery(undefined, { refetchOnMountOrArgChange: false })
  GroupAPI.useGetGroupsQuery(undefined, { refetchOnMountOrArgChange: false })

  const { getResourceView, view } = useViews()
  const resource = RESOURCE_NAMES.VM_TEMPLATE
  const { features } = getResourceView(resource)

  const onSubmit = async (templates) => {
    try {
      const currentState = store.getState()
      const modifiedFields = currentState.general?.modifiedFields

      await Promise.all(
        templates.map((rawTemplate) => {
          const existingTemplate = {
            ...apiTemplateData?.TEMPLATE,
          }

          const filteredTemplate = filterTemplateData(
            rawTemplate,
            modifiedFields,
            existingTemplate,
            TAB_FORM_MAP,
            {
              instantiate: true,
            }
          )

          // Cloud-only LayerSentry protection intent. This is deliberately
          // persisted as REQUESTED_NOT_ACTIVE metadata; it cannot activate
          // replication, retention, network mapping or failover by itself.
          if (
            view === 'cloud' &&
            modifiedFields?.extra?.LayerSentryProtection
          ) {
            const protection = normalizeProtectionRequest(
              rawTemplate?.extra?.LAYERSENTRY_PROTECTION
            )
            if (protection) {
              filteredTemplate.LAYERSENTRY_PROTECTION = protection
            }
          }

          transformActionsInstantiate(
            filteredTemplate,
            apiTemplateData,
            features
          )

          const xmlFinal = jsonToXml(filteredTemplate)
          rawTemplate.template = xmlFinal

          return instantiate(rawTemplate).unwrap()
        })
      )

      resetFieldPath()
      resetModifiedFields()

      history.push(PATH.INSTANCE.VMS.LIST)

      const total = templates.length
      const templateInfo = `#${templateId} ${templateName}`
      enqueueInfo(T.InfoVMTemplateInstantiated, [total, templateInfo])
    } catch {}
  }

  if (!templateId || isError) {
    return <Redirect to={PATH.TEMPLATE.VMS.LIST} />
  }

  return (
    <>
      {!dataTemplateExtended || !apiTemplateData || _.isEmpty(oneConfig) ? (
        <SkeletonStepsForm />
      ) : (
        <VmTemplate.Forms.InstantiateForm
          initialValues={dataTemplateExtended}
          stepProps={{
            dataTemplateExtended,
            oneConfig,
            adminGroup,
          }}
          onSubmit={debounce(onSubmit, 500)}
          fallback={<SkeletonStepsForm />}
        >
          {(config) => <DefaultFormStepper {...config} />}
        </VmTemplate.Forms.InstantiateForm>
      )}
    </>
  )
}
