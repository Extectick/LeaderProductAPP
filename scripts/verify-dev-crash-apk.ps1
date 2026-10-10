param([string]$ApkPath = '', [string]$CredentialFile = 'C:\ProgramData\LeaderProduct\GlitchTipDevCloud\credentials.json')
$ErrorActionPreference = 'Stop'
$appRoot = Split-Path $PSScriptRoot -Parent
if (-not $ApkPath) { $ApkPath = Join-Path $appRoot 'android\app\build\outputs\apk\release\app-release.apk' }
$version = Get-Content (Join-Path $appRoot 'app.version.json') -Raw | ConvertFrom-Json
$sdkRoot = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { 'C:\Android\Sdk' }
$buildTools = Join-Path $sdkRoot 'build-tools\36.0.0'
$certificate = & (Join-Path $buildTools 'apksigner.bat') verify --print-certs $ApkPath
if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed' }
if (($certificate -join "`n") -notmatch 'fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c') { throw 'Signature differs from previous dev APK' }
$badging = & (Join-Path $buildTools 'aapt.exe') dump badging $ApkPath
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect APK' }
$info = $badging -join "`n"
$expected = "package: name='com.leaderproduct.app' versionCode='$($version.versionCode)' versionName='$($version.versionName)'"
if (-not $info.Contains($expected) -or $info.Contains('application-debuggable')) { throw 'Unexpected package/version/build type' }
if ($info -notmatch "native-code:.*'arm64-v8a'.*'x86_64'") { throw 'Phone and emulator ABIs required' }
$manifest = (& (Join-Path $buildTools 'aapt.exe') dump xmltree $ApkPath AndroidManifest.xml) -join "`n"
if ($LASTEXITCODE -ne 0 -or -not $manifest.Contains('https://dev.leader-product.ru/ota/update')) { throw 'Wrong OTA endpoint' }
$privateConfig = Get-Content -LiteralPath $CredentialFile -Raw | ConvertFrom-Json
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($ApkPath)
try {
    $bundle = $zip.Entries | Where-Object { $_.FullName -match '^assets/.*(\.bundle|\.hbc)$' } | Select-Object -First 1
    if (-not $bundle) { throw 'No embedded bundle' }
    $stream = $bundle.Open()
    $memory = [System.IO.MemoryStream]::new()
    try { $stream.CopyTo($memory); $bundleText = [System.Text.Encoding]::UTF8.GetString($memory.ToArray()) }
    finally { $stream.Dispose(); $memory.Dispose() }
    if (-not $bundleText.Contains('https://dev.leader-product.ru')) { throw 'Missing dev API' }
    if ($bundleText.Contains('http://192.168.30.244:3000')) { throw 'Local-only API in APK' }
    if (-not $bundleText.Contains([string]$privateConfig.dsn)) { throw 'Missing dev Sentry DSN' }
    foreach ($key in @('authToken','webhookSecret','readToken','adminPassword')) {
        $secret = [string]$privateConfig.$key
        if ($secret -and ($bundleText.Contains($secret) -or $manifest.Contains($secret))) { throw 'Private credential found in APK' }
    }
    [pscustomobject]@{ version=$version.versionName; build=$version.versionCode; channel='dev'; standalone=$true; abis=@('arm64-v8a','x86_64'); signatureMatches=$true; sentryDsnPresent=$true; bytes=(Get-Item -LiteralPath $ApkPath).Length; sha256=(Get-FileHash -LiteralPath $ApkPath -Algorithm SHA256).Hash.ToLowerInvariant() } | ConvertTo-Json
} finally { $zip.Dispose() }
