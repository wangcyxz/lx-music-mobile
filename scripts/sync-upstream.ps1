param(
    [string]$Tag = ''
)

# ============================================================
#  Merge a new upstream release (lyswhut/lx-music-mobile)
#  usage: sync-upstream.bat [v1.9.3]
#  GitHub access here is flaky (proxy 502 / truncated packs),
#  so every network call is retried.
# ============================================================

$ErrorActionPreference = 'Continue'
$root = 'D:\ProgramData\workbuddy\LXmusic-MG'
$project = Join-Path $root 'lx-music-mobile'
Set-Location $project

function Invoke-GitRetry {
    param(
        [string[]]$GitArgs,
        [int]$Attempts = 4,
        [string]$What = 'git'
    )
    for ($i = 1; $i -le $Attempts; $i++) {
        & git @GitArgs 2>&1 | Out-Host
        if ($LASTEXITCODE -eq 0) { return $true }
        if ($i -lt $Attempts) {
            Write-Host ("  retry {0}/{1} in 5s ({2})" -f $i, $Attempts, $What) -ForegroundColor Yellow
            Start-Sleep -Seconds 5
        }
    }
    return $false
}

function Get-UpstreamTags {
    $out = & git ls-remote --tags --refs upstream 2>$null
    if ($LASTEXITCODE -ne 0) { return @() }
    $list = @()
    foreach ($line in $out) {
        if ($line -match 'refs/tags/(.+)$') {
            $t = $Matches[1]
            if ($t -match '^v\d+(\.\d+)+$') { $list += $t }
        }
    }
    return $list
}

Write-Host '=== 1/4 fetch upstream master ==='
$ok = Invoke-GitRetry -GitArgs @('-c', 'http.postBuffer=524288000', 'fetch', '--no-tags', 'upstream', 'master') -What 'fetch master'
if (-not $ok) { Write-Host '[ERROR] GitHub unreachable, check proxy/network' -ForegroundColor Red; exit 1 }

Write-Host ''
Write-Host '=== 2/4 pick upstream tag ==='
$remoteTags = Get-UpstreamTags
if ($remoteTags.Count -eq 0) {
    $remoteTags = @(& git tag | Where-Object { $_ -match '^upstream-v\d+(\.\d+)+$' } | ForEach-Object { $_.Substring(9) })
}
$sorted = $remoteTags | Sort-Object { [version]($_.Substring(1)) } -Descending
Write-Host 'recent upstream tags:'
$sorted | Select-Object -First 6 | ForEach-Object { Write-Host ("    " + $_) }

if ([string]::IsNullOrWhiteSpace($Tag)) {
    $Tag = ($sorted | Select-Object -First 1)
}
if ([string]::IsNullOrWhiteSpace($Tag)) { Write-Host '[ERROR] no tag found' -ForegroundColor Red; exit 1 }
if ($Tag -notmatch '^v') { $Tag = 'v' + $Tag }
Write-Host ("target: " + $Tag) -ForegroundColor Cyan

Write-Host ''
Write-Host '=== 3/4 fetch tag objects ==='
# upstream tags are stored as upstream-vX.Y.Z so they never clash with our own
# release tags (vX.Y.Z points at our fork commit).
$localTag = "upstream-$Tag"
$ok = Invoke-GitRetry -GitArgs @('-c', 'http.postBuffer=524288000', 'fetch', '--no-tags', 'upstream', ("refs/tags/{0}:refs/tags/{1}" -f $Tag, $localTag)) -What "fetch $Tag"
if (-not $ok) { Write-Host "[ERROR] cannot fetch tag $Tag" -ForegroundColor Red; exit 1 }

Write-Host ''
Write-Host '=== 4/4 merge ==='
& git --no-pager log --oneline --no-decorate "HEAD..$localTag"
if ($LASTEXITCODE -ne 0) { Write-Host "[ERROR] tag $localTag not found locally" -ForegroundColor Red; exit 1 }

& git merge $localTag --no-edit
if ($LASTEXITCODE -ne 0) {
    Write-Host ''
    Write-Host '[CONFLICT] resolve manually:' -ForegroundColor Yellow
    Write-Host '  1. edit conflicted files, keep custom features + upstream fixes'
    Write-Host '  2. git add <files>'
    Write-Host '  3. git commit'
    Write-Host '  4. run scripts\build-release.bat'
    exit 1
}

Write-Host ''
Write-Host ("[DONE] merged " + $Tag) -ForegroundColor Green
Write-Host 'next:'
Write-Host '  1. bump package.json version / versionCode'
Write-Host '  2. update publish\version.json and CHANGELOG.md'
Write-Host '  3. run scripts\build-release.bat'
Write-Host '  4. git tag vX.Y.Z, then scripts\push-to-github.bat'
Write-Host '  5. scripts\create-release.ps1  (creates Release + uploads APK)'
exit 0
