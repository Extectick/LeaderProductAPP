param(
    [string]$CredentialFile = 'C:\ProgramData\LeaderProduct\GlitchTipDevCloud\credentials.json',
    [string]$DiagnosticsUrl = 'http://127.0.0.1:19020',
    [string]$Architectures = 'arm64-v8a,x86_64',
    [switch]$SkipPrebuild
)
$ErrorActionPreference = 'Stop'
$appRoot = Split-Path $PSScriptRoot -Parent
Push-Location $appRoot
try {
    # Keep existing public feature settings without exporting backend secrets.
    $publicSettings = node -e "const fs=require('fs');const e=require('dotenv').parse(fs.readFileSync('.env'));console.log(JSON.stringify(Object.fromEntries(Object.entries(e).filter(([k])=>k.startsWith('EXPO_PUBLIC_')))))" | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { throw 'Cannot read public application settings' }
    foreach ($setting in $publicSettings.PSObject.Properties) {
        [Environment]::SetEnvironmentVariable($setting.Name, [string]$setting.Value, 'Process')
    }
    $config = Get-Content -LiteralPath $CredentialFile -Raw | ConvertFrom-Json
    $version = Get-Content -LiteralPath app.version.json -Raw | ConvertFrom-Json
    if ([int]$version.versionCode -lt 31) { throw 'Early native crash reporting requires a new runtime/build >= 31' }
    $env:NODE_ENV = 'production'
    $env:BABEL_ENV = 'production'
    $env:EXPO_NO_DOTENV = '1'
    $env:EXPO_PUBLIC_API_URL_DEV = 'https://dev.leader-product.ru'
    $env:EXPO_PUBLIC_UPDATE_CHANNEL = 'dev'
    $env:EXPO_PUBLIC_OTA_UPDATE_URL = 'https://dev.leader-product.ru/ota/update'
    $env:EXPO_PUBLIC_MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'
    $env:EXPO_PUBLIC_SENTRY_ENABLED = 'true'
    $env:EXPO_PUBLIC_SENTRY_DSN = [string]$config.dsn
    $env:EXPO_PUBLIC_SENTRY_ENVIRONMENT = 'development'
    $env:SENTRY_RELEASE = "com.leaderproduct.app@$($version.versionName)+$($version.versionCode)"
    $env:EXPO_PUBLIC_SENTRY_RELEASE = $env:SENTRY_RELEASE
    $env:SENTRY_ALLOW_FAILURE = 'false'
    # Establish a private SSH forward to cloud 127.0.0.1:19002 before running.
    if ($DiagnosticsUrl -notmatch '^http://127\.0\.0\.1:\d+$') { throw 'Private diagnostic tunnel required' }
    Invoke-WebRequest "$DiagnosticsUrl/_health/" -TimeoutSec 10 | Out-Null
    $env:SENTRY_DISABLE_AUTO_UPLOAD = 'true'
    $env:SENTRY_DISABLE_NATIVE_DEBUG_UPLOAD = 'true'
    $env:SENTRY_URL = $DiagnosticsUrl
    $env:SENTRY_ORG = [string]$config.organization
    $env:SENTRY_PROJECT = [string]$config.project
    $env:SENTRY_AUTH_TOKEN = [string]$config.authToken
    $env:SENTRY_READ_TOKEN = [string]$config.readToken
    $env:SENTRY_DIST = [string]$version.versionCode
    $env:TEMP = 'C:\Share\GradleTemp'
    $env:TMP = 'C:\Share\GradleTemp'
    $env:CI = '1'
    & node scripts/checkSentryConfig.js
    if ($LASTEXITCODE -ne 0) { throw 'Invalid Sentry configuration' }
    # Preserve generated native caches; clean prebuild is unnecessary here.
    if (-not $SkipPrebuild) {
        & npx expo prebuild --platform android --no-install
        if ($LASTEXITCODE -ne 0) { throw 'Prebuild failed' }
    }
    & node scripts/verifyNativeDiagnostics.js
    if ($LASTEXITCODE -ne 0) { throw 'Native diagnostic generation is incomplete' }
    Set-Location android
    & .\gradlew.bat -g C:\Share\GradleHome --no-daemon --console=plain --max-workers=2 app:assembleRelease -x lintVitalRelease -x lintRelease "-PreactNativeArchitectures=$Architectures"
    if ($LASTEXITCODE -ne 0) { throw 'Dev APK build or source-map upload failed' }
    Set-Location $appRoot
    foreach ($script in @('uploadCrashSymbols.js','uploadNativeCrashSymbols.js','verifyCrashSymbols.js')) {
        & node "scripts/$script" --apk
        if ($LASTEXITCODE -ne 0) { throw 'Private diagnostic symbol verification failed' }
    }
} finally {
    Remove-Item Env:SENTRY_AUTH_TOKEN -ErrorAction SilentlyContinue
    Remove-Item Env:SENTRY_READ_TOKEN -ErrorAction SilentlyContinue
    Pop-Location
}
