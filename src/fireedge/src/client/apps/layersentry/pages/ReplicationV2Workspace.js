        setSessions(sessionList)
        await loadSessionDetails(sessionList)
      })
      .catch((reason) => {
        if (active) setError(reason.message)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    replicationAPI
      .drEnvironmentNetworks()
      .then((payload) => {
        if (active) setEnvironmentNetworks(payload?.networks || [])
      })
      .catch(() => {
        if (active) setEnvironmentNetworks([])
      })
    return () => {
      active = false
    }
  }, [])

  const selectedVm = useMemo(
    () => vms.find(({ ID }) => String(ID) === String(vmId)),
    [vms, vmId]
  )
  const disks = useMemo(() => vmDisks(selectedVm), [selectedVm])
  const nics = useMemo(() => vmNics(selectedVm), [selectedVm])
  const primaryNic = nics[0] || null
  const targetBackendCatalogBound =
    Boolean(targetSite) &&
    Object.prototype.hasOwnProperty.call(targetBackends, targetSite)
  const allowedTargetBackends = targetBackendCatalogBound
    ? toArray(targetBackends[targetSite])
    : []
  const backendAllowed = (kind) =>
    targetBackendCatalogBound
      ? allowedTargetBackends.includes(kind)
      : capabilities[kind.toLowerCase()] === true
  const multiWorkloadGroups =
    capabilities.multi_workload_protection_groups === true
  const filesystemConsistency =
    capabilities.filesystem_consistency === true
  const applicationConsistency =
    capabilities.application_consistency === true
  const groupModeQualified =
    groupMembers.length <= 1 ||
    multiWorkloadGroups
  const groupConsistencyQualified =
    groupConsistency === 'CRASH_CONSISTENT' ||
    (groupConsistency === 'FILESYSTEM_CONSISTENT' && filesystemConsistency) ||
    (groupConsistency === 'APPLICATION_CONSISTENT' && applicationConsistency)

  const selectedBackend =
    backendChoice === 'AUTO'
      ? recommendedBackend(
          capabilities,
          allowedTargetBackends,
          targetBackendCatalogBound
        )
      : backendAllowed(backendChoice)
        ? backendChoice
        : ''

  const request = useMemo(() => {
    if (!selectedVm || !targetSite || !selectedBackend) return null
    return {
      id: `vm-${selectedVm.ID}-to-${targetSite}`,
      protection_group_id: protectionGroupId.trim() || `vm-${selectedVm.ID}`,
      workload_id: String(selectedVm.ID),
      workload_name: selectedVm.NAME || String(selectedVm.ID),
      source_site_id: localSiteId,
      target_site_id: String(targetSite),
      backend: selectedBackend,
      disks: disks.map(({ label: _label, ...disk }) => disk),
      checkpoint_seconds: Number(checkpointSeconds),
      max_rpo_seconds: Number(checkpointSeconds),
      warn_backlog_bytes: 70 * 1024 * 1024 * 1024,
      max_backlog_bytes: 100 * 1024 * 1024 * 1024,
      retain_checkpoints: Number(retention),
      consistency,
      compression: 'AUTO',
    }
  }, [
    checkpointSeconds,
    consistency,
    disks,
    retention,
    protectionGroupId,
    localSiteId,
    selectedBackend,
    selectedVm,
    targetSite,
  ])

  const createProtection = async () => {
    setError('')
    setNotice('')
    if (!request || disks.length === 0) {
      setError('Choose a VM, target site and available replication backend.')
      return
    }
    setBusy(true)
    try {
      const preflight = await replicationAPI.preflight(request)
      if (preflight?.ready !== true) {
        throw new Error(preflight?.error || 'Replication preflight failed.')
      }
      await replicationAPI.create(request)
      setNotice(
        'Replication session created in SEEDING state. Existing Restic backup remains unchanged.'
      )
      await refresh()
    } catch (reason) {
      setError(reason.message)
    } finally {
      setBusy(false)
    }
  }

  const testRecovery = async (sessionId, checkpointId) => {
    setError('')
    setNotice('')
    const key = `clone:${sessionId}:${checkpointId}`
    setActionBusy(key)
    try {
      const name = `test-${sessionId}-${Date.now()}`
      const result = await replicationAPI.clone(sessionId, checkpointId, name)
      const count = Object.keys(result?.resources || {}).length
      setNotice(
        `Test Recovery clone created from committed checkpoint ${checkpointId} (${count} disk resource(s)). No failover was performed.`
      )
    } catch (reason) {
      setError(reason.message)
    } finally {
      setActionBusy('')
    }
  }

  const requestRebaseline = async (sessionId, health = {}) => {
    setError('')
    setNotice('')
    const key = `rebaseline:${sessionId}`
    setActionBusy(key)
    try {
      await replicationAPI.rebaseline(sessionId)
      setNotice(
        `Rebaseline requested for ${sessionId}. Reason: ${health?.reason || 'operator-requested source continuity reset'}.`
      )
      await refresh()
    } catch (reason) {
      setError(reason.message)
    } finally {
      setActionBusy('')
    }
  }

  const pairRemoteSite = async () => {
    setError('')
    setNotice('')
    setPairBusy(true)
    try {
      const result = await replicationAPI.drPairSite({
        id: pairSiteId.trim(),
        name: pairSiteName.trim(),
        endpoint: pairEndpoint.trim(),
        username: pairUsername.trim(),
        password: pairPassword,
        mode: drMode,
      })
      setPairPassword('')
      if (result?.site?.id) {
        setTargetSite(result.site.id)
        setTargetSites((current) =>
          current.includes(result.site.id)
            ? current
            : [...current, result.site.id]
        )
      }
      const dc = localSiteId || 'dc'
      const dr = result?.site?.id || pairSiteId.trim()
      const policyPayload = await replicationAPI
        .drManagementBackupPolicies(dc, dr)
        .catch(() => ({ policies: [] }))
      setManagementPolicies(
        Array.isArray(policyPayload?.policies) ? policyPayload.policies : []
      )
      setNotice(
        `Site ${result?.site?.name || dr} paired. Bootstrap password was discarded; ongoing communication uses ${result?.auth_method || 'scoped API identity'}.`
      )
    } catch (reason) {
      setError(reason.message)
    } finally {
      setPairBusy(false)
    }
  }

  const saveRecoveryMapping = async () => {
    setError('')
    setNotice('')
    if (!selectedVm || !targetSite || !primaryNic || !targetNetworkId.trim()) {
      setError(
        'Choose a VM, recovery site and target recovery network before saving mapping.'
      )
      return
    }
    if (nics.length !== 1) {
      setError(
        'This simple recovery mapper requires exactly one VM NIC. Multi-NIC VMs must use the ordered per-NIC mapping workflow so no NIC is omitted.'
      )
      return
    }
    setMappingBusy(true)
    try {
      const addressChoice =
        addressMode === 'STATIC'
          ? {
              mode: 'STATIC',
              target_ip: staticIp.trim(),
              guest_network: {
                prefix_length: Number(staticPrefix),
                gateway: staticGateway.trim(),
                dns: staticDns
                  .split(/[ ,]+/)
                  .map((value) => value.trim())
                  .filter(Boolean),
              },
            }
          : { mode: 'DHCP' }
      await replicationAPI.drPutRecoveryMapping({
        workload_id: String(selectedVm.ID),
        target_site_id: String(targetSite),
        mapping: {
          workload_id: String(selectedVm.ID),
          target_cluster_id: targetClusterId.trim(),
          target_datastore_id: targetDatastoreId.trim(),
          nics: [
            {
              source_nic_id: Number(primaryNic.id),
              source_network_id: primaryNic.sourceNetworkId,
              target_network_id: targetNetworkId.trim(),
              address_mode: addressChoice.mode,
              target_ip: addressChoice.target_ip || undefined,
              guest_network: addressChoice.guest_network || undefined,
              order: 0,
            },
          ],
        },
      })
      setNotice(
        `Recovery network mapping saved for ${selectedVm.NAME || selectedVm.ID}: ${primaryNic.sourceNetworkName} → target VNet ${targetNetworkId.trim()} using ${addressMode}.`
      )
    } catch (reason) {
      setError(reason.message)
    } finally {
      setMappingBusy(false)
    }
  }

  const loadVMCheckpointCatalog = async () => {
    setError('')
    if (!selectedVm || !targetSite) {
      setError('Choose a VM and recovery site before loading checkpoints.')
      return
    }
    const group = protectionGroupId.trim() || `vm-${selectedVm.ID}`
    try {
      const payload = await replicationAPI.drVMCheckpoints(group, targetSite)
      setCheckpointCatalog(Array.isArray(payload?.vms) ? payload.vms : [])
    } catch (reason) {
      setError(reason.message)
    }
  }

  const healthy = sessions.filter(({ state }) => state === 'REPLICATING').length
  const seeding = sessions.filter(({ state }) => state === 'SEEDING').length

  return (
    <PageFrame
      title="VM Replication"
      description="Checkpoint-based DC/DR replication. Hot DR is independent from the existing Restic backup and recovery path."
    >
      <Alert severity="info" sx={{ mt: 2 }}>
        Restic backup stays enabled and independent. Replication v2 creates hot
        recovery checkpoints only. Failover controls remain hidden until the
        fencing and recovery orchestrator path is independently qualified.
      </Alert>
      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert severity="success" sx={{ mt: 2 }}>
          {notice}
        </Alert>
      )}