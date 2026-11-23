# Bootstrap portable Windows : télécharge et vérifie le Node.js LOCAL du projet,
# puis installe les dépendances npm dans le projet. Aucun Node global, aucun administrateur requis.
[CmdletBinding()]
param([switch]$NodeOnly)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Version = (Get-Content -Raw (Join-Path $Root 'scripts/node-version.txt')).Trim()
$Cache = Join-Path $Root '.tools/node/cache'

switch ($env:PROCESSOR_ARCHITECTURE) {
  'AMD64' { $Arch = 'x64' }
  'ARM64' { $Arch = 'arm64' }
  default { throw "[DIGITAL LIFE] Architecture non prise en charge : $($env:PROCESSOR_ARCHITECTURE)" }
}

$FileName = "node-$Version-win-$Arch.zip"
$BaseUrl = "https://nodejs.org/dist/$Version"
$Target = Join-Path $Root ".tools/node/versions/$Version-win-$Arch"

Write-Host "[DIGITAL LIFE] Node portable : $Version (win/$Arch)"

$Ready = $false
$NodeBin = Join-Path $Target 'node.exe'
if (Test-Path $NodeBin) {
  $Actual = & $NodeBin -p 'process.version'
  if ($Actual -eq $Version) {
    Write-Host "[DIGITAL LIFE] Node local déjà présent ($Actual)."
    $Ready = $true
  } else {
    Write-Host "[DIGITAL LIFE] Version obsolète ($Actual), remplacement par $Version."
  }
}

if (-not $Ready) {
  New-Item -ItemType Directory -Force -Path $Cache | Out-Null
  $Tmp = Join-Path $Cache ("bootstrap." + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Force -Path $Tmp | Out-Null

  try {
    $Archive = Join-Path $Tmp $FileName
    $SumsPath = Join-Path $Tmp 'SHASUMS256.txt'
    Write-Host "[DIGITAL LIFE] Téléchargement de $FileName (source officielle nodejs.org)…"
    Invoke-WebRequest -Uri "$BaseUrl/$FileName" -OutFile $Archive -UseBasicParsing
    Write-Host '[DIGITAL LIFE] Téléchargement des sommes de contrôle officielles…'
    Invoke-WebRequest -Uri "$BaseUrl/SHASUMS256.txt" -OutFile $SumsPath -UseBasicParsing

    $Expected = ($SumsPath | Get-Content | Where-Object { $_ -match "  $FileName$" } | Select-Object -First 1) -split '\s+' | Select-Object -First 1
    if (-not $Expected) { throw "[DIGITAL LIFE] Somme de contrôle introuvable pour $FileName." }
    $ActualHash = (Get-FileHash -Algorithm SHA256 -Path $Archive).Hash.ToLowerInvariant()
    if ($ActualHash -ne $Expected.ToLowerInvariant()) {
      throw "[DIGITAL LIFE] Échec de vérification SHA-256 (attendu $Expected, obtenu $ActualHash)."
    }
    Write-Host '[DIGITAL LIFE] SHA-256 vérifié.'

    $Extract = Join-Path $Tmp 'extract'
    Expand-Archive -Path $Archive -DestinationPath $Extract -Force
    $Inner = Join-Path $Extract "node-$Version-win-$Arch"
    if (-not (Test-Path (Join-Path $Inner 'node.exe'))) {
      throw '[DIGITAL LIFE] Archive Node invalide (node.exe absent).'
    }

    $Staging = "$Target.staging"
    if (Test-Path $Staging) { Remove-Item -Recurse -Force $Staging }
    New-Item -ItemType Directory -Force -Path $Staging | Out-Null
    Get-ChildItem -Force $Inner | ForEach-Object { Move-Item -Force $_.FullName $Staging }
    if (Test-Path $Target) { Remove-Item -Recurse -Force $Target }
    Move-Item -Force $Staging $Target
    Write-Host "[DIGITAL LIFE] Node local installé dans $Target"
  } finally {
    Remove-Item -Recurse -Force $Tmp -ErrorAction SilentlyContinue
  }
}

$NpmCli = Join-Path $Target 'lib/node_modules/npm/bin/npm-cli.js'
if ($NodeOnly) {
  Write-Host '[DIGITAL LIFE] Bootstrap Node terminé (-NodeOnly).'
  exit 0
}

Write-Host '[DIGITAL LIFE] Installation des dépendances npm (dossier local)…'
& $NodeBin $NpmCli install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw "[DIGITAL LIFE] npm install a échoué ($LASTEXITCODE)." }

Write-Host '[DIGITAL LIFE] Copie du binaire WebAssembly sql.js…'
& $NodeBin (Join-Path $Root 'scripts/copy-wasm.mjs')
if ($LASTEXITCODE -ne 0) { throw '[DIGITAL LIFE] Copie du WASM échouée.' }

Write-Host '[DIGITAL LIFE] Vérification des dépendances…'
& $NodeBin (Join-Path $Root 'scripts/check-deps.mjs')
if ($LASTEXITCODE -ne 0) { throw '[DIGITAL LIFE] Vérification des dépendances échouée.' }

Write-Host '[DIGITAL LIFE] Bootstrap terminé.'
