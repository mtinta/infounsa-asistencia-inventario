# Genera los instaladores .exe (NSIS) de Asistencia e Inventario y los copia a la carpeta de salida.
# Uso (PowerShell, en Windows, desde cualquier carpeta del repositorio):
#   powershell -ExecutionPolicy Bypass -File scripts\generar-instaladores-windows.ps1
# Opciones: -OutputDir <carpeta> (por defecto "instaladores"), -SkipInstall (no ejecuta pnpm install)
param(
    [string]$OutputDir = "instaladores",
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$resolvedOutput = if ([System.IO.Path]::IsPathRooted($OutputDir)) { $OutputDir } else { Join-Path $repoRoot $OutputDir }

foreach ($tool in @("node", "pnpm")) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "No se encontro '$tool'. Instala Node.js 22.12+ y pnpm (npm install -g pnpm)." }
}

$products = @(
    @{ Name = "Asistencia"; Package = "infounsa-asistencia-desktop"; Directory = "apps/asistencia/desktop" },
    @{ Name = "Inventario"; Package = "infounsa-inventario-desktop"; Directory = "apps/inventario/desktop" }
)

New-Item -ItemType Directory -Force -Path $resolvedOutput | Out-Null
$sourceSha = "n/d"
if (Get-Command git -ErrorAction SilentlyContinue) {
    $sha = (git -C $repoRoot rev-parse HEAD 2>$null)
    if ($LASTEXITCODE -eq 0 -and $sha) { $sourceSha = $sha.Trim() }
}
$generatedAt = (Get-Date).ToString("o")
$artifacts = @()

Push-Location $repoRoot
try {
    if (-not $SkipInstall) {
        Write-Host "Instalando dependencias (pnpm install)..."
        pnpm install --frozen-lockfile
        if ($LASTEXITCODE -ne 0) { throw "Fallo pnpm install." }
    }
    Write-Host "Compilando paquetes compartidos..."
    pnpm run build:packages
    if ($LASTEXITCODE -ne 0) { throw "Fallo la compilacion de los paquetes compartidos." }

    foreach ($product in $products) {
        $projectDir = Join-Path $repoRoot $product.Directory
        $package = Get-Content -Raw (Join-Path $projectDir "package.json") | ConvertFrom-Json
        $version = $package.version
        $distDir = Join-Path $projectDir "dist-electron"

        Write-Host "Generando instalador de $($product.Name) $version (commit $sourceSha)..."
        if (Test-Path $distDir) { Remove-Item $distDir -Recurse -Force }

        $paquete = $product.Package
        pnpm --filter $paquete run dist
        if ($LASTEXITCODE -ne 0) { throw "Fallo la generacion del instalador de $($product.Name)." }

        $built = Get-ChildItem -Path $distDir -Filter "*.exe" -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if (-not $built) { throw "No se encontro ningun .exe en $distDir" }

        $filename = "InfoUNSA-$($product.Name)-Setup-$version-x64.exe"
        $destination = Join-Path $resolvedOutput $filename
        Copy-Item -LiteralPath $built.FullName -Destination $destination -Force

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
} finally {
    Pop-Location
}

$manifest = [ordered]@{
    generatedAt = $generatedAt
    sourceSha = $sourceSha
    artifacts = $artifacts
}
$manifestPath = Join-Path $resolvedOutput "release-manifest.json"
$manifest | ConvertTo-Json -Depth 5 | Set-Content -Path $manifestPath -Encoding utf8

Write-Host ""
Write-Host "Instaladores generados en: $resolvedOutput"
Get-Content $manifestPath
