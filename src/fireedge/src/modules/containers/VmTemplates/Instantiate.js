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
  applyLayerSentryVmDefaults,
  hasTemplateId,
  normalizeProtectionRequest,
  resolvePublishedGpuRequest,
  transformActionsInstantiate,
} from '@UtilsModule'

import { RESOURCE_NAMES, T, TAB_FORM_MAP, PATH } from '@ConstantsModule'

const _ = require('lodash')
const GPU_REQUEST_ERROR = 'LayerSentry published GPU request is no longer valid'

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
  const location = useLocation()
  const { ID: stateTemplateId, NAME: stateTemplateName } = location.state ?? {}
  const queryTemplateId = new URLSearchParams(location.search).get('template')
  const templateId = hasTemplateId(stateTemplateId)
    ? stateTemplateId
    : queryTemplateId
  const templateName = stateTemplateName
  const {
    enqueueError,
    enqueueInfo,
    resetFieldPath,
    resetModifiedFields,
  } = useGeneralApi()
  const [instantiate] = VmTemplateAPI.useInstantiateTemplateMutation()
  const { adminGroup, oneConfig } = useSystemData()

  const { data: apiTemplateDataExtended, isError } =
    VmTemplateAPI.useGetTemplateQuery(
      { id: templateId, extended: true },
      { skip: !hasTemplateId(templateId) }
    )

  const { data: apiTemplateData } = VmTemplateAPI.useGetTemplateQuery(
    { id: templateId, extended: false },
    { skip: !hasTemplateId(templateId) }
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

          let filteredTemplate = filterTemplateData(
            rawTemplate,
            modifiedFields,
            existingTemplate,
            TAB_FORM_MAP,
            {
              instantiate: true,
            }
          )

          if (view === 'cloud') {
            filteredTemplate = applyLayerSentryVmDefaults(
              filteredTemplate,
              rawTemplate?.access
            )

            // Catalog metadata belongs to the source VM template, not the
            // resulting VM instance. Never carry physical-address-like data
            // from a browser request into PCI constraints.
            delete filteredTemplate.LAYERSENTRY_GPU_PROFILES
            delete filteredTemplate.LAYERSENTRY_GPU_REQUEST

            if (modifiedFields?.extra?.LayerSentryGpu) {
              const gpuRequest = resolvePublishedGpuRequest(
                rawTemplate?.extra?.LAYERSENTRY_GPU_REQUEST,
                apiTemplateData?.TEMPLATE
              )

              if (!gpuRequest.valid) {
                throw new Error(GPU_REQUEST_ERROR)
              }

              if (gpuRequest.requested) {
                const existingPci = filteredTemplate.PCI
                  ? [].concat(filteredTemplate.PCI)
                  : []

                filteredTemplate.PCI = [...existingPci, ...gpuRequest.pci]
                filteredTemplate.LAYERSENTRY_GPU_REQUEST = {
                  PROFILE_ID: gpuRequest.profileId,
                  COUNT: String(gpuRequest.count),
                  SOURCE: 'PUBLISHED_TEMPLATE_PROFILE',
                }
              }
            }
          }

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
          const requestTemplate = { ...rawTemplate, template: xmlFinal }
          delete requestTemplate.access

          return instantiate(requestTemplate).unwrap()
        })
      )

      resetFieldPath()
      resetModifiedFields()

      history.push(PATH.INSTANCE.VMS.LIST)

      const total = templates.length
      const resolvedTemplateName = templateName ?? apiTemplateData?.NAME ?? ''
      const templateInfo = `#${templateId} ${resolvedTemplateName}`.trim()
      enqueueInfo(T.InfoVMTemplateInstantiated, [total, templateInfo])
    } catch (error) {
      if (error?.message === GPU_REQUEST_ERROR) {
        enqueueError(
          'The selected GPU profile is no longer available or the requested count exceeds its published limit.'
        )
      }
    }
  }

  if (!hasTemplateId(templateId) || isError) {
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
            view,
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
