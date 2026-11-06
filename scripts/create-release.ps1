# ============================================================
#  Create / update the GitHub Release for the current version
#  and upload the APK built by build-release.bat
#
#  usage:  powershell -ExecutionPolicy Bypass -File scripts\create-release.ps1
#          powershell -ExecutionPolicy Bypass -File scripts\create-release.ps1 -Draft
#
#  token: read from Git Credential Manager (git credential fill),
#         so run push-to-github.bat once before this script.
# ============================================================
param(
  [switch]$Draft,
  [switch]$Prerelease
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
# NOTE: do NOT override ServerCertificateValidationCallback here. On this
# machine the proxy certificate is already trusted; replacing the callback
# with a scriptblock makes the TLS handshake fail in a non-interactive runspace.

$root    = 'D:\ProgramData\workbuddy\LXmusic-MG'
$project = Join-Path $root 'lx-music-mobile'
$owner   = 'wangcyxz'
$repo    = 'lx-music-mobile'

Set-Location $project

# ---- version -------------------------------------------------
$pkg     = Get-Content (Join-Path $project 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$version = $pkg.version
$tag     = "v$version"
Write-Host "version = $version  tag = $tag"

# ---- token ---------------------------------------------------
$gitCmd = (Get-Command git -ErrorAction SilentlyContinue).Source
if (-not $gitCmd) {
  $candidates = @(
    'D:\ProgramData\workbuddy\.workbuddy\binaries\PortableGit\versions\1.3.0\cmd\git.exe',
    'C:\Program Files\Git\cmd\git.exe',
    'C:\Program Files (x86)\Git\cmd\git.exe'
  )
  $gitCmd = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $gitCmd) { throw 'git not found; add Git to PATH or edit $candidates in this script' }

$cred = "protocol=https`nhost=github.com`n`n" | & $gitCmd credential fill 2>$null
$token = ($cred | Select-String '^password=' | ForEach-Object { $_.Line.Substring(9) })
if (-not $token) {
  throw 'no GitHub credential found. run scripts\push-to-github.bat and sign in once.'
}
$headers = @{
  Authorization          = "Bearer $token"
  Accept                 = 'application/vnd.github+json'
  'User-Agent'           = 'lx-fork-release'
}

# ---- release body --------------------------------------------
$bodyFile = Join-Path $project 'publish\changeLog.md'
if (Test-Path $bodyFile) {
  # cast to [string]: the if-expression otherwise keeps a PSObject wrapper and
  # ConvertTo-Json serialises it as {"value": ...} -> GitHub answers 422
  [string]$body = (Get-Content $bodyFile -Raw -Encoding UTF8)
} else {
  [string]$body = "release $version"
}

$payload = @{
  tag_name         = $tag
  target_commitish = 'master'
  name             = "LX Music 魔改版 $tag"
  body             = $body
  draft            = [bool]$Draft
  prerelease       = [bool]$Prerelease
} | ConvertTo-Json -Depth 3

# PowerShell 5.1 would otherwise send the body in the ANSI code page and
# GitHub answers 422; always hand it UTF-8 bytes.
$payloadBytes = [System.Text.Encoding]::UTF8.GetBytes($payload)

# ---- create or reuse release --------------------------------
$api = "https://api.github.com/repos/$owner/$repo/releases"
$release = $null

# look for an existing release for this tag first (avoids a 422 round trip)
try {
  $all = Invoke-RestMethod -Uri $api -Headers $headers -Method Get
  $release = $all | Where-Object { $_.tag_name -eq $tag } | Select-Object -First 1
} catch {
  Write-Host "list releases failed: $($_.ErrorDetails.Message)"
}

if ($release) {
  Write-Host "release already exists (id=$($release.id)), reusing it"
} else {
  try {
    $release = Invoke-RestMethod -Uri $api -Method Post -Headers $headers -Body $payloadBytes -ContentType 'application/json; charset=utf-8'
    Write-Host "created release id=$($release.id)"
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    throw "create release failed: HTTP $code $($_.ErrorDetails.Message)"
  }
}
if (-not $release) { throw "cannot find or create release for $tag" }

# ---- upload assets ------------------------------------------
$assets = Get-ChildItem (Join-Path $root 'release') -Filter "lx-music-mobile-v$version-*.apk" |
          Where-Object { $_.Length -gt 1MB }
if (-not $assets) { throw "no APK found in $root\release for version $version" }

foreach ($file in $assets) {
  $existing = $release.assets | Where-Object { $_.name -eq $file.Name }
  if ($existing) {
    Write-Host "asset $($file.Name) exists, deleting old upload"
    Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$repo/releases/assets/$($existing.id)" `
      -Method Delete -Headers $headers | Out-Null
  }
  $uploadUrl = "https://uploads.github.com/repos/$owner/$repo/releases/$($release.id)/assets?name=$($file.Name)"
  $sizeMB = [math]::Round($file.Length / 1MB, 2)
  Write-Host "uploading $($file.Name) ($sizeMB MB) ..."
  $res = Invoke-RestMethod -Uri $uploadUrl -Method Post -Headers $headers `
    -ContentType 'application/vnd.android.package-archive' -InFile $file.FullName -TimeoutSec 900
  Write-Host "  -> $($res.browser_download_url)"
}

Write-Host ''
Write-Host "[DONE] https://github.com/$owner/$repo/releases/tag/$tag"
Write-Host "in-app update check reads:"
Write-Host "  https://raw.githubusercontent.com/$owner/$repo/master/publish/version.json"
Write-Host "apk download url:"
Write-Host "  https://github.com/$owner/$repo/releases/download/$tag/lx-music-mobile-$tag-arm64-v8a.apk"
