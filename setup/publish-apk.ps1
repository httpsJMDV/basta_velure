# Builds the signed release APK and prepares the local download files. Run from anywhere:
#   powershell -ExecutionPolicy Bypass -File C:\Projects\basta_velure\setup\publish-apk.ps1
# Upload these files to the active download host separately. See setup/mobile.md.
$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
$mobile = Join-Path $repo 'mobile'
$frontend = Join-Path $repo 'frontend'

if (-not (Test-Path (Join-Path $mobile 'android\key.properties'))) {
    Write-Output 'Stopped: mobile\android\key.properties is missing, so the APK would not be signed with the release key. See setup/mobile.md.'
    exit 1
}
if (-not (Test-Path (Join-Path $mobile 'dart_defines\prod.json'))) {
    Write-Output 'Stopped: mobile\dart_defines\prod.json is missing. See setup/mobile.md.'
    exit 1
}

# Each build gets a higher number than the last, so it installs over the old one.
$build = Get-Date -Format 'yyMMddHH'
Set-Location $mobile
Write-Output "Building version $build. This takes about 5 minutes..."
# This PC also runs the live site, and the project's default lets Gradle take 8 GB of its 16. Only phones get this APK,
# so the x64 build, which emulators use, is left out too.
$env:GRADLE_OPTS = '"-Dorg.gradle.jvmargs=-Xmx3G -XX:MaxMetaspaceSize=1G -XX:ReservedCodeCacheSize=256m"'
flutter build apk --release --target-platform android-arm,android-arm64 --obfuscate --split-debug-info=build/symbols --build-number=$build --dart-define-from-file=dart_defines/prod.json
$built = $LASTEXITCODE
# Gradle would otherwise stay in memory for hours.
if (-not $env:JAVA_HOME) { $env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr' }
& (Join-Path $mobile 'android\gradlew.bat') --stop *> $null
if ($built -ne 0) {
    Write-Output 'The build failed, so nothing was published.'
    exit 1
}
$apk = Join-Path $mobile 'build\app\outputs\flutter-apk\app-release.apk'
$sizeMb = [math]::Round((Get-Item $apk).Length / 1MB)
# Use immutable object names: the storage CDN can retain an older canonical version.json or APK.
$redirectFile = Join-Path $frontend 'public\_redirects'
$redirectText = [IO.File]::ReadAllText($redirectFile)
$bucketMatch = [regex]::Match($redirectText, 'https://[^/\s]+\.laravel\.cloud')
$releaseLink = "/download/loved-it.apk?v=$build"
if ($bucketMatch.Success) {
    $bucketBase = $bucketMatch.Value
    $releaseLink = "$bucketBase/download/loved-it-$build.apk"
    $redirectText = [regex]::Replace($redirectText, '(?m)^/download/version\.json\s+\S+\s+302\r?$', "/download/version.json $bucketBase/download/releases/$build/version.json 302")
    $redirectText = [regex]::Replace($redirectText, '(?m)^/download/loved-it\.apk\s+\S+\s+302\r?$', "/download/loved-it.apk $releaseLink 302")
    [IO.File]::WriteAllText($redirectFile, $redirectText, (New-Object Text.UTF8Encoding($false)))
}
# What the download page shows (frontend/src/pages/DownloadPage.tsx). Cloudflare keeps the APK for hours, so every
# publish needs its own link. To the minute: Android's build number can't hold that many digits, and two publishes in
# one hour would otherwise share a link.
$versionName = ((Select-String -Path (Join-Path $mobile 'pubspec.yaml') -Pattern '^version:\s*([^+\s]+)').Matches[0].Groups[1].Value)
$release = [ordered]@{
    version   = $versionName
    build     = $build
    link      = $releaseLink
    size_mb   = $sizeMb
    published = Get-Date -Format 'yyyy-MM-dd'
    sha256    = (Get-FileHash $apk -Algorithm SHA256).Hash.ToLower()
} | ConvertTo-Json

# public/ keeps it across website builds (git ignores the APK); dist/ is what the live site serves right now.
foreach ($folder in @((Join-Path $frontend 'public'), (Join-Path $frontend 'dist'))) {
    if (-not (Test-Path $folder)) { continue }
    $download = Join-Path $folder 'download'
    New-Item -ItemType Directory -Force $download | Out-Null
    Copy-Item $apk (Join-Path $download 'loved-it.apk') -Force
    [IO.File]::WriteAllText((Join-Path $download 'version.json'), $release, (New-Object Text.UTF8Encoding($false)))
}
Write-Output "Prepared version $build ($sizeMb MB) in frontend/public/download and frontend/dist/download (if present)."
Write-Output 'Upload the APK and version.json to the active download host, then verify its version and SHA-256 before calling the release live.'
Write-Output "Object names: download/loved-it-$build.apk and download/releases/$build/version.json. Publish the updated frontend redirects after uploading and verifying those objects."
