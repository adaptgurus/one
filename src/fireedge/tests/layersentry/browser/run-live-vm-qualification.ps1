param(
  [string]$WslWorktree = "/home/opc/layersentry-vm-create-livequal-20260920",
  [string]$BaseUrl = "http://127.0.0.1:12616/fireedge/layersentry/"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Invoke-WslStrict {
  param([Parameter(Mandatory = $true)][string[]]$ArgsList)
  $output = & wsl.exe -d Ubuntu-22.04 -u opc -- $ArgsList 2>&1
  $code = $LASTEXITCODE
  if ($code -ne 0) {
    $detail = $output -join [Environment]::NewLine
    throw "WSL command failed ($code): $($ArgsList -join ' ') $detail"
  }
  return @($output)
}

function Invoke-WslAllowFail {
  param([Parameter(Mandatory = $true)][string[]]$ArgsList)
  $output = & wsl.exe -d Ubuntu-22.04 -u opc -- $ArgsList 2>&1
  return [pscustomobject]@{
    ExitCode = $LASTEXITCODE
    Output = @($output)
  }
}

function Test-LiveTunnel {
  $code = & curl.exe -sS -o NUL -w "%{http_code}" --connect-timeout 2 --max-time 4 $BaseUrl 2>$null
  return ($LASTEXITCODE -eq 0 -and "$code" -eq "200")
}

function Invoke-BrowserHarness {
  param(
    [Parameter(Mandatory = $true)][string]$Script,
    [Parameter(Mandatory = $true)][string]$Log
  )
  $output = & node $Script 2>&1
  $code = $LASTEXITCODE
  $output | Set-Content -LiteralPath $Log
  if ($code -ne 0) {
    throw "Browser harness failed ($code): $Script. See $Log"
  }
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$browserDir = "C:\Users\opc\layersentry-browser-e2e"
$runDir = Join-Path $browserDir "runs\$stamp"
$runWsl = "/mnt/c/Users/opc/layersentry-browser-e2e/runs/$stamp"
$sourceDir = Join-Path $runDir "source"
New-Item -ItemType Directory -Force -Path $runDir, $sourceDir | Out-Null

$summary = [ordered]@{
  startedAt = (Get-Date).ToUniversalTime().ToString("o")
  branchHead = $null
  baselineRouteMatrix = "NOT_RUN"
  vmCreateGate = "NOT_ENABLED"
  vmBrowserFlow = "NOT_RUN"
  authoritativeReadback = "NOT_RUN"
  restoredFailClosed = "NOT_RUN"
  postRestoreRouteMatrix = "NOT_RUN"
  cleanup = "NOT_RUN"
  vmName = $null
  vmId = $null
  error = $null
}
$identity = $null
$backupPath = $null
$gateEnabled = $false
$tunnelProcess = $null
$failed = $false
$identityLocal = Join-Path $runDir "identity.env"
$identityRemote = "/tmp/ls-ui-e2e-$stamp.env"
$gateLocal = Join-Path $runDir "gate.env"
$gateRemote = "/tmp/ls-ui-e2e-gate-$stamp.env"
$readbackLocal = Join-Path $runDir "readback.env"
$readbackRemote = "/tmp/ls-ui-e2e-readback-$stamp.env"
$vmName = "ls-ui-e2e-" + (Get-Date -Format "MMddHHmmss")
$summary.vmName = $vmName

try {
  $summary.branchHead = ((Invoke-WslStrict -ArgsList @("git", "-C", $WslWorktree, "rev-parse", "HEAD"))[-1]).Trim()

  $testRoot = "$WslWorktree/src/fireedge/tests/layersentry/browser"
  foreach ($file in @("live-ui-route-matrix.cjs", "live-vm-create-e2e.cjs")) {
    Invoke-WslStrict -ArgsList @(
      "cp", "$testRoot/$file",
      "/mnt/c/Users/opc/layersentry-browser-e2e/$file"
    ) | Out-Null
  }

  Invoke-WslStrict -ArgsList @(
    "cp",
    "$WslWorktree/src/fireedge/src/client/apps/layersentry/navigation.js",
    "$runWsl/source/navigation.js"
  ) | Out-Null
  Invoke-WslStrict -ArgsList @(
    "cp",
    "$WslWorktree/src/fireedge/src/client/apps/layersentry/Portal.js",
    "$runWsl/source/Portal.js"
  ) | Out-Null

  foreach ($helper in @("live-qual-identity.sh", "live-qual-gate.sh", "live-qual-vm.sh")) {
    Invoke-WslStrict -ArgsList @(
      "scp", "-q", "$testRoot/$helper", "rocky-01:/tmp/$helper"
    ) | Out-Null
  }

  Push-Location $browserDir
  try {
    if (-not (Test-Path (Join-Path $browserDir "package.json"))) {
      & npm init -y | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "npm init failed" }
    }
    if (-not (Test-Path (Join-Path $browserDir "node_modules\playwright-core"))) {
      & npm install --no-save playwright-core@1.55.0 | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "playwright-core install failed" }
    }
  }
  finally {
    Pop-Location
  }

  $browserExe = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $browserExe) { throw "No Chromium-compatible browser found on testser" }

  if (-not (Test-LiveTunnel)) {
    $tunnelProcess = Start-Process -FilePath "wsl.exe" -ArgumentList @(
      "-d", "Ubuntu-22.04", "-u", "opc", "--",
      "ssh", "-N", "-o", "ExitOnForwardFailure=yes",
      "-o", "ServerAliveInterval=30",
      "-L", "0.0.0.0:12616:127.0.0.1:2616", "rocky-01"
    ) -WindowStyle Hidden -PassThru
    $ready = $false
    for ($i = 0; $i -lt 20; $i++) {
      Start-Sleep -Seconds 1
      if (Test-LiveTunnel) { $ready = $true; break }
    }
    if (-not $ready) { throw "SSH tunnel to rocky-01 FireEdge did not become ready" }
  }

  Invoke-WslStrict -ArgsList @(
    "ssh", "rocky-01", "bash", "/tmp/live-qual-identity.sh", $identityRemote
  ) | Out-Null
  Invoke-WslStrict -ArgsList @(
    "scp", "-q", "rocky-01:$identityRemote", "$runWsl/identity.env"
  ) | Out-Null
  Invoke-WslStrict -ArgsList @(
    "ssh", "rocky-01", "rm", "-f", $identityRemote
  ) | Out-Null

  $identity = ConvertFrom-StringData ((Get-Content -Raw -LiteralPath $identityLocal))
  $groupEvidence = Invoke-WslStrict -ArgsList @(
    "ssh", "rocky-01", "onegroup", "show", $identity.GID
  )
  $groupEvidence | Set-Content -LiteralPath (Join-Path $runDir "group-view.txt")
  $groupText = $groupEvidence -join [Environment]::NewLine
  if ($groupText -notmatch 'DEFAULT_VIEW="cloud"' -or $groupText -notmatch 'VIEWS="cloud"') {
    throw "Disposable group is not pinned to FIREEDGE cloud view"
  }

  $env:LAYERSENTRY_BASE_URL = $BaseUrl
  $env:LAYERSENTRY_USERNAME = $identity.USER
  $env:LAYERSENTRY_PASSWORD = $identity.PASS
  $env:LAYERSENTRY_PLAYWRIGHT_MODULE = "playwright-core"
  $env:LAYERSENTRY_CHROME_EXECUTABLE = $browserExe
  $env:LAYERSENTRY_SOURCE_ROOT = $sourceDir
  $env:LAYERSENTRY_ROUTE_EVIDENCE_PATH = Join-Path $runDir "baseline-routes.json"
  $env:LAYERSENTRY_EXPECT_BASELINE_FAIL_CLOSED = "1"
  Remove-Item Env:LAYERSENTRY_ROUTE_MATRIX -ErrorAction SilentlyContinue
  Invoke-BrowserHarness -Script (Join-Path $browserDir "live-ui-route-matrix.cjs") -Log (Join-Path $runDir "baseline-route.log")
  $summary.baselineRouteMatrix = "PASS"

  Invoke-WslStrict -ArgsList @(
    "ssh", "rocky-01", "sudo", "-n", "bash", "/tmp/live-qual-gate.sh",
    "enable", $gateRemote
  ) | Set-Content -LiteralPath (Join-Path $runDir "gate-enable.log")
  $gateEnabled = $true
  Invoke-WslStrict -ArgsList @(
    "scp", "-q", "rocky-01:$gateRemote", "$runWsl/gate.env"
  ) | Out-Null
  Invoke-WslStrict -ArgsList @(
    "ssh", "rocky-01", "sudo", "-n", "rm", "-f", $gateRemote
  ) | Out-Null
  $gateState = ConvertFrom-StringData ((Get-Content -Raw -LiteralPath $gateLocal))
  $backupPath = $gateState.BACKUP
  if (-not $backupPath) { throw "Temporary gate backup path was not returned" }
  $summary.vmCreateGate = "ENABLED_TEMPORARILY"

  Remove-Item Env:LAYERSENTRY_EXPECT_BASELINE_FAIL_CLOSED -ErrorAction SilentlyContinue
  $env:LAYERSENTRY_VM_TEMPLATE_NAME = "Rocky-9-PoC"
  $env:LAYERSENTRY_NETWORK_NAME = "POC-LAN"
  $env:LAYERSENTRY_VM_NAME = $vmName
  $env:LAYERSENTRY_EVIDENCE_PATH = Join-Path $runDir "vm-create-browser.json"
  Invoke-BrowserHarness -Script (Join-Path $browserDir "live-vm-create-e2e.cjs") -Log (Join-Path $runDir "vm-create-browser.log")
  $summary.vmBrowserFlow = "PASS"

  $readbackRun = Invoke-WslAllowFail -ArgsList @(
    "ssh", "rocky-01", "bash", "/tmp/live-qual-vm.sh", "readback",
    $identity.USER, $vmName, $readbackRemote
  )
  if ($readbackRun.ExitCode -ne 0) {
    Invoke-WslAllowFail -ArgsList @(
      "scp", "-q", "rocky-01:$readbackRemote", "$runWsl/readback.env"
    ) | Out-Null
    throw "OpenNebula readback failed ($($readbackRun.ExitCode)): $($readbackRun.Output -join ' ')"
  }
  Invoke-WslStrict -ArgsList @(
    "scp", "-q", "rocky-01:$readbackRemote", "$runWsl/readback.env"
  ) | Out-Null
  Invoke-WslStrict -ArgsList @(
    "ssh", "rocky-01", "rm", "-f", $readbackRemote
  ) | Out-Null

  $readback = ConvertFrom-StringData ((Get-Content -Raw -LiteralPath $readbackLocal))
  $summary.vmId = $readback.VMID
  if ($readback.STAT -ne "runn") { throw "VM state is not RUNNING: $($readback.STAT)" }
  if ($readback.UNAME -ne $identity.USER) { throw "VM owner readback mismatch" }
  if ($readback.NAME -ne $vmName) { throw "VM name readback mismatch" }
  if ($readback.DISK_0_IMAGE_ID -ne "0") { throw "VM image readback mismatch" }
  if ($readback.NIC_0_NETWORK_ID -ne "0") { throw "VM network readback mismatch" }
  $summary.authoritativeReadback = "PASS"

} catch {
  $failed = $true
  $summary.error = $_.Exception.Message
}
finally {
  if ($gateEnabled -and -not $backupPath) {
    $recoverGate = Invoke-WslAllowFail -ArgsList @(
      "scp", "-q", "rocky-01:$gateRemote", "$runWsl/gate.env"
    )
    if ($recoverGate.ExitCode -eq 0 -and (Test-Path $gateLocal)) {
      $recoveredGateState = ConvertFrom-StringData ((Get-Content -Raw -LiteralPath $gateLocal))
      $backupPath = $recoveredGateState.BACKUP
    }
  }

  if ($gateEnabled -and $backupPath) {
    $restore = Invoke-WslAllowFail -ArgsList @(
      "ssh", "rocky-01", "sudo", "-n", "bash", "/tmp/live-qual-gate.sh",
      "restore", $backupPath
    )
    $restore.Output | Set-Content -LiteralPath (Join-Path $runDir "gate-restore.log")
    if ($restore.ExitCode -eq 0) {
      $summary.restoredFailClosed = "PASS"
      $gateEnabled = $false
    } else {
      $summary.restoredFailClosed = "FAIL"
      $failed = $true
      if (-not $summary.error) { $summary.error = "Production config restore failed" }
    }
  }

  if ($gateEnabled -and -not $backupPath) {
    $summary.restoredFailClosed = "FAIL_NO_BACKUP_METADATA"
    $failed = $true
    if (-not $summary.error) { $summary.error = "Temporary gate enabled but backup metadata could not be recovered" }
  }

  if ($identity -and $summary.restoredFailClosed -eq "PASS") {
    try {
      $env:LAYERSENTRY_EXPECT_BASELINE_FAIL_CLOSED = "1"
      $env:LAYERSENTRY_ROUTE_EVIDENCE_PATH = Join-Path $runDir "post-restore-routes.json"
      Invoke-BrowserHarness -Script (Join-Path $browserDir "live-ui-route-matrix.cjs") -Log (Join-Path $runDir "post-restore-route.log")
      $summary.postRestoreRouteMatrix = "PASS"
    } catch {
      $summary.postRestoreRouteMatrix = "FAIL"
      $failed = $true
      if (-not $summary.error) { $summary.error = $_.Exception.Message }
    }
  }

  if ($identity) {
    $cleanupRun = Invoke-WslAllowFail -ArgsList @(
      "ssh", "rocky-01", "bash", "/tmp/live-qual-vm.sh", "cleanup",
      $identity.USER, $vmName, $identity.UID, $identity.GID
    )
    $cleanupRun.Output | Set-Content -LiteralPath (Join-Path $runDir "cleanup.log")
    if ($cleanupRun.ExitCode -eq 0) {
      $summary.cleanup = "PASS"
    } else {
      $summary.cleanup = "FAIL"
      $failed = $true
      if (-not $summary.error) { $summary.error = "Disposable resource cleanup failed" }
    }
  }

  $configCheck = Invoke-WslAllowFail -ArgsList @(
    "ssh", "rocky-01", "grep", "-q", "^  VM_CREATE:", "/etc/one/fireedge/sunstone/sunstone-server.conf"
  )
  if ($configCheck.ExitCode -eq 0) {
    $summary.restoredFailClosed = "FAIL_VM_CREATE_STILL_PRESENT"
    $failed = $true
    if (-not $summary.error) { $summary.error = "VM_CREATE remains in production config" }
  }

  Invoke-WslAllowFail -ArgsList @(
    "ssh", "rocky-01", "rm", "-f",
    "/tmp/live-qual-identity.sh", "/tmp/live-qual-gate.sh", "/tmp/live-qual-vm.sh",
    $identityRemote, $readbackRemote
  ) | Out-Null

  Remove-Item -LiteralPath $identityLocal -Force -ErrorAction SilentlyContinue
  Remove-Item Env:LAYERSENTRY_PASSWORD -ErrorAction SilentlyContinue

  if ($tunnelProcess) {
    Stop-Process -Id $tunnelProcess.Id -Force -ErrorAction SilentlyContinue
  }

  $summary.finishedAt = (Get-Date).ToUniversalTime().ToString("o")
  $summaryPath = Join-Path $runDir "summary.json"
  $summary | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $summaryPath
  Write-Output "SUMMARY=$summaryPath"
  Write-Output ($summary | ConvertTo-Json -Compress)
}

if ($failed) { exit 1 }
exit 0
