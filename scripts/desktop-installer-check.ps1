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
function Invoke-BoundedInstaller([string]$executable, [string]$arguments) {
  $process = Start-Process -FilePath $executable -ArgumentList $arguments -WindowStyle Hidden -PassThru
  if (!$process.WaitForExit(180000)) { throw 'Installer timed out' }
  if ($process.ExitCode -ne 0) { throw "Installer exit code $($process.ExitCode)" }
}
Invoke-BoundedInstaller $installer.FullName '/S'
$entry = Get-ItemProperty -LiteralPath $registryPath
$expectedVersion = (Get-Content 'src-tauri/tauri.conf.json' -Raw | ConvertFrom-Json).version
if ($entry.DisplayVersion -ne $expectedVersion) { throw 'Incorrect installed version' }
if (!(Test-Path -LiteralPath (Join-Path $installPath 'uninstall.exe'))) { throw 'Missing uninstaller' }
$shortcut = Join-Path $env:APPDATA 'Microsoft/Windows/Start Menu/Programs/Paperweave/Uninstall Paperweave.lnk'
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
