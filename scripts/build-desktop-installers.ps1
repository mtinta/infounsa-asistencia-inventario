param(
    [string]$OutputDir = "artifacts/desktop-release"
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$resolvedOutput = if ([System.IO.Path]::IsPathRooted($OutputDir)) {
    $OutputDir
} else {
    Join-Path $repoRoot $OutputDir
}

$products = @(
    @{
        Name = "Asistencia"
        Directory = "apps/asistencia/desktop"
    },
    @{
        Name = "Inventario"
        Directory = "apps/inventario/desktop"
    }
)

New-Item -ItemType Directory -Force -Path $resolvedOutput | Out-Null
$sourceSha = (git -C $repoRoot rev-parse HEAD).Trim()
$generatedAt = (Get-Date).ToString("o")
$artifacts = @()

foreach ($product in $products) {
    $projectDir = Join-Path $repoRoot $product.Directory
    $package = Get-Content -Raw (Join-Path $projectDir "package.json") | ConvertFrom-Json
    $version = $package.version

    Write-Host "Building $($product.Name) Desktop $version from $sourceSha"
    Push-Location $projectDir
    try {
        npm ci --ignore-scripts --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw "npm ci failed for $($product.Name)." }

        npx --no-install electron-builder install-app-deps
        if ($LASTEXITCODE -ne 0) { throw "Native dependency rebuild failed for $($product.Name)." }

        npm run dist
        if ($LASTEXITCODE -ne 0) { throw "Installer build failed for $($product.Name)." }
    } finally {
        Pop-Location
    }

    $sourceInstaller = Join-Path $projectDir "dist-electron/InfoUNSA-$($product.Name) Setup $version.exe"
    if (-not (Test-Path -LiteralPath $sourceInstaller)) {
        throw "Expected installer not found: $sourceInstaller"
    }

    $filename = "InfoUNSA-$($product.Name)-Setup-$version-x64.exe"
    $destination = Join-Path $resolvedOutput $filename
    Copy-Item -LiteralPath $sourceInstaller -Destination $destination -Force

    $file = Get-Item -LiteralPath $destination
    $hash = Get-FileHash -LiteralPath $destination -Algorithm SHA256
    $signature = Get-AuthenticodeSignature -LiteralPath $destination
    $artifacts += [ordered]@{
        product = $product.Name.ToLowerInvariant()
        version = $version
        architecture = "x64"
        filename = $filename
        sizeBytes = $file.Length
        sha256 = $hash.Hash
        signatureStatus = [string]$signature.Status
    }
}

$manifest = [ordered]@{
    generatedAt = $generatedAt
    sourceSha = $sourceSha
    artifacts = $artifacts
}
$manifestPath = Join-Path $resolvedOutput "release-manifest.json"
$manifest | ConvertTo-Json -Depth 5 | Set-Content -Path $manifestPath -Encoding utf8

Write-Host "Desktop release generated at $resolvedOutput"
Get-Content $manifestPath
