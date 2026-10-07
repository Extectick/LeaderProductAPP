param([Parameter(Mandatory)][string]$ApkPath, [string]$MetadataPath = '')
$ErrorActionPreference = 'Stop'
$appRoot = Split-Path $PSScriptRoot -Parent
$version = Get-Content (Join-Path $appRoot 'app.version.json') -Raw | ConvertFrom-Json
$sdkRoot = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { 'C:\Android\Sdk' }
$buildTools = Join-Path $sdkRoot 'build-tools\36.0.0'
$certificate = & (Join-Path $buildTools 'apksigner.bat') verify --print-certs $ApkPath
if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed' }
# Preserve upgrade compatibility with installed production APKs; do not replace
# this certificate casually, as that would strand their local SQLite drafts.
if (($certificate -join "`n") -notmatch 'fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c') { throw 'Signature differs from installed production APK' }
$badging = & (Join-Path $buildTools 'aapt.exe') dump badging $ApkPath
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect APK' }
$info = $badging -join "`n"
if (-not $info.Contains("package: name='com.leaderproduct.app' versionCode='$($version.versionCode)' versionName='$($version.versionName)'")) { throw 'Wrong package or version' }
if ($info.Contains('application-debuggable')) { throw 'Production APK must not be debuggable' }
if ($info -notmatch "native-code:.*'arm64-v8a'.*'x86_64'") { throw 'Phone and emulator ABIs are required' }
$manifest = (& (Join-Path $buildTools 'aapt.exe') dump xmltree $ApkPath AndroidManifest.xml) -join "`n"
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect manifest' }
foreach ($required in @('https://api.leader-product.ru/ota/update','expo-channel-name','prod','FOREGROUND_SERVICE_LOCATION','ACCESS_BACKGROUND_LOCATION','RECEIVE_BOOT_COMPLETED')) {
    if (-not $manifest.Contains($required)) { throw "Missing manifest setting: $required" }
}
if ($manifest.Contains('https://dev.leader-product.ru/ota/update')) { throw 'Dev OTA endpoint in production APK' }
$privateConfig = Get-Content -LiteralPath 'C:\ProgramData\LeaderProduct\GlitchTipProd\credentials.json' -Raw | ConvertFrom-Json
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $ApkPath).Path)
try {
    $bundle = $zip.Entries | Where-Object { $_.FullName -match '^assets/.*(\.bundle|\.hbc)$' } | Select-Object -First 1
    if (-not $bundle) { throw 'Missing embedded JS bundle' }
    $stream = $bundle.Open(); $memory = [System.IO.MemoryStream]::new()
    try { $stream.CopyTo($memory); $text = [System.Text.Encoding]::UTF8.GetString($memory.ToArray()) }
    finally { $stream.Dispose(); $memory.Dispose() }
    foreach ($required in @('https://api.leader-product.ru','https://tiles.openfreemap.org/styles/liberty',[string]$privateConfig.dsn)) {
        if (-not $text.Contains($required)) { throw 'Production API/map/diagnostic configuration missing from bundle' }
    }
    if ($text.Contains('https://dev.leader-product.ru') -or $text.Contains('http://192.168.30.244:3000')) { throw 'Development API found in production bundle' }
    foreach ($key in @('authToken','readToken','adminPassword')) {
        $secret = [string]$privateConfig.$key
        if ($secret -and ($text.Contains($secret) -or $manifest.Contains($secret))) { throw 'Private credential found in APK' }
    }
    $hash=(Get-FileHash -LiteralPath $ApkPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($MetadataPath) {
        $metadata=Get-Content -LiteralPath $MetadataPath -Raw | ConvertFrom-Json
        if ($metadata.checksum -ne $hash -or $metadata.channel -ne 'prod' -or $metadata.versionCode -ne $version.versionCode) { throw 'Release metadata mismatch' }
    }
    [pscustomobject]@{version=$version.versionName;build=$version.versionCode;channel='prod';signatureMatches=$true;standalone=$true;bytes=(Get-Item -LiteralPath $ApkPath).Length;sha256=$hash} | ConvertTo-Json
} finally { $zip.Dispose() }
