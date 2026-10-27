param([string]$Architectures = 'arm64-v8a', [switch]$SkipPrebuild)
$ErrorActionPreference = 'Stop'
$appRoot = Split-Path $PSScriptRoot -Parent
Push-Location $appRoot
try {
    $env:NODE_ENV = 'development'
    $env:LEADER_DEV_CLIENT = '1'
    $env:EXPO_PUBLIC_UPDATE_CHANNEL = 'dev'
    $env:EXPO_PUBLIC_API_URL_DEV = if ($env:LEADER_DEV_API_URL) { $env:LEADER_DEV_API_URL } else { 'https://dev.leader-product.ru' }
    $env:EXPO_PUBLIC_OTA_UPDATE_URL = ''
    $env:TEMP = 'C:\Share\GradleTemp'
    $env:TMP = 'C:\Share\GradleTemp'
    if (-not $SkipPrebuild) {
        & node scripts/devClient.js prebuild
        if ($LASTEXITCODE -ne 0) { throw 'Development client prebuild failed' }
    }
    Set-Location android
    & .\gradlew.bat -g C:\Share\GradleHome --no-daemon --console=plain --max-workers=2 app:assembleDebug "-PreactNativeArchitectures=$Architectures"
    if ($LASTEXITCODE -ne 0) { throw 'Development client build failed' }
    Set-Location $appRoot
    $apk = Join-Path $appRoot 'android/app/build/outputs/apk/debug/app-debug.apk'
    $sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { 'C:\Android\Sdk' }
    $tools = Join-Path $sdk 'build-tools/36.0.0'
    $badging = (& (Join-Path $tools 'aapt.exe') dump badging $apk) -join "`n"
    if ($LASTEXITCODE -ne 0 -or $badging -notmatch "package: name='com.leaderproduct.app.dev'" -or $badging -notmatch 'application-debuggable') { throw 'Expected separate debug development client APK' }
    & (Join-Path $tools 'apksigner.bat') verify $apk
    if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed' }
    $published = Join-Path $appRoot 'dev-builds/development-client'
    New-Item -ItemType Directory -Path $published -Force | Out-Null
    Copy-Item -LiteralPath $apk -Destination (Join-Path $published 'leader-product-dev-client.apk') -Force
    Write-Host "APK: $appRoot\android\app\build\outputs\apk\debug\app-debug.apk"
} finally { Pop-Location }
