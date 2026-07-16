[CmdletBinding()]
param(
    [switch]$SkipInstall,
    [switch]$VerifyOnly,
    [switch]$SmokeLaunch
)

$ErrorActionPreference = 'Stop'
$RootDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$TauriDir = Join-Path $RootDir 'apps/asset-desktop/src-tauri'
$ArtifactDir = Join-Path $RootDir 'artifacts/windows'

Set-Location $RootDir

if (-not $VerifyOnly) {
    foreach ($Command in @('node', 'npm', 'cargo')) {
        if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) {
            throw "Missing required command: $Command"
        }
    }

    if (-not $SkipInstall) {
        npm ci --ignore-scripts
        if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
    }

    npm run test:assets
    if ($LASTEXITCODE -ne 0) { throw 'Asset tests failed' }

    npm run tauri --workspace @arcspro/asset-desktop -- build --bundles msi,nsis --target x86_64-pc-windows-msvc
    if ($LASTEXITCODE -ne 0) { throw 'Tauri Windows build failed' }
}

$Installers = @(
    Get-ChildItem -Path (Join-Path $TauriDir 'target') -Recurse -File |
        Where-Object {
            $_.Extension -eq '.msi' -or
            ($_.Extension -eq '.exe' -and $_.Name -match 'setup')
        }
)

if (-not ($Installers | Where-Object Extension -eq '.msi')) {
    throw 'Windows MSI installer was not produced'
}
if (-not ($Installers | Where-Object { $_.Extension -eq '.exe' -and $_.Name -match 'setup' })) {
    throw 'Windows NSIS setup executable was not produced'
}

if ($SmokeLaunch) {
    $Executable = Get-ChildItem -Path (Join-Path $TauriDir 'target') -Recurse -File -Filter 'arcspro-asset-desktop.exe' |
        Where-Object { $_.FullName -match '[\\/]release[\\/]' } |
        Select-Object -First 1
    if (-not $Executable) { throw 'Windows desktop executable was not produced' }

    $Process = Start-Process -FilePath $Executable.FullName -PassThru
    try {
        Start-Sleep -Seconds 8
        $Process.Refresh()
        if ($Process.HasExited) {
            throw "Windows desktop process exited during smoke test with code $($Process.ExitCode)"
        }
    } finally {
        $Process.Refresh()
        if (-not $Process.HasExited) { Stop-Process -Id $Process.Id -Force }
    }
    Write-Host 'Windows desktop launch smoke test passed'
}

New-Item -ItemType Directory -Path $ArtifactDir -Force | Out-Null
$ChecksumLines = foreach ($Installer in ($Installers | Sort-Object Name)) {
    if ($Installer.Length -le 0) { throw "Installer is empty: $($Installer.FullName)" }
    $Hash = Get-FileHash -Algorithm SHA256 -Path $Installer.FullName
    Copy-Item -Path $Installer.FullName -Destination (Join-Path $ArtifactDir $Installer.Name) -Force
    '{0}  {1}' -f $Hash.Hash.ToLowerInvariant(), $Installer.Name
}

$ChecksumPath = Join-Path $ArtifactDir 'SHA256SUMS.txt'
$ChecksumLines | Set-Content -Path $ChecksumPath -Encoding utf8

Write-Host 'Verified Windows installers:'
$Installers | ForEach-Object { Write-Host "- $($_.Name) ($($_.Length) bytes)" }
Write-Host "SHA-256 manifest: $ChecksumPath"
