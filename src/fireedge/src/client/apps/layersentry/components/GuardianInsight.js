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
import PropTypes from 'prop-types'
import { Alert, Box, Chip, Typography } from '@mui/material'
import { colors } from 'client/apps/layersentry/theme/tokens'

const first = (...values) =>
  values.find((value) => value !== undefined && value !== null && value !== '')

const GuardianInsight = ({ evidence, scope }) => {
  const record = evidence ?? {}
  const decision = first(
    record.decision,
    record.status,
    record.recommendation_status
  )
  const recommendation = first(
    record.recommendation,
    record.summary,
    record.reason
  )
  const evidenceRef = first(record.evidence_ref, record.operation_id)
  const policy = first(record.policy_revision, record.policy_digest)

  if (!decision && !recommendation && !evidenceRef) {
    return (
      <Alert severity="info" data-layersentry-guardian-unavailable>
        Guardian AI has no authoritative {scope} assessment to display. No
        recommendation or safe action is inferred in the browser.
      </Alert>
    )
  }

  return (
    <Box
      data-layersentry-guardian-evidence
      sx={{ p: 1.25, border: `1px solid ${colors.border}`, borderRadius: 1.5 }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography sx={{ fontSize: 12, fontWeight: 750 }}>
          Guardian AI
        </Typography>
        <Chip size="small" label={decision || 'EVIDENCE AVAILABLE'} />
      </Box>
      <Typography sx={{ mt: 0.5, fontSize: 12, color: colors.text.secondary }}>
        {recommendation || 'Assessment evidence is available.'}
      </Typography>
      <Typography sx={{ mt: 0.35, fontSize: 10, color: colors.text.muted }}>
        Evidence {evidenceRef || 'reference unavailable'} · Policy{' '}
        {policy || 'revision unavailable'} · recommendations never bypass
        lifecycle ownership, approval, readback or verification.
      </Typography>
    </Box>
  )
}

GuardianInsight.propTypes = {
  evidence: PropTypes.object,
  scope: PropTypes.string.isRequired,
}

export default GuardianInsight
