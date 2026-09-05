# Destructive lifecycle acceptance is restricted to disposable GitHub runners.
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows') { throw 'Run only on a disposable Windows GitHub runner.' }
if (Get-Process paperweave-desktop -ErrorAction SilentlyContinue) { throw 'A desktop instance is already running.' }
$installer = Get-ChildItem 'src-tauri/target/release/bundle/nsis/*-setup.exe' | Select-Object -First 1
if (!$installer) { throw 'Missing installer' }
$installPath = Join-Path $env:LOCALAPPDATA 'Paperweave'
$dataPath = Join-Path $env:APPDATA 'org.paperweave.desktop'
$registryPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Paperweave'
if ((Test-Path -LiteralPath $installPath) -or (Test-Path -LiteralPath $dataPath) -or (Test-Path -LiteralPath $registryPath)) { throw 'Expected a pristine runner.' }
$expectedInstall = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Paperweave'))
if ([IO.Path]::GetFullPath($installPath) -ne $expectedInstall) { throw 'Invalid test install path' }
New-Item -ItemType Directory -Force (Join-Path $dataPath 'workspace/vault') | Out-Null
$sentinel = Join-Path $dataPath 'workspace/vault/synthetic-retention.md'
Set-Content -LiteralPath $sentinel -Value '# Synthetic fixture: uninstall must preserve research.' -Encoding utf8
$expectedHash = (Get-FileHash -LiteralPath $sentinel).Hash
function Invoke-BoundedInstaller([string]$executable, [string]$arguments, [int]$expectedExit = 0) {
  $process = Start-Process -FilePath $executable -ArgumentList $arguments -WindowStyle Hidden -PassThru
  if (!$process.WaitForExit(180000)) { throw 'Installer timed out' }
  if ($process.ExitCode -ne $expectedExit) { throw "Installer exit code $($process.ExitCode), expected $expectedExit" }
}
$legacy = Get-ChildItem 'artifacts/legacy-installer/*-setup.exe' | Select-Object -First 1
if (!$legacy) { throw 'Missing real legacy installer' }
if ((Get-FileHash -LiteralPath $legacy.FullName).Hash -ne '035F2E603D44F7DEAC0A0C7497E08B9C2B83F2C3FEA3D0CFE0AEA15A8A4975AD') { throw 'Legacy installer checksum mismatch' }
Invoke-BoundedInstaller $legacy.FullName '/S'
$entry = Get-ItemProperty -LiteralPath $registryPath
if ($entry.DisplayVersion -ne '0.2.0') { throw 'Expected the actual 0.2.0 installation' }
$oldUninstallerHash = (Get-FileHash -LiteralPath (Join-Path $installPath 'uninstall.exe')).Hash
# Reproduce the publisher-key mismatch, retaining the canonical Installed Apps entry.
$manufacturerKey = 'HKCU:\Software\paperweave\Paperweave'
Remove-ItemProperty -LiteralPath $manufacturerKey -Name '(default)' -ErrorAction SilentlyContinue
$fixtureNode = Join-Path $installPath 'paperweave/runtime/node.exe'
$holder = Join-Path $env:RUNNER_TEMP 'shanzi-lock-fixture.js'
Set-Content -LiteralPath $holder -Value 'setInterval(() => {}, 1000);' -Encoding utf8
$owned = Start-Process -FilePath $fixtureNode -ArgumentList "`"$holder`"" -WindowStyle Hidden -PassThru
$external = Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList "`"$holder`"" -WindowStyle Hidden -PassThru
try {
  # Silent maintenance refuses a live installation instead of killing sessions.
  Invoke-BoundedInstaller $installer.FullName '/S' 10
  if ($owned.HasExited -or $external.HasExited) { throw 'Silent install killed a running process' }
  if ((Get-FileHash -LiteralPath (Join-Path $installPath 'uninstall.exe')).Hash -ne $oldUninstallerHash) { throw 'Blocked install changed the old uninstaller' }
  Write-Output 'PASS busy legacy install refuses silent upgrade without ending any session'
  & ./scripts/desktop-maintenance.ps1 -InstallDir $installPath -Mode Stop
  if ($LASTEXITCODE -ne 0) { throw 'Maintenance fixture could not release installation' }
  if ($external.HasExited) { throw 'Maintenance touched external Node' }
  # /P runs the real uninstall-before-install page flow, including _?= directory.
  Invoke-BoundedInstaller $installer.FullName '/P'
} finally {
  foreach ($fixture in @($owned,$external)) { if (!$fixture.HasExited) { Stop-Process -Id $fixture.Id } }
}
$entry = Get-ItemProperty -LiteralPath $registryPath
if ($entry.DisplayName -ne '扇子') { throw 'Product display name was not migrated' }
if ($entry.InstallLocation.Trim('"') -ne $installPath) { throw 'Upgrade moved the installation and broke MCP paths' }
if ((Get-FileHash -LiteralPath $sentinel).Hash -ne $expectedHash) { throw 'Upgrade changed research data' }
Write-Output 'PASS real 0.2.0 uninstall-before-install upgrade with missing publisher path; Shanzi name and research retained'
$entry = Get-ItemProperty -LiteralPath $registryPath
$expectedVersion = (Get-Content 'src-tauri/tauri.conf.json' -Raw | ConvertFrom-Json).version
if ($entry.DisplayVersion -ne $expectedVersion) { throw 'Incorrect installed version' }
if (!(Test-Path -LiteralPath (Join-Path $installPath 'uninstall.exe'))) { throw 'Missing uninstaller' }
$shortcut = Join-Path $env:APPDATA 'Microsoft/Windows/Start Menu/Programs/扇子/卸载扇子.lnk'
if (!(Test-Path -LiteralPath $shortcut)) { throw 'Missing uninstall shortcut' }
Write-Output 'PASS current-user install, version registry, bundled uninstaller and start-menu uninstall entry'
# _?= runs the uninstaller in place, so WaitForExit observes actual completion.
Invoke-BoundedInstaller (Join-Path $installPath 'uninstall.exe') "/S _?=$installPath"
if ((Test-Path -LiteralPath $registryPath) -or (Test-Path -LiteralPath $shortcut) -or (Test-Path -LiteralPath (Join-Path $installPath 'paperweave-desktop.exe'))) { throw 'Uninstall left application registration or executable behind' }
if ((Get-FileHash -LiteralPath $sentinel).Hash -ne $expectedHash) { throw 'Uninstall changed research data' }
Write-Output 'PASS uninstall removes application and shortcut while retaining exact research fixture'
Invoke-BoundedInstaller $installer.FullName '/S'
if ((Get-FileHash -LiteralPath $sentinel).Hash -ne $expectedHash) { throw 'Reinstall changed research data' }
Write-Output 'PASS reinstall preserves research data'
