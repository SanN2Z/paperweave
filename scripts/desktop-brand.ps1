# Mechanical packaging of the approved mascot into the NSIS bitmap slots.
# The original illustration is generated artwork, never recreated by this script.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$brandRoot = Split-Path -Parent $PSScriptRoot
$brandOutput = Join-Path $brandRoot 'src-tauri/installer'
$brandSource = [System.Drawing.Image]::FromFile((Join-Path $brandRoot 'assets/brand/fan-sprite-master.png'))
New-Item -ItemType Directory -Force $brandOutput | Out-Null
function Write-InstallerBitmap([string]$name, [int]$width, [int]$height, [bool]$sidebar) {
  $bitmap = New-Object System.Drawing.Bitmap($width, $height, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb))
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $ink = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#303338'))
  $muted = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#81837f'))
  $titleFont = New-Object System.Drawing.Font('Segoe UI', 15, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel))
  $captionFont = New-Object System.Drawing.Font('Segoe UI', 9, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel))
  try {
    $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml($(if ($sidebar) { '#f5f5f1' } else { '#ffffff' })))
    if ($sidebar) {
      $graphics.DrawImage($brandSource, 24, 55, 116, 116)
      $graphics.DrawString('SHANZI', $titleFont, $ink, 38, 192)
      $graphics.DrawString('A home for your research.', $captionFont, $muted, 29, 219)
      $graphics.DrawString('READ  /  THINK  /  CREATE', $captionFont, $muted, 26, 280)
    } else {
      $graphics.DrawImage($brandSource, 106, 6, 43, 43)
      $graphics.DrawString('SHANZI', $titleFont, $ink, 14, 18)
    }
    $bitmap.Save((Join-Path $brandOutput $name), [System.Drawing.Imaging.ImageFormat]::Bmp)
  } finally {
    $graphics.Dispose(); $bitmap.Dispose(); $titleFont.Dispose(); $captionFont.Dispose(); $ink.Dispose(); $muted.Dispose()
  }
}
try {
  Write-InstallerBitmap 'sidebar.bmp' 164 314 $true
  Write-InstallerBitmap 'header.bmp' 150 57 $false
} finally { $brandSource.Dispose() }
Write-Output 'Packaged installer bitmaps from the original mascot.'
