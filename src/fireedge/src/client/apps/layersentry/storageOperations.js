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
/* eslint-disable jsdoc/require-jsdoc */

export const isReadyImageDatastore = (datastore) => {
  const imageDatastore =
    String(datastore?.TYPE) === '0' ||
    String(datastore?.TYPE).toUpperCase() === 'IMAGE_DS'
  const ready =
    String(datastore?.STATE) === '0' ||
    String(datastore?.STATE).toUpperCase() === 'READY'

  return imageDatastore && ready
}

export const isPersistentAvailableImage = (image) => {
  const datablock =
    String(image?.TYPE) === '1' ||
    String(image?.TYPE).toUpperCase() === 'DATABLOCK'
  const persistent = ['1', 'YES', 'TRUE'].includes(
    String(image?.PERSISTENT ?? image?.TEMPLATE?.PERSISTENT ?? '').toUpperCase()
  )
  const ready =
    String(image?.STATE) === '1' ||
    String(image?.STATE).toUpperCase() === 'READY'

  return datablock && persistent && ready
}

export const vmHasImage = (vm, imageId) =>
  []
    .concat(vm?.TEMPLATE?.DISK ?? [])
    .some(({ IMAGE_ID }) => String(IMAGE_ID) === String(imageId))

export const vmDoesNotHaveDisk = (vm, diskId) =>
  Boolean(vm) &&
  ![]
    .concat(vm?.TEMPLATE?.DISK ?? [])
    .some(({ DISK_ID }) => String(DISK_ID) === String(diskId))

export const vmDiskAtLeastSize = (vm, diskId, sizeMb) =>
  []
    .concat(vm?.TEMPLATE?.DISK ?? [])
    .some(
      ({ DISK_ID, SIZE }) =>
        String(DISK_ID) === String(diskId) && Number(SIZE) >= Number(sizeMb)
    )
