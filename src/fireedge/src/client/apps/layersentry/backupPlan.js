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
/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param-description, jsdoc/require-param-type, jsdoc/require-returns */

export const BACKUP_PLAN_PROFILES = Object.freeze({
  ESSENTIAL: Object.freeze({
    label: 'Essential',
    summary: 'Daily incremental backup · keep 7 restore points',
    keepLast: 7,
    intervalHours: 24,
    fsFreeze: 'AGENT',
  }),
  BUSINESS: Object.freeze({
    label: 'Business',
    summary: 'Every 12 hours · keep 30 restore points',
    keepLast: 30,
    intervalHours: 12,
    fsFreeze: 'AGENT',
  }),
  CRITICAL: Object.freeze({
    label: 'Critical',
    summary: 'Every 4 hours · keep 90 restore points',
    keepLast: 90,
    intervalHours: 4,
    fsFreeze: 'AGENT',
  }),
  CUSTOM: Object.freeze({
    label: 'Custom',
    summary: 'Choose schedule, retention and consistency settings',
  }),
})

/**
 *
 */
export const defaultBackupPlanDraft = () => ({
  name: '',
  profile: 'ESSENTIAL',
  vmIds: [],
  datastoreId: '',
  keepLast: '7',
  intervalHours: '24',
  startTime: '',
  advanced: false,
  fsFreeze: 'AGENT',
  execution: 'SEQUENTIAL',
  incrementMode: 'CBT',
  backupVolatile: false,
})

/**
 * @param draft
 */
export const effectiveBackupProfile = (draft) => {
  const preset = BACKUP_PLAN_PROFILES[draft.profile]

  return draft.profile === 'CUSTOM'
    ? {
        ...preset,
        keepLast: Number(draft.keepLast),
        intervalHours: Number(draft.intervalHours),
        fsFreeze: draft.fsFreeze,
      }
    : preset
}

/**
 * @param draft
 */
export const validateBackupPlanDraft = (draft) => {
  const errors = {}
  const profile = effectiveBackupProfile(draft)

  if (!BACKUP_PLAN_PROFILES[draft.profile]) {
    errors.profile = 'Select a supported Backup Plan profile.'

    return errors
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_. -]{1,126}$/.test(draft.name ?? '')) {
    errors.name =
      'Use 2-127 letters, numbers, spaces, dots, dashes or underscores.'
  }
  if (!Array.isArray(draft.vmIds) || draft.vmIds.length === 0) {
    errors.vmIds = 'Select at least one virtual machine.'
  } else if (draft.vmIds.some((id) => !/^\d+$/.test(String(id)))) {
    errors.vmIds = 'Virtual machine assignments must use native numeric IDs.'
  }
  if (!/^\d+$/.test(String(draft.datastoreId))) {
    errors.datastoreId = 'Select qualified Backup Storage.'
  }
  if (
    !Number.isInteger(profile.keepLast) ||
    profile.keepLast < 1 ||
    profile.keepLast > 1000
  ) {
    errors.keepLast = 'Retention must keep between 1 and 1000 restore points.'
  }
  if (
    !Number.isInteger(profile.intervalHours) ||
    profile.intervalHours < 1 ||
    profile.intervalHours > 168
  ) {
    errors.intervalHours = 'Schedule interval must be between 1 and 168 hours.'
  }
  if (draft.startTime) {
    const startTime = Date.parse(draft.startTime)
    if (!Number.isFinite(startTime) || startTime <= Date.now()) {
      errors.startTime = 'First run must be a valid future date and time.'
    }
  }

  return errors
}

const nextStartTime = (draft) => {
  const selected = Date.parse(draft.startTime)
  if (Number.isFinite(selected) && selected > Date.now()) {
    return Math.trunc(selected / 1000)
  }

  return Math.trunc((Date.now() + 5 * 60 * 1000) / 1000)
}

/**
 * @param draft
 */
export const compileBackupPlanTemplate = (draft) => {
  const profile = effectiveBackupProfile(draft)

  return {
    NAME: draft.name.trim(),
    LAYERSENTRY_PLAN: draft.profile,
    LAYERSENTRY_RECONCILE: 'NATIVE_READBACK',
    BACKUP_VMS: [...new Set(draft.vmIds.map(String))].join(','),
    DATASTORE_ID: String(draft.datastoreId),
    PRIORITY:
      draft.profile === 'CRITICAL'
        ? 49
        : draft.profile === 'BUSINESS'
        ? 35
        : 25,
    EXECUTION: draft.advanced ? draft.execution : 'SEQUENTIAL',
    FS_FREEZE: draft.advanced ? draft.fsFreeze : profile.fsFreeze,
    MODE: 'INCREMENT',
    INCREMENT_MODE: draft.advanced ? draft.incrementMode : 'CBT',
    KEEP_LAST: profile.keepLast,
    BACKUP_VOLATILE: draft.advanced && draft.backupVolatile ? 'YES' : 'NO',
    SCHED_ACTION: {
      ACTION: 'backup',
      PERIODIC: 'PERIODIC',
      TIME: nextStartTime(draft),
      REPEAT: '3',
      DAYS: profile.intervalHours,
      END_TYPE: '0',
    },
  }
}

/**
 * @param plan
 * @param expected
 */
export const backupPlanReadbackMatches = (plan, expected) => {
  const template = plan?.TEMPLATE ?? {}
  const schedules = [template.SCHED_ACTION].filter(Boolean).flat()
  const expectedSchedule = expected.SCHED_ACTION
  const schedule = schedules.find(
    (item) => String(item?.ACTION).toLowerCase() === 'backup'
  )
  const same = (actual, requested) => String(actual) === String(requested)

  return (
    same(plan?.NAME, expected.NAME) &&
    same(template.LAYERSENTRY_PLAN, expected.LAYERSENTRY_PLAN) &&
    same(template.LAYERSENTRY_RECONCILE, expected.LAYERSENTRY_RECONCILE) &&
    same(template.BACKUP_VMS, expected.BACKUP_VMS) &&
    same(template.DATASTORE_ID, expected.DATASTORE_ID) &&
    same(template.KEEP_LAST, expected.KEEP_LAST) &&
    same(plan?.PRIORITY ?? template.PRIORITY, expected.PRIORITY) &&
    same(template.EXECUTION, expected.EXECUTION) &&
    same(template.FS_FREEZE, expected.FS_FREEZE) &&
    same(template.MODE, expected.MODE) &&
    same(template.INCREMENT_MODE, expected.INCREMENT_MODE) &&
    same(template.BACKUP_VOLATILE, expected.BACKUP_VOLATILE) &&
    same(schedule?.ACTION, expectedSchedule.ACTION) &&
    (!schedule?.PERIODIC ||
      same(schedule.PERIODIC, expectedSchedule.PERIODIC)) &&
    same(schedule?.TIME, expectedSchedule.TIME) &&
    same(schedule?.REPEAT, expectedSchedule.REPEAT) &&
    same(schedule?.DAYS, expectedSchedule.DAYS) &&
    same(schedule?.END_TYPE, expectedSchedule.END_TYPE)
  )
}
