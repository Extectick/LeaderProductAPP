param([string]$Architectures = 'arm64-v8a,x86_64', [switch]$Offline)
$ErrorActionPreference = 'Stop'
$appRoot = Split-Path $PSScriptRoot -Parent
$nativeRoot = Join-Path $appRoot 'android'
$files = @('app\build.gradle','app\src\main\AndroidManifest.xml','app\src\main\res\values\strings.xml')
$original = @{}
$signer = Join-Path $nativeRoot 'app\debug.keystore'
$signerHash = (Get-FileHash -LiteralPath $signer -Algorithm SHA256).Hash
$backupRoot = Join-Path $appRoot ('dev-builds\admin-preview\native-backup-' + [DateTimeOffset]::UtcNow.ToString('yyyyMMddTHHmmssZ'))
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
foreach ($name in $files) {
  $full = Join-Path $nativeRoot $name
  $original[$full] = [IO.File]::ReadAllBytes($full)
  [IO.File]::WriteAllBytes((Join-Path $backupRoot ($name -replace '\\','_')), $original[$full])
}
Push-Location $nativeRoot
try {
  $gradlePath = Join-Path $nativeRoot 'app\build.gradle'
  $gradle = [IO.File]::ReadAllText($gradlePath)
  if ($gradle -notmatch "applicationId 'com.leaderproduct.app.dev'") { throw 'Expected existing development native project; run the standard dev prebuild first.' }
  $gradle = $gradle.Replace("applicationId 'com.leaderproduct.app.dev'", "applicationId 'com.leaderproduct.admin.dev'")
  $gradle = $gradle.Replace("apply plugin: 'com.google.gms.google-services'", '// No Firebase account or push in the isolated design fixture.')
  [IO.File]::WriteAllText($gradlePath,$gradle)
  $manifestPath = Join-Path $nativeRoot 'app\src\main\AndroidManifest.xml'
  [IO.File]::WriteAllText($manifestPath,([IO.File]::ReadAllText($manifestPath).Replace('leaderproduct-dev','leaderproduct-admin-dev')))
  $stringsPath = Join-Path $nativeRoot 'app\src\main\res\values\strings.xml'
  [IO.File]::WriteAllText($stringsPath,([regex]::Replace([IO.File]::ReadAllText($stringsPath),'<string name="app_name">[^<]+</string>','<string name="app_name">Администрирование DEV</string>')))
  $env:NODE_ENV='development'; $env:LEADER_DEV_CLIENT='1'; $env:EXPO_PUBLIC_UPDATE_CHANNEL='dev'
  $env:EXPO_PUBLIC_API_URL_DEV='https://dev.lidprod.ru'; $env:EXPO_PUBLIC_OTA_UPDATE_URL=''
  $env:TEMP='C:\Share\GradleTemp'; $env:TMP='C:\Share\GradleTemp'
  $taskJava='C:\Program Files\Microsoft\jdk-17.0.16.8-hotspot'
  if(Test-Path -LiteralPath (Join-Path $taskJava 'bin\java.exe')){$env:JAVA_HOME=$taskJava;$env:PATH=(Join-Path $taskJava 'bin')+';'+$env:PATH}
  $args=@('-g','C:\Share\GradleHome','-I',(Join-Path $PSScriptRoot 'gradle-windows-native.init.gradle'),'--no-daemon','--console=plain','--max-workers=2','app:assembleDebug',"-PreactNativeArchitectures=$Architectures",'-PreactNativeDevServerPort=8110')
  if($Offline){$args=@('--offline')+$args}
  & .\gradlew.bat @args
  if($LASTEXITCODE -ne 0){throw 'Administration preview APK build failed'}
  $output=Join-Path $appRoot 'dev-builds\admin-preview\leader-product-admin-dev.apk'
  Copy-Item -LiteralPath (Join-Path $nativeRoot 'app\build\outputs\apk\debug\app-debug.apk') -Destination $output -Force
  Write-Output "APK: $output"
} finally {
  foreach($full in $original.Keys){[IO.File]::WriteAllBytes($full,$original[$full])}
  Pop-Location
  if((Get-FileHash -LiteralPath $signer -Algorithm SHA256).Hash -ne $signerHash){throw 'Signing key integrity check failed'}
}
