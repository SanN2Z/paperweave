param(
  [Parameter(Mandatory=$true)][string]$InstallDir,
  [ValidateSet('Check','Stop')][string]$Mode = 'Check'
)
# Installer-only helper: exact executable paths and current-user ownership.
# It never kills a process tree, external Node, Codex, Python or a research job by name.
$ErrorActionPreference = 'Stop'
try {
  $maintenanceRoot = [IO.Path]::GetFullPath($InstallDir).TrimEnd('\')
  if ($maintenanceRoot.Length -le 3) { throw 'Invalid installation root' }
  $packageFile = Join-Path $maintenanceRoot 'paperweave/package.json'
  if (!(Test-Path -LiteralPath $packageFile)) { exit 0 }
  $package = Get-Content -LiteralPath $packageFile -Raw -Encoding utf8 | ConvertFrom-Json
  if ($package.name -ne 'paperweave') { throw 'Unrecognized installation' }
  $maintenanceSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $targets = @((Join-Path $maintenanceRoot 'paperweave-desktop.exe'), (Join-Path $maintenanceRoot 'paperweave/runtime/node.exe'))
  $owned = @(Get-CimInstance Win32_Process -Filter "Name = 'paperweave-desktop.exe' OR Name = 'node.exe'" | Where-Object {
    if ($_.ExecutablePath -and $targets -contains $_.ExecutablePath) {
      $owner = Invoke-CimMethod -InputObject $_ -MethodName GetOwnerSid
      if ($owner.ReturnValue -ne 0) { throw 'Cannot establish process ownership' }
      $owner.Sid -eq $maintenanceSid
    } else { $false }
  })
  if (!$owned.Count) { exit 0 }
  if ($Mode -eq 'Check') { Write-Output 'INSTALLATION_BUSY'; exit 10 }
  # Interactive installer obtains confirmation before requesting Stop.
  foreach ($item in ($owned | Sort-Object @{Expression={ if ($_.Name -eq 'paperweave-desktop.exe') { 0 } else { 1 } }})) {
    $current = Get-CimInstance Win32_Process -Filter "ProcessId = $($item.ProcessId)"
    if (!$current) { continue }
    if ($current.ExecutablePath -ne $item.ExecutablePath -or $current.CreationDate -ne $item.CreationDate) { throw 'Process identity changed' }
    Stop-Process -Id $item.ProcessId -ErrorAction Stop
    Wait-Process -Id $item.ProcessId -Timeout 12 -ErrorAction SilentlyContinue
    if ($item.Name -eq 'paperweave-desktop.exe') { Start-Sleep -Milliseconds 1000 }
  }
  Write-Output 'INSTALLATION_RELEASED'
  exit 0
} catch { Write-Output 'INSTALLATION_CHECK_FAILED'; exit 20 }
